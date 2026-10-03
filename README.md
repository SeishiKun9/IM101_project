# Campus Lost & Found

Database-driven lost and found management for a campus, designed for the Advanced Database Systems requirements.

## Architecture

- **API:** Express.js with parameterized PostgreSQL queries.
- **Database:** PostgreSQL migration in `db/001_init.sql`, including 10 normalized operational tables, explicit foreign-key actions, indexes, audit triggers, status history, and `approve_claim` procedure.
- **Client:** Lightweight static interface served by Express. The API boundary remains separate from presentation.
- **Roles:** `student`, `staff`, and `admin`; production deployment should create separate database roles and keep the application role away from ownership/admin privileges.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a PostgreSQL-compatible cloud `DATABASE_URL`.
4. Execute `db/001_init.sql` against a new database. For an existing database, execute `db/002_workflow_security.sql` instead.
5. Set `ADMIN_SETUP_TOKEN` to a long random value. This server-only value is required for the protected Administrator registration option.
6. Run `npm run dev`, then open `http://localhost:3000`.

The interface includes a static preview when the database is not configured. API health is available at `/api/health`.

Public registration creates Client accounts. Administrator registration is accepted only with the server-side setup token. Verifier / CSA accounts can only be created by an authenticated Administrator from the Administrator dashboard; the backend rejects direct requests from other roles.

## Team workflow

Use feature branches such as `feature/schema-v1`, `feature/audit-procedures`, and `feature/api-crud`. Protect `main`, require pull requests, and use descriptive commits such as `feat: add claim approval procedure`.

# IM101_project
