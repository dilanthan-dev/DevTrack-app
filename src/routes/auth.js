// POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { AppError, wrap } = require('../errors');

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new AppError(400, 'Enter your username and password.');

  const rows = await query(
    `SELECT u.user_id, u.username, u.email, u.password_hash, u.role, u.developer_id, u.client_id,
            COALESCE(CONCAT(d.first_name, ' ', d.last_name), c.company_name, u.username) AS display_name
     FROM AppUser u
     LEFT JOIN Developer d ON d.developer_id = u.developer_id
     LEFT JOIN Client c ON c.client_id = u.client_id
     WHERE u.username = ? OR u.email = ?`, [username, username]);
  const u = rows[0];
  // Same message for a wrong username or password, so attackers cannot tell which one was wrong.
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new AppError(401, 'Wrong username or password.');

  // New session ID on login prevents session fixation.
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.user = {
    id: u.user_id, username: u.username, role: u.role, name: u.display_name,
    developer_id: u.developer_id, client_id: u.client_id,
  };
  res.json({ user: req.session.user });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('devtrack.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ user: req.session.user });
});

module.exports = router;
