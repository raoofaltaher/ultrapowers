---
name: qa-lane-4-db
description: Use when the qa-specialist agent verifies in the database, read-only, what the UI or API claimed to do: persistence, tenant scoping, audit rows and timestamps. Gated on qa.db; prefers the configured read-only role; inline single statements only.
user-invocable: false
---

# Lane 4 — Database verification (READ-ONLY)

## Gate

Active when `qa.db.engine`, `qa.db.database` and one of `qa.db.container` or `qa.db.host` are
set. Otherwise `not-covered — qa.db is not configured`, stated in the report. Engine recipes live
in `recipes/<engine>.md` next to this skill; `postgres` ships. An engine without a recipe is
`not-covered — no recipe for engine <engine>`.

## Connecting

Follow the engine recipe. Credential preference order:

1. **The read-only role** `qa.db.roRole` with the password in `qa.db.roPasswordEnv` (provisioned
   by the recipe's role script; SELECT-only at the engine layer; the least-privilege path).
2. **Fallback** (role not provisioned): the application's own connection, referenced by the
   variable names inside the database container so no value enters the session (see the recipe).
   Behave as if read-only anyway, and add "provision `qa.db.roRole` with the recipe's role
   script" to the report's known-issues candidates.

**Inline single statements only.** Script files, heredocs, stdin, DO blocks, CTE writes, SQL
comments and command substitution are denied by the guardrail and off-limits by design.

## What to verify (per mutating scenario from lanes 1 and 3)

- **Persistence:** the row the UI or API claimed to create, update or delete actually is created,
  updated or soft-deleted; a targeted SELECT with a WHERE clause, never a table dump.
- **Tenant scoping** (when `qa.db.tenantColumn` is set): every row carries the test tenant's
  value; a row visible or written across tenants is Critical.
- **Timestamps and audit:** created and updated timestamps move as expected; when
  `qa.db.auditTables` is set, each mutating scenario leaves an audit row naming the actor.
- **Double-submit follow-up** (from lane 3): exactly one row.
- UI-shows-success-but-database-unchanged is a recurring bug class: when the UI claims success,
  ALWAYS check the row before marking the scenario passed.

## Evidence

Save query and result to `reviews/<ID>/artifacts/db-<finding>.txt` at capture time. For coverage,
append every verification query and its row count to `db-checks.txt`; without it the lane is not
`done`. Redact personal-looking values from other tenants if any appear (they should not; that is
a finding in itself).

## Never

No INSERT, UPDATE, DELETE or DDL: not to "set up test data" (the app UI or API does that), not to
clean up. If a check needs data that only SQL could create, record the scenario as
`not-covered — needs seeded data` instead.
