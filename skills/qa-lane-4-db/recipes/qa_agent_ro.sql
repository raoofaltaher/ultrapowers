-- qa_agent_ro.sql: dedicated read-only role for QA lane 4 (qa.db.roRole).
-- Idempotent: safe to re-run at any time, including after migrations add tables or schemas.
--
-- Apply as a superuser, against the application database (grants are per database), with
-- every value supplied as a psql variable (psql 10 or newer; never a password in a file):
--   docker exec -i <db-container> psql -U postgres -d <database> \
--     -v ro_pass="$<password variable>" -v ro_role=qa_agent_ro -v owner=<migration role> \
--     -f - < qa_agent_ro.sql
--   ro_pass  required. Without it the first statement fails on the literal :'ro_pass' and
--            ON_ERROR_STOP ends the script before anything changes.
--   ro_role  optional, default qa_agent_ro.
--   owner    optional, default the role running this script: the role whose FUTURE tables
--            the read-only role may read (the one that runs the application's migrations).
--
-- THE GUARANTEE IS THE GRANTS: this role has SELECT and nothing else. No INSERT, UPDATE, DELETE
-- or DDL privilege exists to use, so writes fail at the privilege layer.
-- default_transaction_read_only is set as well, but it is session-overridable; it is a
-- convenience, not the guarantee. The guardrail hook is the outer layer on top.

\set ON_ERROR_STOP on
\if :{?ro_role}
\else
  \set ro_role qa_agent_ro
\endif
\if :{?owner}
\else
  SELECT current_user AS owner \gset
\endif

-- Create the role if missing, else rotate its password to the supplied value.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'ro_role', :'ro_pass')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'ro_role') \gexec
ALTER ROLE :"ro_role" WITH LOGIN PASSWORD :'ro_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE :"ro_role" SET default_transaction_read_only = on;

-- Every application schema (public and any other non-system schema): USAGE, SELECT on the
-- current tables, SELECT on the owner's future tables, and no CREATE. \gexec runs each
-- column of each row as its own statement, so psql variables reach every schema without a
-- DO block (psql does not interpolate variables inside dollar quotes).
SELECT format('GRANT USAGE ON SCHEMA %I TO %I', nspname, :'ro_role'),
       format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', nspname, :'ro_role'),
       format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO %I', :'owner', nspname, :'ro_role'),
       format('REVOKE CREATE ON SCHEMA %I FROM %I', nspname, :'ro_role')
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND nspname NOT LIKE 'pg_temp_%'
  AND nspname NOT LIKE 'pg_toast_temp_%'
ORDER BY nspname \gexec

-- Verification (the CREATE failing is the success condition):
--   psql -U <ro_role> -d <database> -c "SELECT 1;"
--   psql -U <ro_role> -d <database> -c "CREATE TABLE nope(x int);"
--     -> ERROR: permission denied for schema public            (PostgreSQL 15 and newer)
--     -> ERROR: cannot execute CREATE TABLE in a read-only transaction   (older versions)

-- Optional hardening (a decision for the database owner, so it is commented out). PostgreSQL lets
-- every role EXECUTE every function by default, and a function can write data even though the role
-- holds SELECT only. The guardrail hook refuses the write-capable built-ins and every statement
-- that is not a read, but it cannot see inside a function of your own schema. To close that, run
-- once as the owner, then GRANT EXECUTE on the functions the application's reads need:
--   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
