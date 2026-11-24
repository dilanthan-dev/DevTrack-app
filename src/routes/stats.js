// JSON endpoints for the dashboard charts and the client portal.
//   GET /api/stats    dashboard numbers and chart data (admin, user)
//   GET /api/portal   a client's own projects, tasks and invoices (guest)
const express = require('express');
const { query } = require('../db');
const { AppError, wrap } = require('../errors');
const { requireRole } = require('../auth');

const router = express.Router();

router.get('/stats', requireRole('admin', 'user'), wrap(async (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const [kpi] = await query(`SELECT
      (SELECT COUNT(*) FROM Project WHERE status = 'In Progress') AS active_projects,
      (SELECT COUNT(*) FROM Task WHERE status <> 'Done') AS open_tasks,
      (SELECT COUNT(*) FROM v7_overdue_tasks) AS overdue_tasks,
      (SELECT COALESCE(SUM(hours), 0) FROM TimeLog WHERE work_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS hours_30d,
      (SELECT COALESCE(SUM(amount), 0) FROM Invoice WHERE status <> 'Paid') AS unpaid_amount`);
  if (!isAdmin) delete kpi.unpaid_amount;

  const monthly = await query(`SELECT month, SUM(total_hours) AS total_hours, SUM(billable_hours) AS billable_hours
    FROM v8_monthly_hours GROUP BY month ORDER BY month`);
  const taskStatus = await query(`SELECT status, COUNT(*) AS n FROM Task GROUP BY status
    ORDER BY FIELD(status, 'To Do', 'In Progress', 'In Review', 'Done')`);
  const devHours = await query(`SELECT developer, SUM(total_hours) AS hours FROM v8_monthly_hours GROUP BY developer ORDER BY hours DESC`);
  const financials = isAdmin ? await query(`SELECT project_name, budget, labour_cost, invoiced, paid FROM v6_project_financials ORDER BY budget DESC`) : null;
  const overdue = await query('SELECT * FROM v7_overdue_tasks ORDER BY days_overdue DESC LIMIT 5');
  res.json({ kpi, monthly, taskStatus, devHours, financials, overdue });
}));

router.get('/portal', requireRole('guest'), wrap(async (req, res) => {
  const clientId = req.session.user.client_id;
  if (!clientId) throw new AppError(403, 'This guest account is not linked to a client.');
  const [client] = await query('SELECT company_name, contact_name, email, city FROM Client WHERE client_id = ?', [clientId]);
  const projects = await query(`SELECT p.project_id, p.name, p.status, p.start_date, p.due_date,
      COUNT(t.task_id) AS tasks, COALESCE(SUM(t.status = 'Done'), 0) AS tasks_done,
      (SELECT COALESCE(SUM(tl.hours), 0) FROM TimeLog tl JOIN Task t2 ON t2.task_id = tl.task_id WHERE t2.project_id = p.project_id) AS hours_logged
    FROM Project p LEFT JOIN Task t ON t.project_id = p.project_id
    WHERE p.client_id = ? GROUP BY p.project_id ORDER BY p.start_date DESC`, [clientId]);
  const tasks = await query(`SELECT p.name AS project, t.title, t.status, t.priority, t.due_date
    FROM Task t JOIN Project p ON p.project_id = t.project_id WHERE p.client_id = ?
    ORDER BY FIELD(t.status, 'In Progress', 'In Review', 'To Do', 'Done'), t.due_date`, [clientId]);
  const invoices = await query(`SELECT i.invoice_id, p.name AS project, i.issue_date, i.due_date, i.amount, i.status
    FROM Invoice i JOIN Project p ON p.project_id = i.project_id WHERE p.client_id = ? ORDER BY i.issue_date DESC`, [clientId]);
  res.json({ client, projects, tasks, invoices });
}));

module.exports = router;
