# AGM Portal - Database Operations Guide

This guide provides practical PostgreSQL operations for AGM Portal environments running via Docker Compose.

## 1. Prerequisites

- Docker Engine / Docker Desktop installed
- Services started from repository root

```bash
docker compose up -d db backend frontend
```

## 2. Connect to PostgreSQL

### 2.1 In-Container `psql`

```bash
docker compose exec db psql -U postgres -d agm
```

### 2.2 Host-Based Connection

Use any SQL client with:
- Host: `localhost`
- Port: `5433`
- User: `postgres`
- Password: `postgres`
- Database: `agm`

## 3. Core `psql` Navigation

```sql
\l                      -- list databases
\c agm                  -- connect to agm
\dt                     -- list tables
\d users                -- users schema
\d projects             -- projects schema
\d project_permissions  -- permissions schema
\d project_access_levels -- access-level templates
\d audit_logs           -- audit schema
```

Exit:

```sql
\q
```

## 4. High-Value Operational Queries

### 4.1 User and Role Inventory

```sql
SELECT id, email, role, created_at
FROM users
ORDER BY id;
```

### 4.2 Project Portfolio Snapshot

```sql
SELECT
  id,
  title,
  institution,
  domain,
  ai_type,
  lifecycle_stage,
  trl_level,
  trc_category,
  owner_id,
  funding_amount_sgd,
  start_date,
  end_date,
  updated_at
FROM projects
ORDER BY updated_at DESC;
```

### 4.3 Project Permission Matrix

```sql
SELECT
  pp.project_id,
  p.title,
  pp.user_id,
  u.email,
  pp.access_level_key,
  pp.can_view,
  pp.can_edit,
  pp.can_add_update,
  pp.can_add_funding,
  pp.can_manage_access,
  pp.override_can_view,
  pp.override_can_edit,
  pp.override_can_add_update,
  pp.override_can_add_funding,
  pp.override_can_manage_access,
  pp.updated_at
FROM project_permissions pp
JOIN users u ON u.id = pp.user_id
JOIN projects p ON p.id = pp.project_id
ORDER BY pp.project_id, u.email;
```

### 4.4 Access-Level Templates

```sql
SELECT
  key,
  label,
  description,
  can_view,
  can_edit,
  can_add_update,
  can_add_funding,
  can_manage_access,
  updated_at
FROM project_access_levels
ORDER BY key;
```

### 4.5 Recent Audit Trail

```sql
SELECT id, actor_user_id, action, entity_type, entity_id, created_at
FROM audit_logs
ORDER BY id DESC
LIMIT 100;
```

### 4.6 Funding Event Ledger

```sql
SELECT project_id, amount_sgd, note, author_user_id, created_at
FROM project_funding_events
ORDER BY created_at DESC;
```

### 4.7 Version History

```sql
SELECT project_id, id AS version_id, actor_user_id, reason, created_at
FROM project_versions
ORDER BY created_at DESC;
```

## 5. Data Quality and Integrity Checks

### 5.1 Orphaned Permission Rows

```sql
SELECT pp.*
FROM project_permissions pp
LEFT JOIN projects p ON p.id = pp.project_id
LEFT JOIN users u ON u.id = pp.user_id
WHERE p.id IS NULL OR u.id IS NULL;
```

### 5.2 Permissions Missing Access Level Key

```sql
SELECT id, project_id, user_id, access_level_key, updated_at
FROM project_permissions
WHERE access_level_key IS NULL OR trim(access_level_key) = '';
```

### 5.3 Projects Without `start_date`

```sql
SELECT id, title, created_at, start_date
FROM projects
WHERE start_date IS NULL
ORDER BY created_at DESC;
```

### 5.4 Unexpected Empty Critical Fields

```sql
SELECT id, title, institution, domain, ai_type
FROM projects
WHERE trim(title) = ''
   OR trim(institution) = ''
   OR trim(domain) = ''
   OR trim(ai_type) = '';
```

### 5.5 Projects Past Grant End Date But Not Ended

```sql
SELECT id, title, grant_end_date, end_date, updated_at
FROM projects
WHERE grant_end_date < CURRENT_DATE
  AND end_date IS NULL
ORDER BY grant_end_date ASC;
```

## 6. Backup and Restore

### 6.1 Backup

```bash
docker compose exec db pg_dump -U postgres -d agm > agm_backup.sql
```

### 6.2 Restore

```bash
cat agm_backup.sql | docker compose exec -T db psql -U postgres -d agm
```

## 7. Troubleshooting

### 7.1 Cannot Connect to DB Container

Checks:
1. `docker compose ps`
2. `docker compose logs db --tail=100`
3. Confirm service name is `db`

### 7.2 Authentication Errors

Checks:
1. Confirm credentials (`postgres` / `postgres`)
2. Confirm target database is `agm`
3. Confirm no environment override changed credentials

### 7.3 No Tables Visible

Checks:
1. Confirm active DB is `agm` (`\c agm`)
2. Ensure backend startup completed `init_db()`
3. Check backend logs for startup or migration-patch errors

## 8. Safety Notes

- Avoid destructive SQL in shared environments.
- Prefer explicit transactions for manual updates.
- Take backups before data corrections.
- For production schema changes, use migration tooling instead of ad-hoc direct edits.
