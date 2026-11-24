// Central error handling: turns database, validation and API errors into clear JSON responses.

class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wraps async route handlers so thrown errors reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Maps MySQL error codes to HTTP status codes and readable messages.
function mapDbError(err) {
  switch (err.code) {
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
    case 'ETIMEDOUT':
      return new AppError(503, 'The database is unavailable. Check that MySQL is running and the settings in .env are correct.');
    case 'ER_DUP_ENTRY':
      return new AppError(409, 'A record with that value already exists (it must be unique).');
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return new AppError(409, 'This record cannot be deleted because other records depend on it (for example, a client that still has projects).');
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return new AppError(400, 'A linked record does not exist (check the selected client, project, task or developer).');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
    case 'ER_CONSTRAINT_FAILED':
      return new AppError(400, 'The values break a database rule (for example, a due date before the start date).');
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 'WARN_DATA_TRUNCATED':
    case 'ER_DATA_TOO_LONG':
      return new AppError(400, 'One of the values has the wrong format or is too long.');
    default:
      return null;
  }
}

function errorHandler(err, req, res, next) {
  let e = err;
  if (!(e instanceof AppError)) {
    if (e.type === 'entity.parse.failed') e = new AppError(400, 'The request body is not valid JSON.');
    else e = mapDbError(e) || e;
  }
  const status = e.status || 500;
  if (status === 503) console.error(`[database] ${err.code || err.message}`);
  else if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server.' : e.message,
    details: e.details,
  });
}

module.exports = { AppError, wrap, errorHandler };
