# DevTrack

DevTrack is a web application for small web development agencies. It keeps clients, projects, developers, tasks, time logs, invoices and GitHub activity in one MySQL database.

SOFE 3700U Data Management Systems, Fall 2026, Phase III (Group 10).

## Tech stack

| Layer | Technology |
|---|---|
| Database | MySQL 8.0 (also tested on MariaDB 10.11) |
| Backend | Node.js 18+ with Express 4, express-session, mysql2, bcryptjs, pdfkit |
| Frontend | HTML, CSS and plain JavaScript using the Fetch API (AJAX), Chart.js 4 |
| External API | GitHub REST API (JSON) |

## Requirements

- **Node.js 18 or newer** (https://nodejs.org, choose the LTS version). Check with `node -v`.
- **MySQL Server 8.0** running locally (MySQL Installer on Windows includes it). You need your MySQL root password.
- An internet connection is only needed for `npm install` and the GitHub page.

## Install and run (Windows)

Open **Command Prompt** or **PowerShell** in the `devtrack-app` folder, then:

```
npm install
copy .env.example .env
notepad .env
```

In `.env`, set `DB_PASSWORD` to your MySQL root password (and `DB_USER` if you do not use root). Save and close it. Then:

```
npm run setup
npm start
```

Open **http://localhost:3000** in your browser.

`npm run setup` creates the `devtrack` database with all tables, the sample data and the 10 views, and sets the demo passwords. **It drops and recreates the `devtrack` database**, so run it again any time you want to reset the data.

## Install and run (Linux / macOS)

```
npm install
cp .env.example .env
nano .env            # set DB_PASSWORD
npm run setup
npm start
```

## Demo accounts

| Role | Username | Password | Can do |
|---|---|---|---|
| admin | `emily.admin` | `admin123` | Everything: all data, all 10 reports, users, invoices, GitHub sync |
| user (developer) | `priya` (also `marcus`, `daniel`) | `user123` | Reports (except financial ones), add and edit tasks, log their own time |
| guest (client) | `sarah.mlb` (also `kevin.nsd`, `raj.bwl`) | `guest123` | Client portal: only their own projects, tasks and invoices |

## Features and where to find them

| Requirement | Where |
|---|---|
| Login/logout with sessions | `/login.html`; `src/routes/auth.js` (bcrypt passwords, session regenerated on login) |
| Roles (admin, user, guest) | `src/auth.js`; permissions per table in `src/entities.js`; pages redirect by role |
| Input validation | In the browser (`public/js/manage.js`) and again on the server (`src/validation.js`): required fields, email format, number ranges, dates, allowed values, due date after start date |
| REST/JSON API (GET, POST, PUT, DELETE) | `/api/<table>` in `src/routes/crud.js` (see the API list below) |
| External API saved to the database | **GitHub** page: fetches a repository and its commits from the GitHub REST API and saves them into `Repository` and `CommitLog` (`src/routes/github.js`) |
| Web service returning JSON from the database | `/api/views/<view>` returns any of the 10 views as JSON (`src/routes/views.js`) |
| Full CRUD | **Manage data** page: clients, developers, projects, assignments, tasks, time logs, invoices, users |
| Export to CSV and PDF | Buttons on the Reports, Manage data and Task search pages (`src/routes/export.js`) |
| Error handling | `src/errors.js`: database down (503), duplicates (409), records in use (409), bad input (400), GitHub errors, invalid JSON, unknown pages (404) |
| 10 views as HTML tables | **Reports** page |
| Dynamic forms | Add/edit forms are built from the field definitions, validate as you type, and auto-fill (city and note suggestions from existing data, developer filled from the chosen task, due date suggested from the project) |
| AJAX | Every page loads and saves data with `fetch()`; no page reloads |
| Charts | **Dashboard** (Chart.js): hours per month, tasks by status, hours per developer, budget vs. cost vs. invoiced |
| Search and filter | **Task search** page and the toolbar on Manage data: keyword or ID, status, priority, project, developer, date range, sorting; all run as SQL on the server |

## REST API

All endpoints return JSON. Log in first; the session cookie is used for every request.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Log in with `{ "username", "password" }` |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/health` | Database connection status |
| GET | `/api/<table>?q=&status=&from=&to=&sort=&dir=&limit=&offset=` | List with search and filters |
| GET | `/api/<table>/<id>` | One record (assignments use `projectId-developerId`) |
| POST | `/api/<table>` | Create |
| PUT | `/api/<table>/<id>` | Update |
| DELETE | `/api/<table>/<id>` | Delete |
| GET | `/api/lookup/<table>` | `{id, label}` list for dropdowns |
| GET | `/api/views`, `/api/views/<view>` | The 10 Phase II views |
| GET | `/api/stats` | Dashboard data |
| GET | `/api/portal` | Client portal data (guest) |
| GET | `/api/export/view/<view>.csv` or `.pdf` | Export a view |
| GET | `/api/export/data/<table>.csv` or `.pdf` | Export a table (same filters as the list) |
| GET | `/api/github/preview?owner=&repo=` | Live repository info from GitHub |
| POST | `/api/github/sync` | Fetch from GitHub and save `{ "owner", "repo", "project_id", "limit" }` |
| GET | `/api/github/repos`, `/api/github/commits?repo_id=` | Saved GitHub data |

`<table>` is one of: `clients`, `developers`, `projects`, `assignments`, `tasks`, `timelogs`, `invoices`, `users`.

## Project structure

```
devtrack-app/
├── server.js              Express app: sessions, page routes, API routes
├── sql/devtrack.sql       Schema, sample data and the 10 views (from Phase II)
├── scripts/setup.js       Creates the database and sets demo passwords
├── src/
│   ├── db.js              MySQL connection pool
│   ├── auth.js            Login and role checks
│   ├── errors.js          Error handling and MySQL error mapping
│   ├── entities.js        Table definitions: fields, validation rules, permissions
│   ├── validation.js      Server-side input validation
│   └── routes/            auth, crud, views, export, github, stats
└── public/                HTML pages, CSS and browser JavaScript
```

## GitHub tips

- Try `expressjs` / `express`, or any public repository.
- Without a token GitHub allows 60 requests per hour. For more, create a token at GitHub > Settings > Developer settings > Personal access tokens, and put it in `.env` as `GITHUB_TOKEN=...`.
- Commit authors whose GitHub username matches a developer's `github_username` are linked to that developer.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Could not connect to MySQL` during setup | Start MySQL (Windows: Services > MySQL80 > Start) and check `DB_PASSWORD` in `.env` |
| `The database is unavailable` in the app | Same as above; the app reconnects by itself once MySQL is back |
| `Port 3000 is already in use` | Set `PORT=3001` in `.env` and open http://localhost:3001 |
| Wrong username or password | Run `npm run setup` again to reset the demo passwords |
| GitHub rate limit | Wait a few minutes or add a `GITHUB_TOKEN` |
