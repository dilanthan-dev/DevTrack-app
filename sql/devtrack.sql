-- =====================================================================
-- DevTrack: Client and Project Management Database for Web Agencies
-- SOFE 3700U Data Management Systems, Phase II (Group 10)
-- Target: MySQL 8.0+ (also runs on MariaDB 10.6+)
-- =====================================================================

DROP DATABASE IF EXISTS devtrack;
CREATE DATABASE devtrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE devtrack;

-- =====================================================================
-- PART A: RELATIONAL SCHEMA
-- =====================================================================

-- Companies that hire the agency.
CREATE TABLE Client (
    client_id     INT AUTO_INCREMENT PRIMARY KEY,
    company_name  VARCHAR(100) NOT NULL,
    contact_name  VARCHAR(100) NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    phone         VARCHAR(20),
    city          VARCHAR(60),
    created_at    DATE NOT NULL
);

-- Agency staff who work on projects.
CREATE TABLE Developer (
    developer_id     INT AUTO_INCREMENT PRIMARY KEY,
    first_name       VARCHAR(50) NOT NULL,
    last_name        VARCHAR(50) NOT NULL,
    email            VARCHAR(120) NOT NULL UNIQUE,
    github_username  VARCHAR(50) UNIQUE,
    specialty        ENUM('Frontend','Backend','Full Stack','Designer','QA','Project Manager') NOT NULL,
    hourly_rate      DECIMAL(6,2) NOT NULL CHECK (hourly_rate > 0),
    hire_date        DATE NOT NULL
);

