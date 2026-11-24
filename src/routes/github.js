// External API integration: GitHub REST API (JSON).
//   GET  /api/github/preview?owner=&repo=   fetch repo info live from GitHub (nothing saved)
//   POST /api/github/sync                   fetch repo + latest commits from GitHub and SAVE them into Repository and CommitLog
//   GET  /api/github/repos                  repositories stored in our database
//   GET  /api/github/commits?repo_id=       commits stored in our database
const express = require('express');
const { pool, query } = require('../db');
const { AppError, wrap } = require('../errors');
const { requireRole } = require('../auth');

const router = express.Router();
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

async function gh(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'DevTrack-SOFE3700' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let res;
  try {
    res = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, { headers, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw new AppError(502, 'Could not reach GitHub. Check your internet connection and try again.');
  }
  if (res.status === 404) throw new AppError(404, 'GitHub says that repository does not exist (or it is private).');
  if (res.status === 403 || res.status === 429) throw new AppError(429, 'GitHub rate limit reached. Wait a few minutes, or add a GITHUB_TOKEN to .env.');
  if (res.status === 409) return []; // empty repository has no commits
  if (!res.ok) throw new AppError(502, `GitHub returned an error (${res.status}).`);
  return res.json();
}

function checkNames(owner, repo) {
  if (!NAME_RE.test(owner || '') || !NAME_RE.test(repo || '')) {
    throw new AppError(400, 'Please fix the highlighted fields.', {
      ...(NAME_RE.test(owner || '') ? {} : { owner: 'Owner must be a GitHub user or organization name.' }),
      ...(NAME_RE.test(repo || '') ? {} : { repo: 'Repository must be a GitHub repository name.' }),
    });
  }
}

router.get('/preview', requireRole('admin', 'user'), wrap(async (req, res) => {
  const { owner, repo } = req.query;
  checkNames(owner, repo);
  const r = await gh(`/repos/${owner}/${repo}`);
  res.json({
    full_name: r.full_name, description: r.description, html_url: r.html_url, private: r.private,
    default_branch: r.default_branch, stars: r.stargazers_count, forks: r.forks_count,
    open_issues: r.open_issues_count, language: r.language, updated_at: r.updated_at,
  });
}));

router.post('/sync', requireRole('admin'), wrap(async (req, res) => {
  const owner = String(req.body?.owner || '').trim();
  const repo = String(req.body?.repo || '').trim();
  const projectId = req.body?.project_id ? Number(req.body.project_id) : null;
  const limit = Math.min(Math.max(Number(req.body?.limit) || 30, 1), 100);
  checkNames(owner, repo);
  if (projectId !== null && !(Number.isInteger(projectId) && projectId > 0)) throw new AppError(400, 'Invalid project.');

  // 1. Fetch from GitHub
  const info = await gh(`/repos/${owner}/${repo}`);
  const list = await gh(`/repos/${owner}/${repo}/commits?per_page=${limit}`);
  // The list endpoint has no line counts, so fetch details for the newest 10 commits.
  const details = await Promise.all(list.slice(0, 10).map((c) => gh(`/repos/${owner}/${repo}/commits/${c.sha}`).catch(() => null)));
  const stats = new Map(details.filter(Boolean).map((d) => [d.sha, d.stats]));

  // 2. Save into our database in one transaction
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Query 1: insert or update the repository row
    await conn.query(
      `INSERT INTO Repository (project_id, github_owner, repo_name, url, default_branch, is_private, last_synced)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE project_id = COALESCE(VALUES(project_id), project_id), url = VALUES(url),
         default_branch = VALUES(default_branch), is_private = VALUES(is_private), last_synced = NOW()`,
      [projectId, info.owner.login, info.name, info.html_url, info.default_branch, info.private ? 1 : 0]);
    const [[{ repo_id: repoId }]] = await conn.query('SELECT repo_id FROM Repository WHERE github_owner = ? AND repo_name = ?', [info.owner.login, info.name]);

    // Match GitHub authors to our developers by github_username
    const [devs] = await conn.query('SELECT developer_id, LOWER(github_username) AS gh FROM Developer WHERE github_username IS NOT NULL');
    const devMap = new Map(devs.map((d) => [d.gh, d.developer_id]));

    // Query 2: insert each commit (skip ones we already have)
    let added = 0;
    for (const c of list) {
      const login = c.author?.login || c.commit?.author?.name || 'unknown';
      const s = stats.get(c.sha) || { additions: 0, deletions: 0 };
      const when = (c.commit?.author?.date || new Date().toISOString()).replace('T', ' ').replace('Z', '').slice(0, 19);
      const [r] = await conn.query(
        `INSERT IGNORE INTO CommitLog (repo_id, developer_id, sha, author_login, message, committed_at, additions, deletions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [repoId, devMap.get(String(login).toLowerCase()) || null, c.sha, String(login).slice(0, 50),
          String(c.commit?.message || '').split('\n')[0].slice(0, 255) || '(no message)', when, s.additions || 0, s.deletions || 0]);
      added += r.affectedRows;
    }
    await conn.commit();
    res.json({ repo_id: repoId, repo: info.full_name, fetched: list.length, added, message: `Synced ${info.full_name}: ${added} new commit(s) saved, ${list.length - added} already stored.` });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

router.get('/repos', requireRole('admin', 'user'), wrap(async (req, res) => {
  res.json(await query(`SELECT r.repo_id, r.github_owner, r.repo_name, r.url, r.last_synced,
      COALESCE(p.name, 'Internal') AS project, COUNT(cl.commit_id) AS commits
    FROM Repository r LEFT JOIN Project p ON p.project_id = r.project_id
    LEFT JOIN CommitLog cl ON cl.repo_id = r.repo_id
    GROUP BY r.repo_id, r.github_owner, r.repo_name, r.url, r.last_synced, p.name
    ORDER BY r.last_synced DESC`));
}));

router.get('/commits', requireRole('admin', 'user'), wrap(async (req, res) => {
  const repoId = Number(req.query.repo_id);
  if (!Number.isInteger(repoId) || repoId <= 0) throw new AppError(400, 'repo_id is required.');
  res.json(await query(`SELECT LEFT(cl.sha, 7) AS sha, cl.author_login,
      COALESCE(CONCAT(d.first_name, ' ', d.last_name), '(not an agency developer)') AS developer,
      cl.message, cl.committed_at, cl.additions, cl.deletions
    FROM CommitLog cl LEFT JOIN Developer d ON d.developer_id = cl.developer_id
    WHERE cl.repo_id = ? ORDER BY cl.committed_at DESC LIMIT 200`, [repoId]));
}));

module.exports = router;
