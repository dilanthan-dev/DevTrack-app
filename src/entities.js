// Entity definitions drive the generic CRUD API, the server-side validation
// and the dynamic forms on the frontend (served to the browser via /api/meta).
//
// Field types: string, text, email, url, int, decimal, date, enum, bool, fk, password
// Permissions: which roles may read (list/get) and write (create/update) and delete.

const today = () => new Date().toISOString().slice(0, 10);

const entities = {
  clients: {
    label: 'Clients', singular: 'Client', table: 'Client', pk: ['client_id'],
    lookupLabel: 'company_name',
    perms: { read: ['admin', 'user'], write: ['admin'], del: ['admin'] },
    listSql: 'SELECT c.*, (SELECT COUNT(*) FROM Project p WHERE p.client_id = c.client_id) AS projects FROM Client c',
    search: ['c.company_name', 'c.contact_name', 'c.email', 'c.city'],
    alias: 'c',
    fields: [
      { name: 'company_name', label: 'Company', type: 'string', required: true, max: 100 },
      { name: 'contact_name', label: 'Contact person', type: 'string', required: true, max: 100 },
      { name: 'email', label: 'Email', type: 'email', required: true, max: 120 },
      { name: 'phone', label: 'Phone', type: 'string', max: 20, pattern: '^[0-9()+\\- ]{7,20}$', patternMsg: 'digits, spaces, +, - or ( ) only' },
      { name: 'city', label: 'City', type: 'string', max: 60, suggest: 'city' },
      { name: 'created_at', label: 'Client since', type: 'date', required: true, default: today },
    ],
    columns: ['client_id', 'company_name', 'contact_name', 'email', 'phone', 'city', 'created_at', 'projects'],
  },

  developers: {
    label: 'Developers', singular: 'Developer', table: 'Developer', pk: ['developer_id'],
    lookupLabel: "CONCAT(first_name, ' ', last_name)",
    perms: { read: ['admin', 'user'], write: ['admin'], del: ['admin'] },
    listSql: 'SELECT d.* FROM Developer d',
    search: ['d.first_name', 'd.last_name', 'd.email', 'd.github_username'],
    alias: 'd',
    fields: [
      { name: 'first_name', label: 'First name', type: 'string', required: true, max: 50 },
      { name: 'last_name', label: 'Last name', type: 'string', required: true, max: 50 },
      { name: 'email', label: 'Email', type: 'email', required: true, max: 120 },
      { name: 'github_username', label: 'GitHub username', type: 'string', max: 50, pattern: '^[A-Za-z0-9-]{1,39}$', patternMsg: 'letters, numbers and dashes only' },
      { name: 'specialty', label: 'Specialty', type: 'enum', required: true, options: ['Frontend', 'Backend', 'Full Stack', 'Designer', 'QA', 'Project Manager'] },
      { name: 'hourly_rate', label: 'Hourly rate ($)', type: 'decimal', required: true, min: 1, max: 9999 },
      { name: 'hire_date', label: 'Hire date', type: 'date', required: true, default: today },
    ],
    columns: ['developer_id', 'first_name', 'last_name', 'email', 'github_username', 'specialty', 'hourly_rate', 'hire_date'],
  },

  projects: {
    label: 'Projects', singular: 'Project', table: 'Project', pk: ['project_id'],
    lookupLabel: 'name',
    perms: { read: ['admin', 'user'], write: ['admin'], del: ['admin'] },
    listSql: 'SELECT p.*, c.company_name AS client FROM Project p JOIN Client c ON c.client_id = p.client_id',
    search: ['p.name', 'p.description', 'c.company_name'],
    alias: 'p', dateField: 'p.due_date',
    fields: [
      { name: 'client_id', label: 'Client', type: 'fk', ref: 'clients', required: true },
      { name: 'name', label: 'Project name', type: 'string', required: true, max: 100 },
      { name: 'description', label: 'Description', type: 'text', max: 255 },
      { name: 'status', label: 'Status', type: 'enum', required: true, options: ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'], default: () => 'Planning' },
      { name: 'budget', label: 'Budget ($)', type: 'decimal', required: true, min: 0, max: 99999999 },
      { name: 'start_date', label: 'Start date', type: 'date', required: true, default: today },
      { name: 'due_date', label: 'Due date', type: 'date', required: true },
    ],
    rules: [{ after: 'due_date', before: 'start_date', msg: 'Due date must be on or after the start date.' }],
    columns: ['project_id', 'name', 'client', 'status', 'budget', 'start_date', 'due_date'],
  },

  assignments: {
    label: 'Assignments', singular: 'Assignment', table: 'ProjectAssignment', pk: ['project_id', 'developer_id'],
    perms: { read: ['admin', 'user'], write: ['admin'], del: ['admin'] },
    listSql: "SELECT pa.*, p.name AS project, CONCAT(d.first_name, ' ', d.last_name) AS developer FROM ProjectAssignment pa JOIN Project p ON p.project_id = pa.project_id JOIN Developer d ON d.developer_id = pa.developer_id",
    search: ['p.name', 'd.first_name', 'd.last_name'],
    alias: 'pa',
    fields: [
      { name: 'project_id', label: 'Project', type: 'fk', ref: 'projects', required: true, key: true },
      { name: 'developer_id', label: 'Developer', type: 'fk', ref: 'developers', required: true, key: true },
      { name: 'project_role', label: 'Role', type: 'enum', required: true, options: ['Lead', 'Developer', 'Designer', 'Tester'] },
      { name: 'assigned_on', label: 'Assigned on', type: 'date', required: true, default: today },
    ],
    columns: ['project', 'developer', 'project_role', 'assigned_on'],
  },

  tasks: {
    label: 'Tasks', singular: 'Task', table: 'Task', pk: ['task_id'],
    lookupLabel: 'title',
    perms: { read: ['admin', 'user'], write: ['admin', 'user'], del: ['admin'] },
    listSql: "SELECT t.*, p.name AS project, COALESCE(CONCAT(d.first_name, ' ', d.last_name), 'Unassigned') AS developer FROM Task t JOIN Project p ON p.project_id = t.project_id LEFT JOIN Developer d ON d.developer_id = t.assigned_to",
    search: ['t.title', 'p.name', 'd.first_name', 'd.last_name'],
    alias: 't', dateField: 't.due_date',
    fields: [
      { name: 'project_id', label: 'Project', type: 'fk', ref: 'projects', required: true },
      { name: 'assigned_to', label: 'Assigned to', type: 'fk', ref: 'developers' },
      { name: 'title', label: 'Title', type: 'string', required: true, max: 120 },
      { name: 'priority', label: 'Priority', type: 'enum', required: true, options: ['Low', 'Medium', 'High', 'Critical'], default: () => 'Medium' },
      { name: 'status', label: 'Status', type: 'enum', required: true, options: ['To Do', 'In Progress', 'In Review', 'Done'], default: () => 'To Do' },
      { name: 'estimated_hours', label: 'Estimated hours', type: 'decimal', required: true, min: 0.5, max: 999 },
      { name: 'due_date', label: 'Due date', type: 'date', required: true },
    ],
    columns: ['task_id', 'title', 'project', 'developer', 'priority', 'status', 'estimated_hours', 'due_date'],
  },

  timelogs: {
    label: 'Time Logs', singular: 'Time Log', table: 'TimeLog', pk: ['log_id'],
    perms: { read: ['admin', 'user'], write: ['admin', 'user'], del: ['admin'] },
    listSql: "SELECT tl.*, t.title AS task, CONCAT(d.first_name, ' ', d.last_name) AS developer FROM TimeLog tl JOIN Task t ON t.task_id = tl.task_id JOIN Developer d ON d.developer_id = tl.developer_id",
    search: ['t.title', 'tl.note', 'd.first_name', 'd.last_name'],
    alias: 'tl', dateField: 'tl.work_date',
    ownerField: 'developer_id', // a 'user' may only create or edit their own time logs
    fields: [
      { name: 'task_id', label: 'Task', type: 'fk', ref: 'tasks', required: true },
      { name: 'developer_id', label: 'Developer', type: 'fk', ref: 'developers', required: true },
      { name: 'work_date', label: 'Work date', type: 'date', required: true, default: today, notFuture: true },
      { name: 'hours', label: 'Hours', type: 'decimal', required: true, min: 0.1, max: 24 },
      { name: 'billable', label: 'Billable', type: 'bool', default: () => true },
      { name: 'note', label: 'Note', type: 'string', max: 255, suggest: 'note' },
    ],
    columns: ['log_id', 'work_date', 'developer', 'task', 'hours', 'billable', 'note'],
    orderBy: 'tl.work_date DESC',
  },

  invoices: {
    label: 'Invoices', singular: 'Invoice', table: 'Invoice', pk: ['invoice_id'],
    perms: { read: ['admin'], write: ['admin'], del: ['admin'] },
    listSql: 'SELECT i.*, p.name AS project, c.company_name AS client FROM Invoice i JOIN Project p ON p.project_id = i.project_id JOIN Client c ON c.client_id = p.client_id',
    search: ['p.name', 'c.company_name'],
    alias: 'i', dateField: 'i.issue_date',
    fields: [
      { name: 'project_id', label: 'Project', type: 'fk', ref: 'projects', required: true },
      { name: 'issue_date', label: 'Issue date', type: 'date', required: true, default: today },
      { name: 'due_date', label: 'Due date', type: 'date', required: true },
      { name: 'amount', label: 'Amount ($)', type: 'decimal', required: true, min: 0.01, max: 99999999 },
      { name: 'status', label: 'Status', type: 'enum', required: true, options: ['Draft', 'Sent', 'Paid', 'Overdue'], default: () => 'Draft' },
    ],
    rules: [{ after: 'due_date', before: 'issue_date', msg: 'Due date must be on or after the issue date.' }],
    columns: ['invoice_id', 'client', 'project', 'issue_date', 'due_date', 'amount', 'status'],
  },

  users: {
    label: 'Users', singular: 'User', table: 'AppUser', pk: ['user_id'],
    perms: { read: ['admin'], write: ['admin'], del: ['admin'] },
    listSql: "SELECT u.user_id, u.username, u.email, u.role, u.developer_id, u.client_id, u.created_at, CONCAT(d.first_name, ' ', d.last_name) AS developer, c.company_name AS client FROM AppUser u LEFT JOIN Developer d ON d.developer_id = u.developer_id LEFT JOIN Client c ON c.client_id = u.client_id",
    search: ['u.username', 'u.email'],
    alias: 'u',
    hideOnRead: ['password_hash'],
    fields: [
      { name: 'username', label: 'Username', type: 'string', required: true, max: 50, pattern: '^[A-Za-z0-9._-]{3,50}$', patternMsg: '3+ letters, numbers, dots, dashes or underscores' },
      { name: 'email', label: 'Email', type: 'email', required: true, max: 120 },
      { name: 'password', label: 'Password', type: 'password', requiredOnCreate: true, min: 6, max: 72 },
      { name: 'role', label: 'Role', type: 'enum', required: true, options: ['admin', 'user', 'guest'] },
      { name: 'developer_id', label: 'Developer (for admin/user)', type: 'fk', ref: 'developers' },
      { name: 'client_id', label: 'Client (for guest)', type: 'fk', ref: 'clients' },
    ],
    columns: ['user_id', 'username', 'email', 'role', 'developer', 'client', 'created_at'],
  },
};

// The parts of the config the browser needs to build forms (no SQL).
function publicMeta(role) {
  const out = {};
  for (const [key, e] of Object.entries(entities)) {
    if (!e.perms.read.includes(role)) continue;
    out[key] = {
      label: e.label, singular: e.singular, pk: e.pk, columns: e.columns,
      canWrite: e.perms.write.includes(role), canDelete: e.perms.del.includes(role),
      hasDate: !!e.dateField,
      fields: e.fields.map((f) => ({ ...f, default: f.default ? f.default() : undefined })),
      filters: e.fields.filter((f) => f.type === 'enum' || f.type === 'fk').map((f) => f.name),
    };
  }
  return out;
}

module.exports = { entities, publicMeta };
