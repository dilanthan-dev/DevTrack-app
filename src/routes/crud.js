// Generic REST CRUD for every entity in entities.js:
//   GET    /api/:entity            list, with search (?q=), filters (?status=...), date range (?from=&to=), sort and paging
//   GET    /api/:entity/:id        one record (composite keys use "1-2")
//   POST   /api/:entity            create
//   PUT    /api/:entity/:id        update
//   DELETE /api/:entity/:id        delete
//   GET    /api/lookup/:entity     {id, label} pairs for form dropdowns
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { entities } = require('../entities');
const { validate, isValidDate } = require('../validation');
const { AppError, wrap } = require('../errors');
const { requireLogin } = require('../auth');

const router = express.Router();
router.use(requireLogin);

function getEntity(req, action) {
  const e = entities[req.params.entity];
  if (!e) throw new AppError(404, `Unknown resource "${req.params.entity}".`);
  if (!e.perms[action].includes(req.session.user.role)) {
    throw new AppError(403, `Your role (${req.session.user.role}) cannot ${action === 'read' ? 'view' : action === 'del' ? 'delete' : 'change'} ${e.label.toLowerCase()}.`);
  }
  return e;
}

// Turns "4" or "1-2" into a WHERE clause on the primary key column(s).
function pkWhere(e, idParam) {
  const parts = String(idParam).split('-');
  if (parts.length !== e.pk.length || parts.some((p) => !/^\d+$/.test(p))) throw new AppError(400, 'Invalid record id.');
  return { sql: e.pk.map((k) => `${e.alias}.${k} = ?`).join(' AND '), params: parts.map(Number) };
}

// Builds the filtered list query used by both the list endpoint and the exports.
function buildList(e, q) {
  const where = [];
  const params = [];
  if (q.q) {
    const kw = String(q.q).trim().slice(0, 100);
    const idTest = /^\d+$/.test(kw) && e.pk.length === 1 ? ` OR ${e.alias}.${e.pk[0]} = ${Number(kw)}` : '';
    where.push(`(${e.search.map((c) => `${c} LIKE ?`).join(' OR ')}${idTest})`);
    e.search.forEach(() => params.push(`%${kw}%`));
  }
  for (const f of e.fields) {
    if ((f.type === 'enum' || f.type === 'fk') && q[f.name] !== undefined && q[f.name] !== '') {
      if (q[f.name] === 'null') where.push(`${e.alias}.${f.name} IS NULL`);
      else { where.push(`${e.alias}.${f.name} = ?`); params.push(q[f.name]); }
    }
  }
  if (e.dateField) {
    if (q.from) { if (!isValidDate(q.from)) throw new AppError(400, 'From date must be YYYY-MM-DD.'); where.push(`${e.dateField} >= ?`); params.push(q.from); }
    if (q.to) { if (!isValidDate(q.to)) throw new AppError(400, 'To date must be YYYY-MM-DD.'); where.push(`${e.dateField} <= ?`); params.push(q.to); }
  }
  let sql = e.listSql + (where.length ? ` WHERE ${where.join(' AND ')}` : '');
  // Sorting only on known column names (never raw user input in SQL).
  const sortable = new Set([...e.columns, ...e.pk]);
  if (q.sort && sortable.has(q.sort)) sql += ` ORDER BY \`${q.sort}\` ${q.dir === 'desc' ? 'DESC' : 'ASC'}`;
  else sql += ` ORDER BY ${e.orderBy || e.pk.map((k) => `${e.alias}.${k}`).join(', ')}`;
  return { sql, params };
}

router.get('/lookup/:entity', wrap(async (req, res) => {
  const e = getEntity(req, 'read');
  if (e.pk.length !== 1 || !e.lookupLabel) throw new AppError(400, 'No lookup for this resource.');
  const rows = await query(`SELECT ${e.pk[0]} AS id, ${e.lookupLabel} AS label FROM ${e.table} ORDER BY label`);
  res.json(rows);
}));

router.get('/:entity', wrap(async (req, res) => {
  const e = getEntity(req, 'read');
  const { sql, params } = buildList(e, req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM (${sql}) x`, params);
  const rows = await query(`${sql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ total, rows });
}));

router.get('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req, 'read');
  const w = pkWhere(e, req.params.id);
  const rows = await query(`${e.listSql} WHERE ${w.sql}`, w.params);
  if (!rows.length) throw new AppError(404, `${e.singular} not found.`);
  res.json(rows[0]);
}));

// A developer ('user' role) may only log time for themselves.
function enforceOwner(e, req, values) {
  const u = req.session.user;
  if (e.ownerField && u.role === 'user') {
    if (!u.developer_id) throw new AppError(403, 'Your account is not linked to a developer.');
    values[e.ownerField] = u.developer_id;
  }
}

async function prepareUser(e, values, mode) {
  if (e.table !== 'AppUser') return;
  if (values.password) values.password_hash = await bcrypt.hash(values.password, 10);
  delete values.password;
  if (values.role === 'guest' && mode === 'create' && !values.client_id) {
    throw new AppError(400, 'Please fix the highlighted fields.', { client_id: 'A guest account must be linked to a client.' });
  }
}

router.post('/:entity', wrap(async (req, res) => {
  const e = getEntity(req, 'write');
  const values = validate(e, req.body, 'create');
  enforceOwner(e, req, values);
  await prepareUser(e, values, 'create');
  const cols = Object.keys(values);
  const result = await query(
    `INSERT INTO ${e.table} (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => values[c]));
  const id = e.pk.length === 1 ? result.insertId : e.pk.map((k) => values[k]).join('-');
  res.status(201).json({ id, message: `${e.singular} created.` });
}));

router.put('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req, 'write');
  const w = pkWhere(e, req.params.id);
  const values = validate(e, req.body, 'update');
  e.pk.forEach((k) => delete values[k]); // keys cannot be changed
  if (e.ownerField && req.session.user.role === 'user') {
    const [own] = await query(`SELECT ${e.ownerField} AS owner FROM ${e.table} ${e.alias} WHERE ${w.sql}`, w.params);
    if (own && own.owner !== req.session.user.developer_id) throw new AppError(403, 'You can only edit your own time logs.');
    enforceOwner(e, req, values);
  }
  await prepareUser(e, values, 'update');
  const cols = Object.keys(values);
  if (!cols.length) throw new AppError(400, 'Nothing to update.');
  const result = await query(
    `UPDATE ${e.table} ${e.alias} SET ${cols.map((c) => `${e.alias}.\`${c}\` = ?`).join(', ')} WHERE ${w.sql}`,
    [...cols.map((c) => values[c]), ...w.params]);
  if (!result.affectedRows) throw new AppError(404, `${e.singular} not found.`);
  res.json({ message: `${e.singular} updated.` });
}));

router.delete('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req, 'del');
  const w = pkWhere(e, req.params.id);
  if (e.table === 'AppUser' && Number(req.params.id) === req.session.user.id) throw new AppError(400, 'You cannot delete your own account while logged in.');
  const result = await query(`DELETE ${e.alias} FROM ${e.table} ${e.alias} WHERE ${w.sql}`, w.params);
  if (!result.affectedRows) throw new AppError(404, `${e.singular} not found.`);
  res.json({ message: `${e.singular} deleted.` });
}));

module.exports = { router, buildList, getEntity };