-- A piece of client work. Each project belongs to exactly one client.
CREATE TABLE Project (
    project_id   INT AUTO_INCREMENT PRIMARY KEY,
    client_id    INT NOT NULL,
    name         VARCHAR(100) NOT NULL,
    description  VARCHAR(255),
    status       ENUM('Planning','In Progress','On Hold','Completed','Cancelled') NOT NULL DEFAULT 'Planning',
    budget       DECIMAL(10,2) NOT NULL CHECK (budget >= 0),
    start_date   DATE NOT NULL,
    due_date     DATE NOT NULL,
    CONSTRAINT fk_project_client FOREIGN KEY (client_id) REFERENCES Client(client_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_project_dates CHECK (due_date >= start_date)
);

-- Many-to-many: which developers are on which project, and in what role.
CREATE TABLE ProjectAssignment (
    project_id    INT NOT NULL,
    developer_id  INT NOT NULL,
    project_role  ENUM('Lead','Developer','Designer','Tester') NOT NULL,
    assigned_on   DATE NOT NULL,
    PRIMARY KEY (project_id, developer_id),
    CONSTRAINT fk_assign_project FOREIGN KEY (project_id) REFERENCES Project(project_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_assign_developer FOREIGN KEY (developer_id) REFERENCES Developer(developer_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- Units of work inside a project. assigned_to is NULL while a task is unassigned.
CREATE TABLE Task (
    task_id          INT AUTO_INCREMENT PRIMARY KEY,
    project_id       INT NOT NULL,
    assigned_to      INT NULL,
    title            VARCHAR(120) NOT NULL,
    priority         ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
    status           ENUM('To Do','In Progress','In Review','Done') NOT NULL DEFAULT 'To Do',
    estimated_hours  DECIMAL(5,1) NOT NULL CHECK (estimated_hours > 0),
    due_date         DATE NOT NULL,
    CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES Project(project_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_task_developer FOREIGN KEY (assigned_to) REFERENCES Developer(developer_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- Hours a developer spent on a task on a given day.
CREATE TABLE TimeLog (
    log_id        INT AUTO_INCREMENT PRIMARY KEY,
    task_id       INT NOT NULL,
    developer_id  INT NOT NULL,
    work_date     DATE NOT NULL,
    hours         DECIMAL(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
    billable      BOOLEAN NOT NULL DEFAULT TRUE,
    note          VARCHAR(255),
    CONSTRAINT fk_log_task FOREIGN KEY (task_id) REFERENCES Task(task_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_log_developer FOREIGN KEY (developer_id) REFERENCES Developer(developer_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Bills sent to clients for a project.
CREATE TABLE Invoice (
    invoice_id   INT AUTO_INCREMENT PRIMARY KEY,
    project_id   INT NOT NULL,
    issue_date   DATE NOT NULL,
    due_date     DATE NOT NULL,
    amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    status       ENUM('Draft','Sent','Paid','Overdue') NOT NULL DEFAULT 'Draft',
    CONSTRAINT fk_invoice_project FOREIGN KEY (project_id) REFERENCES Project(project_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_invoice_dates CHECK (due_date >= issue_date)
);

-- GitHub repositories. project_id is NULL for internal repos not tied to a client project.
CREATE TABLE Repository (
    repo_id         INT AUTO_INCREMENT PRIMARY KEY,
    project_id      INT NULL,
    github_owner    VARCHAR(50) NOT NULL,
    repo_name       VARCHAR(100) NOT NULL,
    url             VARCHAR(255) NOT NULL,
    default_branch  VARCHAR(50) NOT NULL DEFAULT 'main',
    is_private      BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced     DATETIME NULL,
    UNIQUE (github_owner, repo_name),
    CONSTRAINT fk_repo_project FOREIGN KEY (project_id) REFERENCES Project(project_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- Commits imported from the GitHub REST API (Phase III). developer_id is NULL
-- when the GitHub author does not match an agency developer (e.g. a bot).
CREATE TABLE CommitLog (
    commit_id      INT AUTO_INCREMENT PRIMARY KEY,
    repo_id        INT NOT NULL,
    developer_id   INT NULL,
    sha            CHAR(40) NOT NULL UNIQUE,
    author_login   VARCHAR(50) NOT NULL,
    message        VARCHAR(255) NOT NULL,
    committed_at   DATETIME NOT NULL,
    additions      INT NOT NULL DEFAULT 0,
    deletions      INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_commit_repo FOREIGN KEY (repo_id) REFERENCES Repository(repo_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_commit_developer FOREIGN KEY (developer_id) REFERENCES Developer(developer_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- Login accounts for the web application (Phase III roles: admin, user, guest).
-- A 'user' account belongs to a developer; a 'guest' account belongs to a client.
CREATE TABLE AppUser (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    username       VARCHAR(50) NOT NULL UNIQUE,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('admin','user','guest') NOT NULL,
    developer_id   INT NULL UNIQUE,
    client_id      INT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_developer FOREIGN KEY (developer_id) REFERENCES Developer(developer_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_user_client FOREIGN KEY (client_id) REFERENCES Client(client_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- =====================================================================
-- PART B: SAMPLE DATA
-- =====================================================================

INSERT INTO Client (client_id, company_name, contact_name, email, phone, city, created_at) VALUES
(1, 'Maple Leaf Bakery',     'Sarah Mitchell',  'sarah@mapleleafbakery.ca',   '416-555-0101', 'Toronto',     '2026-01-12'),
(2, 'Northshore Dental',     'Dr. Kevin Liu',   'kevin@northshoredental.ca',  '905-555-0122', 'Oshawa',      '2026-06-03'),
(3, 'Lakeside Realty',       'Rachel Thompson', 'rachel@lakesiderealty.ca',   '905-555-0143', 'Whitby',      '2026-07-28'),
(4, 'Greenfield Organics',   'Omar Haddad',     'omar@greenfieldorganics.ca', '905-555-0164', 'Markham',     '2026-01-20'),
(5, 'Summit Fitness',        'Jessica Moreau',  'jess@summitfitness.ca',      '905-555-0185', 'Ajax',        '2026-08-14'),
(6, 'Bluewave Logistics',    'Raj Patel',       'raj@bluewavelogistics.ca',   '905-555-0206', 'Mississauga', '2026-05-30'),
(7, 'Harbour Law Group',     'Emma Clarke',     'emma@harbourlaw.ca',         '416-555-0227', 'Toronto',     '2026-10-02'),
(8, 'Pixel Toys',            'Tom Nguyen',      'tom@pixeltoys.ca',           '905-555-0248', 'Pickering',   '2026-10-19');

INSERT INTO Developer (developer_id, first_name, last_name, email, github_username, specialty, hourly_rate, hire_date) VALUES
(1, 'Priya',  'Sharma',    'priya@devtrack.agency',  'priya-sharma',  'Backend',         85.00, '2023-04-03'),
(2, 'Marcus', 'Chen',      'marcus@devtrack.agency', 'mchen-dev',     'Frontend',        70.00, '2024-01-15'),
(3, 'Sofia',  'Rossi',     'sofia@devtrack.agency',  'sofiarossi',    'Designer',        60.00, '2024-06-10'),
(4, 'Daniel', 'Okafor',    'daniel@devtrack.agency', 'dokafor',       'Full Stack',      75.00, '2023-09-18'),
(5, 'Emily',  'Tremblay',  'emily@devtrack.agency',  'etremblay',     'Project Manager', 80.00, '2022-11-01'),
(6, 'Liam',   'Walsh',     'liam@devtrack.agency',   'liamwalsh',     'Frontend',        45.00, '2025-09-02'),
(7, 'Aisha',  'Khan',      'aisha@devtrack.agency',  'aisha-qa',      'QA',              55.00, '2025-02-17'),
(8, 'Noah',   'Fernandes', 'noah@devtrack.agency',   'noahfern',      'Backend',         65.00, '2026-10-26');

INSERT INTO Project (project_id, client_id, name, description, status, budget, start_date, due_date) VALUES
(1, 1, 'Bakery Online Ordering',       'Online menu, cart and pickup ordering',          'Completed',   18000.00, '2026-03-01', '2026-06-15'),
(2, 2, 'Dental Booking Portal',        'Patient appointment booking and reminders',      'In Progress', 25000.00, '2026-07-01', '2026-12-15'),
(3, 3, 'Realty Listing Site',          'Property listings with map search',              'In Progress', 22000.00, '2026-08-10', '2027-01-31'),
(4, 4, 'Organics Shopify Migration',   'Move store from WooCommerce to Shopify',         'Completed',   12000.00, '2026-02-01', '2026-04-30'),
(5, 5, 'Fitness Member App',           'Member portal for class bookings',               'On Hold',     30000.00, '2026-09-01', '2027-03-31'),
(6, 6, 'Logistics Tracking Dashboard', 'Live shipment tracking dashboard',               'In Progress', 40000.00, '2026-06-15', '2026-11-30'),
(7, 8, 'Toy Store Redesign',           'Full redesign of the online toy store',          'Planning',    15000.00, '2026-11-01', '2027-02-28'),
(8, 1, 'Bakery Loyalty Program',       'Points and rewards add-on for ordering site',    'Planning',     8000.00, '2026-12-01', '2027-02-15');

INSERT INTO ProjectAssignment (project_id, developer_id, project_role, assigned_on) VALUES
(1, 1, 'Lead',      '2026-03-01'),
(1, 2, 'Developer', '2026-03-01'),
(1, 3, 'Designer',  '2026-03-01'),
(2, 4, 'Lead',      '2026-07-01'),
(2, 2, 'Developer', '2026-07-01'),
(2, 7, 'Tester',    '2026-09-15'),
(3, 5, 'Lead',      '2026-08-10'),
(3, 6, 'Developer', '2026-08-10'),
(3, 3, 'Designer',  '2026-08-10'),
(4, 4, 'Lead',      '2026-02-01'),
(4, 6, 'Developer', '2026-02-01'),
(5, 5, 'Lead',      '2026-09-01'),
(5, 2, 'Developer', '2026-09-01'),
(6, 1, 'Lead',      '2026-06-15'),
(6, 4, 'Developer', '2026-06-15'),
(6, 7, 'Tester',    '2026-10-01'),
(7, 5, 'Lead',      '2026-11-01'),
(7, 3, 'Designer',  '2026-11-01');

INSERT INTO Task (task_id, project_id, assigned_to, title, priority, status, estimated_hours, due_date) VALUES
(1,  1, 1,    'Build order API',                 'High',     'Done',        40.0, '2026-04-15'),
(2,  1, 2,    'Checkout page UI',                'High',     'Done',        30.0, '2026-05-10'),
(3,  1, 3,    'Menu page design',                'Medium',   'Done',        16.0, '2026-03-31'),
(4,  2, 4,    'Appointment scheduling backend',  'Critical', 'In Progress', 50.0, '2026-10-30'),
(5,  2, 2,    'Patient booking form',            'High',     'In Review',   24.0, '2026-11-15'),
(6,  2, 7,    'Booking flow test plan',          'Medium',   'To Do',       12.0, '2026-11-25'),
(7,  3, 6,    'Property listing grid',           'Medium',   'In Progress', 20.0, '2026-10-20'),
(8,  3, 3,    'Brand style guide',               'Low',      'Done',        10.0, '2026-09-15'),
(9,  3, NULL, 'Map search integration',          'High',     'To Do',       28.0, '2026-12-10'),
(10, 4, 4,    'Product data migration',          'High',     'Done',        25.0, '2026-03-20'),
(11, 4, 6,    'Theme customization',             'Medium',   'Done',        18.0, '2026-04-15'),
(12, 5, 2,    'Member login screens',            'Medium',   'To Do',       22.0, '2027-01-15'),
(13, 6, 1,    'Shipment tracking API',           'Critical', 'In Progress', 60.0, '2026-11-20'),
(14, 6, 4,    'Live map dashboard',              'High',     'In Progress', 45.0, '2026-11-05'),
(15, 6, 7,    'Load testing',                    'Medium',   'To Do',       15.0, '2026-11-25'),
(16, 7, NULL, 'Homepage wireframes',             'Medium',   'To Do',       12.0, '2026-11-30');

INSERT INTO TimeLog (task_id, developer_id, work_date, hours, billable, note) VALUES
(1,  1, '2026-03-10', 8.0, TRUE,  'Order model and endpoints'),
(1,  1, '2026-03-12', 8.0, TRUE,  'Payment integration'),
(1,  1, '2026-03-20', 8.0, TRUE,  'Pickup time slots'),
(1,  1, '2026-04-02', 8.0, TRUE,  'Order status updates'),
(1,  1, '2026-04-10', 8.0, TRUE,  'Bug fixes'),
(1,  1, '2026-04-14', 4.0, TRUE,  'Launch support'),
(2,  2, '2026-04-20', 8.0, TRUE,  'Cart layout'),
(2,  2, '2026-05-01', 8.0, TRUE,  'Checkout form'),
(2,  2, '2026-05-08', 6.0, TRUE,  'Responsive fixes'),
(3,  3, '2026-03-15', 7.0, TRUE,  'Menu mockups'),
(3,  3, '2026-03-25', 8.0, TRUE,  'Final menu design'),
(3,  3, '2026-03-30', 4.0, TRUE,  'Design revisions'),
(4,  4, '2026-07-15', 8.0, TRUE,  'Schema for appointments'),
(4,  5, '2026-08-01', 2.0, FALSE, 'Client requirements meeting'),
(4,  4, '2026-08-20', 8.0, TRUE,  'Availability logic'),
(4,  4, '2026-09-10', 8.0, TRUE,  'Reminder emails'),
(4,  4, '2026-10-05', 8.0, TRUE,  'Rescheduling flow'),
(4,  4, '2026-10-28', 6.0, TRUE,  'Double-booking fix'),
(5,  2, '2026-10-10', 8.0, TRUE,  'Booking form UI'),
(5,  2, '2026-10-22', 7.0, TRUE,  'Validation and errors'),
(7,  6, '2026-09-01', 6.0, TRUE,  'Listing card component'),
(7,  6, '2026-10-02', 6.0, TRUE,  'Grid filters'),
(8,  3, '2026-08-25', 6.0, TRUE,  'Colour and type system'),
(8,  3, '2026-09-12', 4.0, TRUE,  'Logo usage rules'),
(10, 4, '2026-02-10', 8.0, TRUE,  'Export WooCommerce data'),
(10, 4, '2026-02-20', 8.0, TRUE,  'Import scripts'),
(10, 4, '2026-03-05', 8.0, TRUE,  'Variant mapping'),
(10, 4, '2026-03-18', 3.0, TRUE,  'Final data check'),
(11, 6, '2026-03-25', 6.0, TRUE,  'Theme colours'),
(11, 6, '2026-04-08', 6.0, TRUE,  'Product page layout'),
(13, 1, '2026-07-01', 8.0, TRUE,  'Carrier API research'),
(13, 1, '2026-08-15', 8.0, TRUE,  'Tracking endpoints'),
(13, 1, '2026-09-20', 8.0, TRUE,  'Webhook handling'),
(13, 1, '2026-10-15', 8.0, TRUE,  'Caching layer'),
(13, 1, '2026-11-02', 6.0, TRUE,  'Rate limit handling'),
(14, 4, '2026-07-20', 8.0, TRUE,  'Map library setup'),
(14, 4, '2026-08-10', 8.0, TRUE,  'Live markers'),
(14, 4, '2026-09-05', 8.0, TRUE,  'Route lines'),
(14, 4, '2026-09-25', 8.0, TRUE,  'Filters panel'),
(14, 4, '2026-10-12', 8.0, TRUE,  'WebSocket updates'),
(14, 4, '2026-10-30', 8.0, TRUE,  'Performance tuning');

INSERT INTO Invoice (invoice_id, project_id, issue_date, due_date, amount, status) VALUES
(1, 1, '2026-04-01', '2026-05-01', 6000.00, 'Paid'),
(2, 1, '2026-06-20', '2026-07-20', 6500.00, 'Paid'),
(3, 4, '2026-05-05', '2026-06-04', 3400.00, 'Paid'),
(4, 2, '2026-08-31', '2026-09-30', 3500.00, 'Overdue'),
(5, 2, '2026-10-31', '2026-11-30', 2100.00, 'Sent'),
(6, 6, '2026-08-31', '2026-09-30', 6000.00, 'Paid'),
(7, 6, '2026-10-31', '2026-11-30', 5200.00, 'Sent'),
(8, 3, '2026-10-15', '2026-10-31',  900.00, 'Overdue');

INSERT INTO Repository (repo_id, project_id, github_owner, repo_name, url, default_branch, is_private, last_synced) VALUES
(1, 1,    'devtrack-agency', 'bakery-ordering',        'https://github.com/devtrack-agency/bakery-ordering',        'main', TRUE,  '2026-11-08 09:00:00'),
(2, 2,    'devtrack-agency', 'dental-booking',         'https://github.com/devtrack-agency/dental-booking',         'main', TRUE,  '2026-11-08 09:00:00'),
(3, 3,    'devtrack-agency', 'realty-listings',        'https://github.com/devtrack-agency/realty-listings',        'main', TRUE,  '2026-11-08 09:00:00'),
(4, 4,    'devtrack-agency', 'organics-shopify-theme', 'https://github.com/devtrack-agency/organics-shopify-theme', 'main', TRUE,  '2026-11-01 09:00:00'),
(5, 6,    'devtrack-agency', 'logistics-dashboard',    'https://github.com/devtrack-agency/logistics-dashboard',    'main', TRUE,  '2026-11-08 09:00:00'),
(6, NULL, 'devtrack-agency', 'ui-component-library',   'https://github.com/devtrack-agency/ui-component-library',   'main', FALSE, '2026-11-07 09:00:00'),
(7, NULL, 'devtrack-agency', 'devtrack',               'https://github.com/devtrack-agency/devtrack',               'main', TRUE,  NULL);

INSERT INTO CommitLog (repo_id, developer_id, sha, author_login, message, committed_at, additions, deletions) VALUES
(1, 1,    'a1f3c9e2b7d4401f8e6a2c5b9d0e7f1a3c4b5d6e', 'priya-sharma', 'Add order endpoints',            '2026-03-12 16:20:00', 420,  12),
(1, 2,    'b2e4d0f3c8e5512a9f7b3d6c0e1f8a2b4d5c6e7f', 'mchen-dev',    'Checkout page layout',           '2026-05-01 14:05:00', 310,  40),
(1, 1,    'c3f5e1a4d9f6623b0a8c4e7d1f2a9b3c5e6d7f8a', 'priya-sharma', 'Fix pickup slot timezone bug',   '2026-04-10 11:42:00',  18,   9),
(2, 4,    'd4a6f2b5e0a7734c1b9d5f8e2a3b0c4d6f7e8a9b', 'dokafor',      'Appointment availability logic', '2026-08-20 17:30:00', 515,  60),
(2, 2,    'e5b7a3c6f1b8845d2c0e6a9f3b4c1d5e7a8f9b0c', 'mchen-dev',    'Booking form validation',        '2026-10-22 15:10:00', 145,  22),
(2, NULL, 'f6c8b4d7a2c9956e3d1f7b0a4c5d2e6f8b9a0c1d', 'dependabot',   'Bump axios from 1.7.2 to 1.7.4', '2026-10-25 03:00:00',   4,   4),
(3, 6,    'a7d9c5e8b3d0067f4e2a8c1b5d6e3f7a9c0b1d2e', 'liamwalsh',    'Listing card component',         '2026-09-01 13:00:00', 220,   0),
(3, 3,    'b8e0d6f9c4e1178a5f3b9d2c6e7f4a8b0d1c2e3f', 'sofiarossi',   'Add brand colour tokens',        '2026-08-25 10:15:00',  60,   5),
(4, 4,    'c9f1e7a0d5f2289b6a4c0e3d7f8a5b9c1e2d3f4a', 'dokafor',      'Product import script',          '2026-02-20 16:45:00', 380,  15),
(5, 1,    'd0a2f8b1e6a3390c7b5d1f4e8a9b6c0d2f3e4a5b', 'priya-sharma', 'Shipment tracking webhooks',     '2026-09-20 18:00:00', 470,  35),
(5, 4,    'e1b3a9c2f7b4401d8c6e2a5f9b0c7d1e3a4f5b6c', 'dokafor',      'Live map markers',               '2026-08-10 12:30:00', 290,  18),
(5, 4,    'f2c4b0d3a8c5512e9d7f3b6a0c1d8e2f4b5a6c7d', 'dokafor',      'WebSocket live updates',         '2026-10-12 19:20:00', 335,  70),
(6, 2,    'a3d5c1e4b9d6623f0e8a4c7b1d2e9f3a5c6b7d8e', 'mchen-dev',    'Add Button and Modal components','2026-07-05 11:00:00', 260,   0),
(6, 6,    'b4e6d2f5c0e7734a1f9b5d8c2e3f0a4b6d7c8e9f', 'liamwalsh',    'Dark mode tokens',               '2026-10-30 14:40:00',  95,  12);

-- Password hashes below are placeholder bcrypt-format strings for sample data only.
INSERT INTO AppUser (user_id, username, email, password_hash, role, developer_id, client_id, created_at) VALUES
(1, 'emily.admin',  'emily@devtrack.agency',      '$2b$10$KIXQ1Yb7p9vA3m6H2sTqOe8wZr4LJ5cN0dF1gH7jK9lM3nP5qR7sS', 'admin', 5,    NULL, '2026-01-05 09:00:00'),
(2, 'priya',        'priya@devtrack.agency',      '$2b$10$Lm2R8xC4vB6nZ1qW3eT5yUi7oP9aS0dF2gH4jK6lZ8xC1vB3nM5qW7', 'user',  1,    NULL, '2026-01-05 09:10:00'),
(3, 'marcus',       'marcus@devtrack.agency',     '$2b$10$Np4T0zE6xD8pB3sY5gV7aWk9qR1cU2fH4jL6nM8bV0xZ2cE4gT6yU8', 'user',  2,    NULL, '2026-01-15 10:00:00'),
(4, 'daniel',       'daniel@devtrack.agency',     '$2b$10$Pr6V2bG8zF0rD5uA7iX9cYm1sT3eW4hJ6lN8pQ0dX2bZ4eG6iV8aW0', 'user',  4,    NULL, '2026-01-05 09:20:00'),
(5, 'sarah.mlb',    'sarah@mapleleafbakery.ca',   '$2b$10$Rt8X4dI0bH2tF7wC9kZ1eAo3uV5gY6jL8nP0rS2fZ4dB6gI8kX0cY2', 'guest', NULL, 1,    '2026-03-02 15:30:00'),
(6, 'kevin.nsd',    'kevin@northshoredental.ca',  '$2b$10$Tv0Z6fK2dJ4vH9yE1mB3gCq5wX7iA8lN0pR2tU4hB6fD8iK0mZ2eA4', 'guest', NULL, 2,    '2026-07-02 11:15:00'),
(7, 'raj.bwl',      'raj@bluewavelogistics.ca',   '$2b$10$Vx2B8hM4fL6xJ1aG3oD5iEs7yZ9kC0nP2rT4vW6jD8hF0kM2oB4gC6', 'guest', NULL, 6,    '2026-06-16 08:45:00');

-- =====================================================================
-- PART C: VIEWS
-- =====================================================================

-- View 1 (join of at least three tables):
-- Every project with its client and the full team assigned to it.
CREATE OR REPLACE VIEW v1_project_team AS
SELECT p.project_id,
       p.name                                   AS project_name,
       c.company_name                           AS client,
       p.status,
       CONCAT(d.first_name, ' ', d.last_name)   AS developer,
       pa.project_role,
       d.specialty
FROM Project p
JOIN Client c             ON c.client_id = p.client_id
JOIN ProjectAssignment pa ON pa.project_id = p.project_id
JOIN Developer d          ON d.developer_id = pa.developer_id;

-- View 2 (nested query with ANY/ALL, and GROUP BY):
-- Active (not completed) projects that have already used more hours than
-- at least one completed project used in total.
CREATE OR REPLACE VIEW v2_active_projects_above_completed AS
SELECT p.project_id,
       p.name           AS project_name,
       p.status,
       SUM(tl.hours)    AS hours_logged
FROM Project p
JOIN Task t     ON t.project_id = p.project_id
JOIN TimeLog tl ON tl.task_id = t.task_id
WHERE p.status <> 'Completed'
GROUP BY p.project_id, p.name, p.status
HAVING SUM(tl.hours) > ANY (
        SELECT SUM(tl2.hours)
        FROM Project p2
        JOIN Task t2     ON t2.project_id = p2.project_id
        JOIN TimeLog tl2 ON tl2.task_id = t2.task_id
        WHERE p2.status = 'Completed'
        GROUP BY p2.project_id
);

-- View 3 (correlated nested query):
-- Tasks whose logged hours have gone over the original estimate.
-- The inner query refers to t.task_id from the outer query.
CREATE OR REPLACE VIEW v3_tasks_over_estimate AS
SELECT t.task_id,
       t.title,
       p.name               AS project_name,
       t.estimated_hours,
       (SELECT SUM(tl.hours) FROM TimeLog tl WHERE tl.task_id = t.task_id) AS hours_logged,
       (SELECT SUM(tl.hours) FROM TimeLog tl WHERE tl.task_id = t.task_id) - t.estimated_hours AS hours_over
FROM Task t
JOIN Project p ON p.project_id = t.project_id
WHERE t.estimated_hours < (
        SELECT SUM(tl.hours)
        FROM TimeLog tl
        WHERE tl.task_id = t.task_id
);

-- View 4 (FULL JOIN):
-- Developer workload: every developer and every task, including developers
-- with no tasks and tasks with no developer. MySQL has no FULL OUTER JOIN
-- keyword, so this uses the standard equivalent: a LEFT JOIN combined with
-- the unmatched rows of the RIGHT JOIN.
CREATE OR REPLACE VIEW v4_developer_task_full AS
SELECT d.developer_id,
       CONCAT(d.first_name, ' ', d.last_name) AS developer,
       t.task_id,
       t.title,
       t.status
FROM Developer d
LEFT JOIN Task t ON t.assigned_to = d.developer_id
UNION ALL
SELECT d.developer_id,
       CONCAT(d.first_name, ' ', d.last_name) AS developer,
       t.task_id,
       t.title,
       t.status
FROM Developer d
RIGHT JOIN Task t ON t.assigned_to = d.developer_id
WHERE d.developer_id IS NULL;

-- View 5 (nested queries with a set operation, UNION):
-- Follow-up list: developers who own an overdue unfinished task, combined
-- with the leads of projects that have an overdue invoice.
CREATE OR REPLACE VIEW v5_follow_up_list AS
SELECT CONCAT(d.first_name, ' ', d.last_name) AS person,
       d.email,
       'Owns an overdue task'                 AS reason
FROM Developer d
WHERE d.developer_id IN (
        SELECT t.assigned_to
        FROM Task t
        WHERE t.status <> 'Done' AND t.due_date < CURDATE()
)
UNION
SELECT CONCAT(d.first_name, ' ', d.last_name),
       d.email,
       'Leads a project with an overdue invoice'
FROM Developer d
WHERE d.developer_id IN (
        SELECT pa.developer_id
        FROM ProjectAssignment pa
        WHERE pa.project_role = 'Lead'
          AND pa.project_id IN (SELECT i.project_id FROM Invoice i WHERE i.status = 'Overdue')
);

-- View 6: Project financial summary.
-- Budget against billable labour cost (hours x rate), amount invoiced and amount paid.
CREATE OR REPLACE VIEW v6_project_financials AS
SELECT p.project_id,
       p.name                                         AS project_name,
       c.company_name                                 AS client,
       p.budget,
       ROUND(COALESCE(lab.labour_cost, 0), 2)         AS labour_cost,
       COALESCE(inv.invoiced, 0)                      AS invoiced,
       COALESCE(inv.paid, 0)                          AS paid,
       ROUND(p.budget - COALESCE(lab.labour_cost, 0), 2) AS budget_remaining
FROM Project p
JOIN Client c ON c.client_id = p.client_id
LEFT JOIN (
        SELECT t.project_id, SUM(tl.hours * d.hourly_rate) AS labour_cost
        FROM TimeLog tl
        JOIN Task t      ON t.task_id = tl.task_id
        JOIN Developer d ON d.developer_id = tl.developer_id
        WHERE tl.billable = TRUE
        GROUP BY t.project_id
) lab ON lab.project_id = p.project_id
LEFT JOIN (
        SELECT project_id,
               SUM(amount) AS invoiced,
               SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) AS paid
        FROM Invoice
        GROUP BY project_id
) inv ON inv.project_id = p.project_id;

-- View 7: Overdue tasks, most overdue first.
CREATE OR REPLACE VIEW v7_overdue_tasks AS
SELECT t.task_id,
       t.title,
       p.name                                                   AS project_name,
       COALESCE(CONCAT(d.first_name, ' ', d.last_name), 'Unassigned') AS assigned_to,
       t.priority,
       t.status,
       t.due_date,
       DATEDIFF(CURDATE(), t.due_date)                          AS days_overdue
FROM Task t
JOIN Project p        ON p.project_id = t.project_id
LEFT JOIN Developer d ON d.developer_id = t.assigned_to
WHERE t.status <> 'Done' AND t.due_date < CURDATE();

-- View 8: Hours logged per developer per month (feeds the Phase III charts).
CREATE OR REPLACE VIEW v8_monthly_hours AS
SELECT CONCAT(d.first_name, ' ', d.last_name)     AS developer,
       DATE_FORMAT(tl.work_date, '%Y-%m')         AS month,
       SUM(tl.hours)                              AS total_hours,
       SUM(CASE WHEN tl.billable THEN tl.hours ELSE 0 END) AS billable_hours
FROM TimeLog tl
JOIN Developer d ON d.developer_id = tl.developer_id
GROUP BY d.developer_id, d.first_name, d.last_name, DATE_FORMAT(tl.work_date, '%Y-%m');

-- View 9: Unpaid invoices with how many days past due each one is.
CREATE OR REPLACE VIEW v9_unpaid_invoices AS
SELECT i.invoice_id,
       c.company_name                                     AS client,
       p.name                                             AS project_name,
       i.amount,
       i.due_date,
       i.status,
       GREATEST(DATEDIFF(CURDATE(), i.due_date), 0)       AS days_past_due
FROM Invoice i
JOIN Project p ON p.project_id = i.project_id
JOIN Client c  ON c.client_id = p.client_id
WHERE i.status <> 'Paid';

-- View 10: GitHub activity per repository (data imported from the GitHub API).
-- Internal repositories with no client project are kept through the LEFT JOIN.
CREATE OR REPLACE VIEW v10_repo_activity AS
SELECT r.repo_name,
       COALESCE(p.name, 'Internal')            AS project_name,
       COUNT(cl.commit_id)                     AS commits,
       COUNT(DISTINCT cl.author_login)         AS contributors,
       COALESCE(SUM(cl.additions), 0)          AS lines_added,
       COALESCE(SUM(cl.deletions), 0)          AS lines_deleted,
       MAX(cl.committed_at)                    AS last_commit
FROM Repository r
LEFT JOIN Project p    ON p.project_id = r.project_id
LEFT JOIN CommitLog cl ON cl.repo_id = r.repo_id
GROUP BY r.repo_id, r.repo_name, p.name;
