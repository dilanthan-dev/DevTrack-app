// Server-side input validation. Every write goes through validate() before it reaches MySQL.
const { AppError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Returns { values, errors } where values are cleaned and converted to the right types.
// mode is 'create' or 'update'. On update, fields that are missing are left unchanged.
function validate(entity, body, mode) {
  const values = {};
  const errors = {};
  if (!body || typeof body !== 'object') throw new AppError(400, 'Missing request body.');

  for (const f of entity.fields) {
    let v = body[f.name];
    const present = v !== undefined;
    if (typeof v === 'string') v = v.trim();
    const empty = v === undefined || v === null || v === '';

    const required = f.required || (f.requiredOnCreate && mode === 'create');
    if (empty) {
      if (mode === 'create' && f.default) { values[f.name] = f.default(); continue; }
      if (required && (mode === 'create' || present)) errors[f.name] = `${f.label} is required.`;
      else if (present && !required && f.type !== 'password') values[f.name] = null; // clear optional field
      continue;
    }

    switch (f.type) {
      case 'string': case 'text': case 'password':
        if (typeof v !== 'string') { errors[f.name] = `${f.label} must be text.`; break; }
        if (f.max && v.length > f.max) errors[f.name] = `${f.label} must be at most ${f.max} characters.`;
        else if (f.min && v.length < f.min) errors[f.name] = `${f.label} must be at least ${f.min} characters.`;
        else if (f.pattern && !new RegExp(f.pattern).test(v)) errors[f.name] = `${f.label}: ${f.patternMsg || 'invalid format'}.`;
        else values[f.name] = v;
        break;
      case 'email':
        if (typeof v !== 'string' || !EMAIL_RE.test(v)) errors[f.name] = `${f.label} must be a valid email address (like name@example.com).`;
        else if (v.length > f.max) errors[f.name] = `${f.label} is too long.`;
        else values[f.name] = v.toLowerCase();
        break;
      case 'int': case 'fk': {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) errors[f.name] = `${f.label} must be selected from the list.`;
        else values[f.name] = n;
        break;
      }
      case 'decimal': {
        const n = Number(v);
        if (!Number.isFinite(n)) errors[f.name] = `${f.label} must be a number.`;
        else if (f.min !== undefined && n < f.min) errors[f.name] = `${f.label} must be at least ${f.min}.`;
        else if (f.max !== undefined && n > f.max) errors[f.name] = `${f.label} must be at most ${f.max}.`;
        else values[f.name] = Math.round(n * 100) / 100;
        break;
      }
      case 'date':
        if (!isValidDate(String(v))) errors[f.name] = `${f.label} must be a valid date (YYYY-MM-DD).`;
        else if (f.notFuture && v > new Date().toISOString().slice(0, 10)) errors[f.name] = `${f.label} cannot be in the future.`;
        else values[f.name] = v;
        break;
      case 'enum':
        if (!f.options.includes(v)) errors[f.name] = `${f.label} must be one of: ${f.options.join(', ')}.`;
        else values[f.name] = v;
        break;
      case 'bool':
        values[f.name] = v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
        break;
      default:
        values[f.name] = v;
    }
  }

  // Cross-field rules, e.g. due date after start date.
  for (const r of entity.rules || []) {
    const a = values[r.after] ?? body[r.after];
    const b = values[r.before] ?? body[r.before];
    if (a && b && !errors[r.after] && !errors[r.before] && a < b) errors[r.after] = r.msg;
  }

  if (Object.keys(errors).length) throw new AppError(400, 'Please fix the highlighted fields.', errors);
  return values;
}

module.exports = { validate, isValidDate };
