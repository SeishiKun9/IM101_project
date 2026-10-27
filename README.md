# Campus Lost & Found

A web-based campus lost-and-found management system built for the Advanced Database Systems project. It helps campus users report lost or found items, review reports, manage claim requests, and coordinate item recovery. Administrative tools support account management, campus locations and maps, branding, and audit-log review.

## Table of Contents

- [Project Objectives](#project-objectives)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [User Roles](#user-roles)
- [Database Design and Migrations](#database-design-and-migrations)
- [Audit Logging](#audit-logging)
- [Installation and Local Setup](#installation-and-local-setup)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Deploying to Render](#deploying-to-render)
- [Health Check and Troubleshooting](#health-check-and-troubleshooting)
- [Security Notes](#security-notes)

## Project Objectives

1. Provide a central place to report and review lost or found campus items.
2. Support a controlled review and claim workflow.
3. Store application data in PostgreSQL using relational tables and constraints.
4. Keep a record of important administrative and data-management actions through audit logging.
5. Let authorized administrators maintain campus locations, maps, and branding.
6. Provide account, profile, privacy, and theme preferences.

## Features

- Lost-item and found-item reporting and browsing.
- Item details and report-management views.
- Authentication and role-based access for students, staff/verifiers, and administrators.
- Claim review and workflow status handling.
- User profile editing, password changes, privacy preferences, and theme selection.
- Administrator workspace for account and verifier management.
- Campus location and map management.
- Campus logo/branding management.
- Audit-log browsing and detailed audit records.
- PostgreSQL-backed API with parameterized queries.
- Vite build process and Express static-file serving.

Feature access depends on the authenticated user's role and the server-side checks.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Builds the interactive user interface. |
| React DOM | Renders React components in the browser. |
| React Router | Handles client-side page navigation. |
| Vite | Development server and production frontend build. |
| Node.js | JavaScript runtime for the server and scripts. |
| Express.js | HTTP server and API routing. |
| PostgreSQL | Relational database for application data. |
| `pg` | Connects the Node.js application to PostgreSQL. |
| `dotenv` | Loads environment variables from `.env` during local development. |
| `concurrently` | Runs the Vite development server and Node.js API together. |
| Prettier | Formats supported source files. |

## System Architecture

The application has three main parts:

1. **Frontend (`client/`)**: React pages and components display reports, forms, profile settings, and administrative workspaces. The frontend calls the backend API through the shared API client.
2. **Backend (`server/`)**: Express.js handles API requests, validates input, applies authorization rules, runs database queries, and serves the built frontend and uploaded files.
3. **Database (`db/`)**: PostgreSQL stores application records. SQL migration files define the schema and later database changes. The migration runner applies the SQL files in order.

Typical request flow:

`Browser → React UI → API client → Express route/handler → PostgreSQL → API response → React UI`

The backend is the authority for permissions. Hiding a button in the interface is not a replacement for server-side authorization.

## Project Structure

```text
IM101_project/
├── client/
│   └── src/
│       ├── api/                 # Shared API client
│       ├── components/          # Reusable UI components and modals
│       │   ├── profile/         # Profile and privacy forms
│       │   └── workspace/       # Admin and review workspace components
│       ├── constants/           # Shared status and location constants
│       ├── context/             # Authentication and theme state
│       ├── pages/               # Main application pages
│       ├── utils/               # Client-side helper functions
│       └── App.jsx              # Main React application and routes
├── server/
│   └── src/
│       ├── routes/              # Express routers for focused features
│       ├── services/            # Shared business services, including audit and image handling
│       ├── utils/               # Server-side validation helpers
│       └── index.js             # Express app, API handlers, and server startup
├── db/
│   ├── 001_init.sql             # Initial database schema
│   ├── 002_workflow_security.sql# Workflow and security-related changes
│   ├── 003_locations_and_maps.sql # Campus locations and map tables/changes
│   ├── 004_profile_and_theme.sql# Profile and theme-related changes
│   ├── 005_audit_logs.sql       # Audit logging schema and database logic
│   └── migrate.js               # Migration runner and initial location seeding
├── uploads/
│   ├── logo/                    # Uploaded campus logo assets
│   └── maps/                    # Uploaded campus map assets
├── .env.example                 # Example local environment variables
├── package.json                # Dependencies and npm scripts
├── render.yaml                 # Render deployment configuration
├── vite.config.js              # Vite configuration
└── README.md                   # Project documentation
```

## User Roles

- **Student**: Uses the public-facing application to browse reports and submit permitted reports or claim-related requests.
- **Staff / Verifier**: Supports the verification and review workflow according to the permissions implemented by the server.
- **Administrator**: Manages accounts and administrative features, including campus locations, maps, branding, and audit-log review.

The backend enforces role restrictions. The public registration flow is intended for regular client accounts. Administrator setup requires the server-side `ADMIN_SETUP_TOKEN`. Verifier/staff accounts should be created through the authenticated administrator workflow.

## Database Design and Migrations

The database uses PostgreSQL. SQL files in `db/` are ordered changes to the database schema and related database logic.

| File | Responsibility |
|---|---|
| `db/001_init.sql` | Creates the initial relational schema and core database objects. |
| `db/002_workflow_security.sql` | Adds workflow and security-related database changes. |
| `db/003_locations_and_maps.sql` | Adds database support for campus locations and maps. |
| `db/004_profile_and_theme.sql` | Adds profile and theme-related database fields or objects. |
| `db/005_audit_logs.sql` | Adds audit-log database structures and supporting logic. |
| `db/migrate.js` | Runs the SQL migrations in order and seeds configured campus-location data. |

The schema uses relational constraints and indexes where defined by the migration scripts. Review the SQL files directly for the exact table definitions, columns, keys, indexes, triggers, and functions. Do not rerun an initial schema script against a populated database unless you have checked its effects and backed up the data.

To run the project's migration script, configure `DATABASE_URL` first, then execute:

```bash
npm run migrate
```

For a brand-new database, use the migration runner so the scripts are applied in their intended order. If you are working with an existing database, check which migrations have already been applied before running them again.

## Audit Logging

Audit functionality is implemented in `server/src/services/audit.js`, supported by the administrator audit routes in `server/src/routes/adminAudit.js`, the audit-log migration in `db/005_audit_logs.sql`, and interface components such as `AuditLogManagement.jsx` and `AuditDetailModal.jsx`.

The purpose of audit logging is to help authorized administrators review recorded actions and relevant details. Depending on the operation and the implemented audit event, records can identify the actor, action, affected resource, time, and available before/after details. The precise fields and events are defined by the audit service and SQL migration.

For reliable auditing, changes must pass through the application's supported backend/database paths. Direct database edits performed outside those paths may not create the same application-level audit record unless a database trigger covers that operation.

## Installation and Local Setup

### Requirements

- Node.js 20 or later.
- npm.
- A PostgreSQL database, local or hosted.
- Git, if cloning the project from a repository.

### 1. Open the project

```bash
git clone <your-repository-url>
cd IM101_project
```

If you already downloaded the source code, open the project root folder in your terminal or VS Code.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to a new file named `.env` and edit the values for your environment. Do not commit `.env` to Git.

```env
PORT=3000
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME
NODE_ENV=development
ADMIN_SETUP_TOKEN=replace-with-a-long-random-value
```

Use the connection string provided by your PostgreSQL host. URL-encode special characters in the username or password if the connection string requires it. Keep production credentials and setup tokens private.

### 4. Prepare the database

Make sure the target database exists and that the connection user has the permissions required to create or update the project's schema. Run:

```bash
npm run migrate
```

Read the terminal output and resolve any migration error before starting the application.

### 5. Start the development servers

```bash
npm run dev
```

This runs Vite and the Node.js server concurrently. Open the local URL shown by Vite in the terminal. The Express server uses port `3000` by default unless `PORT` is set differently.

To run only the backend:

```bash
npm start
```

To build the frontend for production:

```bash
npm run build
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port for the Express server; defaults to `3000`. |
| `DATABASE_URL` | Yes for database-backed features and migrations | PostgreSQL connection string. |
| `NODE_ENV` | No | Set to `production` for production deployment; use `development` locally. |
| `ADMIN_SETUP_TOKEN` | Required for protected administrator registration | Server-only token used by the protected administrator setup flow. Use a strong, private value. |
| `DATABASE_SSL` | Optional | Can explicitly control database SSL behavior where supported by the migration runner. Check the database connection configuration before changing it. |

Never put secrets in frontend code, public repositories, screenshots, or client-side environment variables.

## Deploying to Render

The repository includes `render.yaml` with a Node web service configuration. It specifies a build command that installs dependencies, builds the frontend, and runs database migrations, then starts the server with `npm start`. The service health-check path is `/api/health`.

1. Push the project to a Git repository supported by Render.
2. In Render, create a new Web Service from that repository or use the Blueprint configuration.
3. Configure `DATABASE_URL` with the connection string for the intended PostgreSQL database. Use the correct internal connection URL when the web service and database are on Render in the same region/network, following Render's current instructions.
4. Ensure `NODE_ENV` is `production` and set a strong `ADMIN_SETUP_TOKEN` in the service environment.
5. Confirm the build and migration commands match the repository configuration. Migrations can modify the database, so confirm the target database before deployment.
6. Deploy and inspect the build/deploy logs for errors.
7. Visit `/api/health` on the deployed service to check the API health response.

**Important:** A successful frontend build does not prove that the database schema was created successfully. Check migration logs and the database's table list if the application reports missing tables or columns.

## Health Check and Troubleshooting

### API health check

Open:

```text
http://localhost:3000/api/health
```

For deployment, replace the local address with the Render service URL.

### Common issues

- **`DATABASE_URL is not set`**: Add `DATABASE_URL` to `.env` locally or to the Render service's environment settings.
- **Database connection failure**: Verify the hostname, port, database name, username, password, SSL requirements, and network access.
- **Tables or columns are missing**: Check migration logs and confirm the required migration files were applied to the same database used by the web service.
- **`Failed to fetch` in the browser**: Confirm the backend is running, inspect the browser console and Network tab, and check server logs for the failing API request.
- **Port already in use**: Stop the other process using the port or choose a different `PORT`.
- **Administrator setup fails**: Confirm `ADMIN_SETUP_TOKEN` is set on the server and that the supplied setup token matches. Never expose it in frontend code.
- **Uploaded images disappear after redeployment**: Check the hosting platform's persistent-storage behavior. A normal deployment filesystem may not preserve uploads; use persistent storage or an object-storage solution if uploads must survive deployments.

## Security Notes

- Use parameterized SQL queries for user-supplied values.
- Enforce authentication and authorization on the server, not only in the frontend.
- Keep database credentials and setup tokens out of source control.
- Use HTTPS in production and follow the database host's SSL guidance.
- Back up the database before schema changes or migrations on a populated database.
- Give the application database user only the privileges it needs.
- Review upload validation and file-storage permissions before production use.
- Avoid sharing real user information, passwords, tokens, or database connection strings in public issue reports.

## Development Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Vite and the Node.js server in development mode. |
| `npm start` | Starts the Express server. |
| `npm run build` | Builds the frontend with Vite. |
| `npm run migrate` | Runs database migrations. |
| `npm run format` | Formats the source files listed in the Prettier script. |

## Academic Project Note

This project demonstrates how a web application can connect a React frontend, an Express API, and a PostgreSQL database. Its database and workflow features support learning in relational database design, schema migrations, access control, and auditability.
