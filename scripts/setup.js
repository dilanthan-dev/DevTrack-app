// One-time setup: creates the devtrack database (tables, sample data, 10 views)
// from sql/devtrack.sql, then gives the demo accounts real bcrypt passwords.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DEMO_PASSWORDS = { admin: 'admin123', user: 'user123', guest: 'guest123' };

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });
  } catch (e) {
    console.error(`Could not connect to MySQL: ${e.message}\nCheck DB_HOST, DB_USER and DB_PASSWORD in your .env file and that MySQL is running.`);
    process.exit(1);
  }
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'devtrack.sql'), 'utf8');
    console.log('Creating database, tables, sample data and views...');
    await conn.query(sql);
    await conn.query('USE devtrack');
    const [users] = await conn.query('SELECT user_id, role FROM AppUser');
    for (const u of users) {
      await conn.query('UPDATE AppUser SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(DEMO_PASSWORDS[u.role], 10), u.user_id]);
    }
    console.log('Done. Demo logins:');
    console.log('  admin  ->  emily.admin / admin123');
    console.log('  user   ->  priya / user123   (also marcus, daniel)');
    console.log('  guest  ->  sarah.mlb / guest123   (also kevin.nsd, raj.bwl)');
  } catch (e) {
    console.error('Setup failed:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
