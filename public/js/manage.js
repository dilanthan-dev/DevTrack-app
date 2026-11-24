// Manage data page: full CRUD for every entity, built from the field definitions served by /api/meta.
// Features: live keyword search, filters (status, project, developer...), date range, sorting, paging,
// dynamic add/edit forms with client-side validation, auto-fill suggestions, CSV/PDF export.

let META, USER, KEY, E;
const state = { q: '', filters: {}, from: '', to: '', sort: '', dir: 'asc', offset: 0, limit: 25, total: 0 };
const lookups = {};

async function lookup(entity) {
  if (!lookups[entity]) lookups[entity] = api('/api/lookup/' + entity).catch(() => []);
  return lookups[entity];
}

const rowId = (r) => E.pk.map((k) => r[k]).join('-');

function queryString(extra = {}) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  for (const [k, v] of Object.entries(state.filters)) if (v) p.set(k, v);
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  if (state.sort) { p.set('sort', state.sort); p.set('dir', state.dir); }
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

// ---------- toolbar ----------
async function buildToolbar() {
  const tb = document.getElementById('toolbar');
  const parts = [`<div class="grow"><label>Search</label><input id="q" placeholder="Keyword or ID..." value="${esc(state.q)}"></div>`];
  for (const name of E.filters) {
    const f = E.fields.find((x) => x.name === name);
    let opts;
    if (f.type === 'enum') opts = f.options.map((o) => `<option>${esc(o)}</option>`).join('');
    else opts = (await lookup(f.ref)).map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('') + (f.required ? '' : '<option value="null">(none)</option>');
    parts.push(`<div><label>${esc(f.label)}</label><select data-filter="${name}"><option value="">All</option>${opts}</select></div>`);
  }
  if (E.hasDate) parts.push('<div><label for="from">Date range</label><div class="range"><input type="date" id="from" aria-label="From date"><span>to</span><input type="date" id="to" aria-label="To date"></div></div>');
  parts.push('<div class="actions-group"><button id="clear">Clear filters</button><a class="btn" id="csv">Export CSV</a><a class="btn" id="pdf">Export PDF</a></div>');
  tb.innerHTML = parts.join('');

  document.getElementById('q').oninput = debounce((e) => { state.q = e.target.value.trim(); state.offset = 0; loadList(); }, 300);
  tb.querySelectorAll('[data-filter]').forEach((s) => { s.onchange = () => { state.filters[s.dataset.filter] = s.value; state.offset = 0; loadList(); }; });
  if (E.hasDate) {
    document.getElementById('from').onchange = (e) => { state.from = e.target.value; state.offset = 0; loadList(); };
    document.getElementById('to').onchange = (e) => { state.to = e.target.value; state.offset = 0; loadList(); };
  }
  document.getElementById('clear').onclick = () => { Object.assign(state, { q: '', filters: {}, from: '', to: '', sort: '', offset: 0 }); buildToolbar(); loadList(); };
}

// ---------- list ----------
async function loadList() {
  const tableEl = document.getElementById('table');
  document.getElementById('csv').href = `/api/export/data/${KEY}.csv?${queryString()}`;
  document.getElementById('pdf').href = `/api/export/data/${KEY}.pdf?${queryString()}`;
  try {
    const data = await api(`/api/${KEY}?${queryString({ limit: state.limit, offset: state.offset })}`);
    state.total = data.total;
    renderTable(tableEl, data.rows, {
      columns: E.columns, sort: state.sort, dir: state.dir,
      onSort: (c) => { state.dir = state.sort === c && state.dir === 'asc' ? 'desc' : 'asc'; state.sort = c; loadList(); },
      actions: (E.canWrite || E.canDelete) ? (r) =>
        (E.canWrite && !(KEY === 'timelogs' && USER.role === 'user' && r.developer_id !== USER.developer_id) ? `<button class="btn-sm" data-edit="${rowId(r)}">Edit</button> ` : '') +
        (E.canDelete ? `<button class="btn-sm btn-danger" data-del="${rowId(r)}">Delete</button>` : '') : null,
    });
    tableEl.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openForm(b.dataset.edit); });
    tableEl.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => remove(b.dataset.del); });
    const end = Math.min(state.offset + data.rows.length, state.total);
    document.getElementById('count').textContent = state.total ? `Showing ${state.offset + 1}–${end} of ${state.total}` : '';
    document.getElementById('prev').disabled = state.offset === 0;
    document.getElementById('next').disabled = end >= state.total;
  } catch (err) { showError(tableEl, err); }
}

