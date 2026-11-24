// The 10 views from Phase II, exposed as a JSON web service:
//   GET /api/views          list of views the current role may run
//   GET /api/views/:key     rows of one view
const express = require('express');
const { query } = require('../db');
const { AppError, wrap } = require('../errors');
const { requireRole } = require('../auth');

// Whitelist: only these view names can ever be queried.
const VIEWS = [
  { key: 'v1_project_team', title: 'Project teams', type: 'Join of 3+ tables', desc: 'Every project with its client and each developer assigned to it, with their role.', roles: ['admin', 'user'] },
  { key: 'v2_active_projects_above_completed', title: 'Active projects above a completed project', type: 'Nested query with ANY + GROUP BY', desc: 'Unfinished projects that have already logged more hours than at least one completed project used in total.', roles: ['admin', 'user'] },
  { key: 'v3_tasks_over_estimate', title: 'Tasks over estimate', type: 'Correlated nested query', desc: 'Tasks whose logged hours are higher than the original estimate.', roles: ['admin', 'user'] },
  { key: 'v4_developer_task_full', title: 'Developer workload', type: 'FULL JOIN', desc: 'Every developer and every task, including idle developers and unassigned tasks.', roles: ['admin', 'user'] },
  { key: 'v5_follow_up_list', title: 'Follow-up list', type: 'Nested queries + UNION', desc: 'Developers with overdue tasks and leads of projects with overdue invoices.', roles: ['admin', 'user'] },
  { key: 'v6_project_financials', title: 'Project financials', type: 'Derived tables + LEFT JOIN', desc: 'Budget, billable labour cost, amount invoiced and amount paid for each project.', roles: ['admin'] },
  { key: 'v7_overdue_tasks', title: 'Overdue tasks', type: 'Date filtering', desc: 'Unfinished tasks past their due date, with days overdue.', roles: ['admin', 'user'] },
  { key: 'v8_monthly_hours', title: 'Monthly hours', type: 'GROUP BY month', desc: 'Total and billable hours per developer per month.', roles: ['admin', 'user'] },
  { key: 'v9_unpaid_invoices', title: 'Unpaid invoices', type: 'Join + date math', desc: 'Invoices not yet paid, with days past due.', roles: ['admin'] },
  { key: 'v10_repo_activity', title: 'GitHub activity', type: 'Aggregation over imported API data', desc: 'Commits, contributors and lines changed per repository (data saved from the GitHub API).', roles: ['admin', 'user'] },
];

function findView(key, role) {
  const v = VIEWS.find((x) => x.key === key);
  if (!v) throw new AppError(404, `Unknown view "${key}".`);
  if (!v.roles.includes(role)) throw new AppError(403, 'Your role cannot run this view.');
  return v;
}

async function runView(key, role) {
  const v = findView(key, role);
  const rows = await query(`SELECT * FROM \`${v.key}\``);
  return { view: v, rows };
}

const router = express.Router();
router.use(requireRole('admin', 'user'));

router.get('/', (req, res) => {
  res.json(VIEWS.filter((v) => v.roles.includes(req.session.user.role)).map(({ roles, ...v }) => v));
});

router.get('/:key', wrap(async (req, res) => {
  const { view, rows } = await runView(req.params.key, req.session.user.role);
  const { roles, ...info } = view;
  res.json({ view: info, rows });
}));

module.exports = { router, runView, VIEWS };
