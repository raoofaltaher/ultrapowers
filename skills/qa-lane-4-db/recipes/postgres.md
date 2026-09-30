# Lane 4 recipe: postgres

## Read-only role (preferred)

Run as the read-only role with its password taken from the environment variable named by
`qa.db.roPasswordEnv`; pass it into the container by name, never by value:

```bash
docker exec -e PGPASSWORD="$<qa.db.roPasswordEnv>" <qa.db.container> psql -U <qa.db.roRole> -d <qa.db.database> -c "SELECT count(*) FROM <table> WHERE <tenantColumn> = '<tenant id>'"
```

When `qa.db.host` is set instead of a container, use `psql -h <qa.db.host> -U <qa.db.roRole> -d
<qa.db.database> -c "..."` with `PGPASSWORD` exported from the named variable in the same
command line.

## Fallback: the container's own application connection

The official Postgres image exposes the application user and database as `POSTGRES_USER` and
`POSTGRES_DB` inside the container. Reference them by name inside the container so the values
never reach the session:

```bash
docker exec <qa.db.container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM <table>"'
```

Behave read-only. Never connect as `postgres` by name; the guardrail denies the superuser
because it bypasses every grant. When the container's `POSTGRES_USER` is itself the superuser
(the image default), this fallback is a superuser session the guardrail cannot see: make
"provision `qa.db.roRole`" the first known-issues candidate and keep every statement a SELECT.

## Useful read-only shapes

- Latest rows for a scenario: `SELECT id, created_at, updated_at FROM <table> ORDER BY created_at DESC LIMIT 5`
- Exactly-one check after a double submit: `SELECT count(*) FROM <table> WHERE <natural key> = '<value>'`
- Tenant scoping: `SELECT DISTINCT <tenantColumn> FROM <table> WHERE id IN (<ids you created>)`
- Audit row: `SELECT actor, action, created_at FROM <audit table> ORDER BY created_at DESC LIMIT 5`

## Provisioning the read-only role (a human does this once, outside a QA run)

`qa_agent_ro.sql` next to this file creates or rotates the role named by `qa.db.roRole` (default
`qa_agent_ro`) with USAGE and SELECT on every application schema, default privileges for the
tables the migration role creates later, and no CREATE. Grants are per database, so run it
against `qa.db.database`, as a superuser, outside any QA run (the guardrail would deny it during
one), with every value supplied as a psql variable (psql 10 or newer):

```bash
docker exec -i <qa.db.container> psql -U postgres -d <qa.db.database> -v ro_pass="$<qa.db.roPasswordEnv>" -v ro_role=<qa.db.roRole> -v owner=<role that runs the migrations> -f - < <plugin root>/skills/qa-lane-4-db/recipes/qa_agent_ro.sql
```

`ro_pass` is required; `ro_role` defaults to `qa_agent_ro`; `owner` defaults to the role running
the script. Re-run it after a migration adds a schema.

Verify (run by the human, outside a QA run):

```bash
docker exec -e PGPASSWORD="$<qa.db.roPasswordEnv>" <qa.db.container> psql -U <qa.db.roRole> -d <qa.db.database> -c "SELECT 1"
docker exec -e PGPASSWORD="$<qa.db.roPasswordEnv>" <qa.db.container> psql -U <qa.db.roRole> -d <qa.db.database> -c "CREATE TABLE nope(x int)"
```

The first prints `1`. The second must fail: `permission denied for schema public` on PostgreSQL
15 and newer, or `cannot execute CREATE TABLE in a read-only transaction` on older versions,
where PUBLIC still holds CREATE on `public` (revoking that from PUBLIC is a project decision).
That failure is the success condition.
