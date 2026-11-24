// Session-based authentication and role checks.
// Roles: admin (full access), user (developer: tasks, time logs, reports), guest (client portal only).
const { AppError } = require('./errors');

function requireLogin(req, res, next) {
  if (!req.session.user) return next(new AppError(401, 'Please log in first.'));
  next();
}

// Lets the request through only if the logged-in user has one of the given roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return next(new AppError(401, 'Please log in first.'));
    if (!roles.includes(req.session.user.role)) {
      return next(new AppError(403, `This action needs the ${roles.join(' or ')} role.`));
    }
    next();
  };
}

// Redirects unauthenticated browsers to the login page for HTML pages.
function pageGuard(allowedRoles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return res.redirect('/login.html');
    if (allowedRoles && !allowedRoles.includes(u.role)) return res.redirect(u.role === 'guest' ? '/portal.html' : '/dashboard.html');
    next();
  };
}

module.exports = { requireLogin, requireRole, pageGuard };
