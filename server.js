// DevTrack web application entry point.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const { errorHandler, AppError } = require('./src/errors');
const { pageGuard } = require('./src/auth');
const { publicMeta } = require('./src/entities');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'devtrack.sid',
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-.env',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 4 }, // 4 hours
}));

// ---------- HTML pages (role-protected) ----------
const pub = path.join(__dirname, 'public');
const page = (file) => (req, res) => res.sendFile(path.join(pub, file));
app.get('/', (req, res) => res.redirect(req.session.user ? (req.session.user.role === 'guest' ? '/portal.html' : '/dashboard.html') : '/login.html'));
app.get('/dashboard.html', pageGuard(['admin', 'user']), page('dashboard.html'));
app.get('/views.html', pageGuard(['admin', 'user']), page('views.html'));
app.get('/manage.html', pageGuard(['admin', 'user']), page('manage.html'));
app.get('/search.html', pageGuard(['admin', 'user']), page('search.html'));
app.get('/github.html', pageGuard(['admin', 'user']), page('github.html'));
app.get('/portal.html', pageGuard(['guest']), page('portal.html'));
app.use(express.static(pub, { index: false }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist'))); // Chart.js served locally, no internet needed

// ---------- JSON API ----------
app.get('/api/health', async (req, res) => {
  try { await db.ping(); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
app.use('/api/auth', require('./src/routes/auth'));
app.get('/api/meta', (req, res, next) => {
  if (!req.session.user) return next(new AppError(401, 'Please log in first.'));
  res.json({ user: req.session.user, entities: publicMeta(req.session.user.role) });
});
app.use('/api/views', require('./src/routes/views').router);
app.use('/api/export', require('./src/routes/export'));
app.use('/api/github', require('./src/routes/github'));
app.use('/api', require('./src/routes/stats'));
app.use('/api', require('./src/routes/crud').router);

app.use('/api', (req, res, next) => next(new AppError(404, 'API endpoint not found.')));
app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
app.use(errorHandler);

const server = app.listen(PORT, async () => {
  console.log(`DevTrack running at http://localhost:${PORT}`);
  try { await db.ping(); console.log('Connected to MySQL database.'); }
  catch (e) { console.error(`WARNING: cannot connect to MySQL (${e.code || e.message}). Check .env and that MySQL is running. Pages will show an error until it is fixed.`); }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Set a different PORT in .env (for example PORT=3001).`);
  else console.error(e);
  process.exit(1);
});
