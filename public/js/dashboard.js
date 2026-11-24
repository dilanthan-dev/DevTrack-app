// Dashboard: KPI cards and Chart.js charts, loaded with AJAX from /api/stats (which reads the MySQL views).
// Chart colours come from the CSS theme variables, so they follow the light/dark switch.
const charts = {};
const themeColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const wholeMoney = (n) => '$' + Math.round(Number(n)).toLocaleString('en-CA');

function chart(id, config) {
  if (charts[id]) charts[id].destroy();
  const muted = themeColor('--muted');
  const line = themeColor('--line');
  const font = { family: "'Manrope', 'Segoe UI', sans-serif", size: 13 };
  const hasAxes = config.type !== 'doughnut' && config.type !== 'pie';

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    color: muted,
    font,
    ...config.options,
    plugins: {
      legend: { position: 'bottom', labels: { color: muted, font, usePointStyle: true, boxWidth: 8, padding: 18 } },
      tooltip: { bodyFont: font, titleFont: { ...font, weight: 700 } },
      ...config.options?.plugins,
    },
  };
  // Only bar and line charts get x/y axes. A doughnut must not have any.
  if (hasAxes) {
    const custom = config.options?.scales || {};
    options.scales = {};
    for (const axis of ['x', 'y']) {
      options.scales[axis] = {
        ...custom[axis],
        ticks: { color: muted, font, ...custom[axis]?.ticks },
        grid: { color: line, ...custom[axis]?.grid },
        border: { color: line },
      };
    }
  } else {
    delete options.scales;
  }
  charts[id] = new Chart(document.getElementById(id), { ...config, options });
}

async function load() {
  const msg = document.getElementById('msg');
  msg.innerHTML = '';
  try {
    const s = await api('/api/stats');
    const k = s.kpi;
    const cards = [
      ['Active projects', k.active_projects],
      ['Open tasks', k.open_tasks],
      ['Overdue tasks', k.overdue_tasks, k.overdue_tasks > 0],
      ['Hours, last 30 days', k.hours_30d],
    ];
    if (k.unpaid_amount !== undefined) cards.push(['Unpaid invoices', wholeMoney(k.unpaid_amount), k.unpaid_amount > 0]);
    document.getElementById('kpis').innerHTML = cards.map(([l, v, alert]) =>
      `<div class="card kpi ${alert ? 'alert' : ''}"><div class="label">${l}</div><div class="value">${esc(v)}</div></div>`).join('');

    if (typeof Chart === 'undefined') {
      msg.innerHTML = '<div class="banner error">Chart.js did not load. Run npm install again.</div>';
    } else {
      const teal = themeColor('--teal'), amber = themeColor('--chart-2'), blue = themeColor('--blue');
      const ok = themeColor('--ok'), warn = themeColor('--warn'), grey = themeColor('--faint'), card = themeColor('--card');

      chart('c-monthly', {
        type: 'line',
        data: { labels: s.monthly.map((m) => m.month), datasets: [
          { label: 'Total hours', data: s.monthly.map((m) => m.total_hours), borderColor: teal, backgroundColor: `color-mix(in srgb, ${teal} 16%, transparent)`, fill: true, tension: .3, borderWidth: 2.5, pointRadius: 3 },
          { label: 'Billable hours', data: s.monthly.map((m) => m.billable_hours), borderColor: amber, backgroundColor: amber, borderDash: [7, 5], borderWidth: 2.5, tension: .3, pointRadius: 3, pointStyle: 'rectRot' },
        ] },
        options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours', color: themeColor('--muted') } }, x: { ticks: { maxRotation: 0, autoSkipPadding: 12 } } } },
      });
      chart('c-status', {
        type: 'doughnut',
        data: { labels: s.taskStatus.map((t) => t.status), datasets: [{ data: s.taskStatus.map((t) => t.n), backgroundColor: [grey, teal, warn, ok], borderColor: card, borderWidth: 3 }] },
        options: { cutout: '62%', plugins: { legend: { position: 'right' } } },
      });
      chart('c-devs', {
        type: 'bar',
        data: { labels: s.devHours.map((d) => d.developer), datasets: [{ label: 'Hours', data: s.devHours.map((d) => d.hours), backgroundColor: teal, borderRadius: 4, barThickness: 22 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Hours logged', color: themeColor('--muted') } }, y: { grid: { display: false } } } },
      });
      if (s.financials) {
        chart('c-fin', {
          type: 'bar',
          data: { labels: s.financials.map((f) => f.project_name), datasets: [
            { label: 'Budget', data: s.financials.map((f) => f.budget), backgroundColor: `color-mix(in srgb, ${blue} 55%, transparent)`, borderRadius: 3 },
            { label: 'Labour cost', data: s.financials.map((f) => f.labour_cost), backgroundColor: amber, borderRadius: 3 },
            { label: 'Invoiced', data: s.financials.map((f) => f.invoiced), backgroundColor: teal, borderRadius: 3 },
          ] },
          options: { interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: (v) => '$' + v / 1000 + 'k' } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback(v) { const l = this.getLabelForValue(v); return l.length > 16 ? l.split(' ').reduce((rows, w) => { const last = rows[rows.length - 1]; if (last && (last + ' ' + w).length <= 16) rows[rows.length - 1] = last + ' ' + w; else rows.push(w); return rows; }, []) : l; } } } } },
        });
      } else {
        document.getElementById('fin-card').style.display = 'none';
      }
    }
    renderTable(document.getElementById('overdue'), s.overdue, { columns: ['title', 'project_name', 'assigned_to', 'priority', 'due_date', 'days_overdue'] });
  } catch (err) {
    showError(msg, err);
  }
}

initLayout().then((meta) => {
  document.getElementById('hello').textContent = `Welcome back, ${meta.user.name}.`;
  document.getElementById('refresh').onclick = load;
  load();
}).catch((e) => showError(document.getElementById('msg'), e));
document.addEventListener('devtrack-theme-change', load);