async function remove(id) {
  if (!confirm(`Delete this ${E.singular.toLowerCase()}? This cannot be undone.`)) return;
  try {
    const r = await api(`/api/${KEY}/${id}`, { method: 'DELETE' });
    toast(r.message, 'success');
    delete lookups[KEY];
    loadList();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- form ----------
let editing = null;

// Client-side validation, same rules as the server (the server checks again).
function checkField(f, el) {
  const v = el.type === 'checkbox' ? el.checked : el.value.trim();
  const required = f.required || (f.requiredOnCreate && !editing);
  if (v === '' || v === null) return required ? `${f.label} is required.` : '';
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email, like name@example.com.';
  if ((f.type === 'string' || f.type === 'text' || f.type === 'password')) {
    if (f.max && v.length > f.max) return `At most ${f.max} characters.`;
    if (f.min && v.length < f.min) return `At least ${f.min} characters.`;
    if (f.pattern && !new RegExp(f.pattern).test(v)) return `${f.label}: ${f.patternMsg}.`;
  }
  if (f.type === 'decimal') {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Must be a number.';
    if (f.min !== undefined && n < f.min) return `Must be at least ${f.min}.`;
    if (f.max !== undefined && n > f.max) return `Must be at most ${f.max}.`;
  }
  if (f.type === 'date' && f.notFuture && v > new Date().toISOString().slice(0, 10)) return 'Cannot be in the future.';
  return '';
}

function setFieldError(name, msg) {
  const box = document.querySelector(`[data-field="${name}"]`);
  if (!box) return;
  box.classList.toggle('invalid', !!msg);
  box.classList.toggle('valid', !msg && box.querySelector('input,select,textarea').value !== '');
  box.querySelector('.err').textContent = msg || '';
}

function crossRules() {
  const val = (n) => document.getElementById('in-' + n)?.value;
  if (KEY === 'projects' && val('due_date') && val('start_date') && val('due_date') < val('start_date')) return ['due_date', 'Due date must be on or after the start date.'];
  if (KEY === 'invoices' && val('due_date') && val('issue_date') && val('due_date') < val('issue_date')) return ['due_date', 'Due date must be on or after the issue date.'];
  return null;
}

async function fieldHtml(f) {
  const id = 'in-' + f.name;
  const star = (f.required || (f.requiredOnCreate && !editing)) ? ' <span class="req">*</span>' : '';
  let input;
  switch (f.type) {
    case 'enum':
      input = `<select id="${id}">${f.required ? '' : '<option value="">(none)</option>'}${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`; break;
    case 'fk': {
      const opts = await lookup(f.ref);
      input = `<select id="${id}"><option value="">${f.required ? 'Select...' : '(none)'}</option>${opts.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</select>`; break;
    }
    case 'bool': return `<div class="field" data-field="${f.name}"><label class="check"><input type="checkbox" id="${id}"> ${esc(f.label)}</label><div class="err"></div></div>`;
    case 'text': input = `<textarea id="${id}" rows="2" maxlength="${f.max || ''}"></textarea>`; break;
    case 'date': input = `<input type="date" id="${id}">`; break;
    case 'decimal': input = `<input type="number" step="0.01" id="${id}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}>`; break;
    case 'email': input = `<input type="email" id="${id}" maxlength="${f.max}" placeholder="name@example.com">`; break;
    case 'password': input = `<input type="password" id="${id}" autocomplete="new-password" placeholder="${editing ? 'Leave blank to keep the current password' : 'At least 6 characters'}">`; break;
    default: input = `<input id="${id}" maxlength="${f.max || ''}" ${f.suggest ? `list="dl-${f.suggest}" autocomplete="off"` : ''}>`;
  }
  const full = f.type === 'text' || f.name === 'title' || f.name === 'name' ? ' full' : '';
  return `<div class="field${full}" data-field="${f.name}"><label for="${id}">${esc(f.label)}${star}</label>${input}<div class="err"></div></div>`;
}

// Auto-fill suggestions from data already in the database (datalists) and smart defaults.
async function fillSuggestions() {
  if (KEY === 'clients') {
    const { rows } = await api('/api/clients?limit=500');
    document.getElementById('dl-city').innerHTML = [...new Set(rows.map((r) => r.city).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('');
  }
  if (KEY === 'timelogs') {
    const { rows } = await api('/api/timelogs?limit=200');
    document.getElementById('dl-note').innerHTML = [...new Set(rows.map((r) => r.note).filter(Boolean))].slice(0, 40).map((c) => `<option value="${esc(c)}">`).join('');
  }
}

function wireAutofill() {
  const el = (n) => document.getElementById('in-' + n);
  // Choosing a task in a time log fills in the developer assigned to that task.
  if (KEY === 'timelogs' && el('task_id')) {
    el('task_id').addEventListener('change', async (e) => {
      if (!e.target.value || USER.role === 'user') return;
      const t = await api('/api/tasks/' + e.target.value).catch(() => null);
      if (t && t.assigned_to && !el('developer_id').value) { el('developer_id').value = t.assigned_to; toast(`Developer filled in from the task: ${t.developer}.`); }
    });
  }
  // Choosing a project for a new task or invoice suggests the project's due date.
  if ((KEY === 'tasks' || KEY === 'invoices') && el('project_id')) {
    el('project_id').addEventListener('change', async (e) => {
      if (!e.target.value || el('due_date').value) return;
      const p = await api('/api/projects/' + e.target.value).catch(() => null);
      if (p) { el('due_date').value = KEY === 'tasks' ? p.due_date : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10); setFieldError('due_date', ''); }
    });
  }
}

async function openForm(id = null) {
  editing = id;
  document.getElementById('form-title').textContent = `${id ? 'Edit' : 'Add'} ${E.singular.toLowerCase()}`;
  document.getElementById('form-msg').innerHTML = '';
  const fields = E.fields;
  document.getElementById('fields').innerHTML = (await Promise.all(fields.map(fieldHtml))).join('');

  let record = {};
  if (id) {
    try { record = await api(`/api/${KEY}/${id}`); } catch (err) { toast(err.message, 'error'); return; }
  }
  for (const f of fields) {
    const el = document.getElementById('in-' + f.name);
    const v = id ? record[f.name] : f.default;
    if (f.type === 'bool') el.checked = id ? !!v : v !== false;
    else if (v !== undefined && v !== null && f.type !== 'password') el.value = v;
    if (id && f.key) el.disabled = true; // primary key parts cannot change
    // A developer can only log time for themselves.
    if (KEY === 'timelogs' && f.name === 'developer_id' && USER.role === 'user') { el.value = USER.developer_id; el.disabled = true; }
    el.addEventListener('blur', () => setFieldError(f.name, checkField(f, el)));
    el.addEventListener('input', () => { if (document.querySelector(`[data-field="${f.name}"]`).classList.contains('invalid')) setFieldError(f.name, checkField(f, el)); });
  }
  wireAutofill();
  fillSuggestions().catch(() => {});
  document.getElementById('modal').classList.add('open');
  document.querySelector('#fields input:not([disabled]), #fields select:not([disabled])')?.focus();
}

function closeForm() { document.getElementById('modal').classList.remove('open'); }

async function save(e) {
  e.preventDefault();
  const body = {};
  let ok = true;
  for (const f of E.fields) {
    const el = document.getElementById('in-' + f.name);
    const err = checkField(f, el);
    setFieldError(f.name, err);
    if (err) ok = false;
    if (el.disabled && editing) continue;
    if (f.type === 'password' && !el.value) continue;
    body[f.name] = f.type === 'bool' ? el.checked : el.value.trim();
  }
  const cross = crossRules();
  if (cross) { setFieldError(cross[0], cross[1]); ok = false; }
  if (!ok) { document.getElementById('form-msg').innerHTML = '<div class="banner error">Please fix the highlighted fields.</div>'; return; }

  const btn = document.getElementById('save');
  btn.disabled = true;
  try {
    const r = editing
      ? await api(`/api/${KEY}/${editing}`, { method: 'PUT', body })
      : await api(`/api/${KEY}`, { method: 'POST', body });
    toast(r.message, 'success');
    delete lookups[KEY];
    closeForm();
    loadList();
  } catch (err) {
    document.getElementById('form-msg').innerHTML = `<div class="banner error">${esc(err.message)}</div>`;
    for (const [name, msg] of Object.entries(err.details || {})) setFieldError(name, msg);
  } finally { btn.disabled = false; }
}

// ---------- page setup ----------
async function selectEntity(key) {
  KEY = key; E = META.entities[key];
  Object.assign(state, { q: '', filters: {}, from: '', to: '', sort: '', offset: 0 });
  history.replaceState(null, '', '?e=' + key);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  document.getElementById('heading').textContent = E.label;
  const add = document.getElementById('add');
  add.style.display = E.canWrite ? '' : 'none';
  add.textContent = `+ Add ${E.singular.toLowerCase()}`;
  await buildToolbar();
  loadList();
}

initLayout().then(async (meta) => {
  META = meta; USER = meta.user;
  const keys = Object.keys(meta.entities);
  document.getElementById('tabs').innerHTML = keys.map((k) => `<button data-key="${k}">${esc(meta.entities[k].label)}</button>`).join('');
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => selectEntity(b.dataset.key); });
  document.getElementById('add').onclick = () => openForm();
  document.getElementById('close').onclick = closeForm;
  document.getElementById('cancel').onclick = closeForm;
  document.getElementById('form').onsubmit = save;
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeForm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeForm(); });
  document.getElementById('prev').onclick = () => { state.offset = Math.max(0, state.offset - state.limit); loadList(); };
  document.getElementById('next').onclick = () => { state.offset += state.limit; loadList(); };
  const want = new URLSearchParams(location.search).get('e');
  selectEntity(keys.includes(want) ? want : keys[0]);
}).catch((e) => showError(document.getElementById('msg'), e));
