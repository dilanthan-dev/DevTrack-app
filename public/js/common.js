// Shared helpers used by every page: Fetch API wrapper, sidebar, toasts, table rendering.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('devtrack-theme') || 'dark'; } catch { /* storage blocked: use dark */ }
document.documentElement.dataset.theme = savedTheme;
// The button names the action it performs: in dark mode it offers light mode, and the reverse.
function themeButtonLabel() {
  return document.documentElement.dataset.theme === 'dark'
    ? '<span class="sym" aria-hidden="true">☀</span>Light mode'
    : '<span class="sym" aria-hidden="true">☾</span>Dark mode';
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('devtrack-theme', theme); } catch { /* storage blocked: theme lasts until reload */ }
  document.dispatchEvent(new CustomEvent('devtrack-theme-change', { detail: theme }));
}

// AJAX helper: sends/receives JSON, throws an Error with the server's message and field details.
async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', headers: {}, ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('Cannot reach the DevTrack server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/login')) { location.href = '/login.html'; throw new Error('Session expired.'); }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.details = data.details; err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}

// ---------- sidebar ----------
const NAV = [
  { href: '/dashboard.html', label: 'Dashboard', ico: '◫', roles: ['admin', 'user'] },
  { href: '/views.html', label: 'Reports', ico: '◷', roles: ['admin', 'user'] },
  { href: '/manage.html', label: 'Manage data', ico: '⌘', roles: ['admin', 'user'] },
  { href: '/search.html', label: 'Task search', ico: '⌕', roles: ['admin', 'user'] },
  { href: '/github.html', label: 'GitHub', ico: '⌥', roles: ['admin', 'user'] },
  { href: '/portal.html', label: 'My projects', ico: '◉', roles: ['guest'] },
];

async function initLayout() {
  const meta = await api('/api/meta');
  const u = meta.user;
  const here = location.pathname;
  const side = document.getElementById('sidebar');
  side.innerHTML = `
    <div class="brand"><img class="brand-mark" src="/favicon.png" alt="DevTrack logo">DevTrack</div>
    <nav class="nav">${NAV.filter((n) => n.roles.includes(u.role)).map((n) =>
      `<a href="${n.href}" class="${here === n.href ? 'active' : ''}"${here === n.href ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}</nav>
    <div class="spacer"></div>
    <button class="theme-btn" id="theme-toggle" type="button">${themeButtonLabel()}</button>
    <div class="userbox">
      <div class="name">${esc(u.name)}</div>
      <div class="muted small">@${esc(u.username)}</div>
      <span class="role-pill">${esc(u.role)}</span>
      <button id="logout">Log out</button>
    </div>`;
  document.getElementById('logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login.html';
  };
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.onclick = () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    themeBtn.innerHTML = themeButtonLabel();
  };
  return meta;
}

// ---------- table rendering ----------
const MONEY = new Set(['budget', 'amount', 'labour_cost', 'invoiced', 'paid', 'budget_remaining', 'hourly_rate', 'unpaid_amount']);
const BADGES = {
  status: { Done: 'ok', Completed: 'ok', Paid: 'ok', 'In Progress': '', 'In Review': 'warn', 'To Do': 'grey', Planning: 'grey', 'On Hold': 'warn', Cancelled: 'bad', Overdue: 'bad', Sent: 'warn', Draft: 'grey' },
  priority: { Critical: 'bad', High: 'warn', Medium: '', Low: 'grey' },
  role: { admin: 'bad', user: '', guest: 'grey' },
};
const money = (n) => '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pretty = (col) => col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function cell(col, v) {
  if (v === null || v === undefined) return '<td class="null">NULL</td>';
  if (BADGES[col] && BADGES[col][v] !== undefined) return `<td><span class="badge ${BADGES[col][v]}">${esc(v)}</span></td>`;
  if (col === 'billable' || col === 'is_private') return `<td>${v ? 'Yes' : 'No'}</td>`;
  if (MONEY.has(col)) return `<td class="num">${money(v)}</td>`;
  if (typeof v === 'number') return `<td class="num">${v}</td>`;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return `<td style="white-space:nowrap">${esc(v)}</td>`;
  if (col === 'url' || col === 'html_url') return `<td><a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a></td>`;
  return `<td>${esc(v)}</td>`;
}

// rows: array of objects. opts: { columns, actions(row) -> html, onSort(col), sort, dir }
function renderTable(el, rows, opts = {}) {
  if (!rows.length) { el.innerHTML = '<div class="empty">No records match.</div>'; return; }
  const cols = opts.columns || Object.keys(rows[0]);
  const arrow = (c) => (opts.sort === c ? (opts.dir === 'desc' ? ' ▼' : ' ▲') : '');
  el.innerHTML = `<table><thead><tr>${cols.map((c) =>
    `<th class="${opts.onSort ? 'sortable' : ''}" data-col="${c}">${pretty(c)}${arrow(c)}</th>`).join('')}${opts.actions ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-i="${i}">${cols.map((c) => cell(c, r[c])).join('')}${opts.actions ? `<td class="actions">${opts.actions(r)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  if (opts.onSort) el.querySelectorAll('th.sortable').forEach((th) => { th.onclick = () => opts.onSort(th.dataset.col); });
}

function showError(el, err) {
  el.innerHTML = `<div class="banner error">${esc(err.message)}</div>`;
}
