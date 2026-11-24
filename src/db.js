// Database connection pool (MySQL 8 / MariaDB) using mysql2 promises.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'devtrack',
  waitForConnections: true,
  connectionLimit: 10,
  // Return DATE/DATETIME as plain strings so no timezone shifts happen (2026-10-30 stays 2026-10-30).
  dateStrings: true,
  decimalNumbers: true,
});

// Small helper so every query goes through one place.
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Used at startup and by /api/health to report whether the database is reachable.
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, ping };
