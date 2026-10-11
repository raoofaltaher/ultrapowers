# GH-35: an array slice with integer bounds is not psql interpolation

Path: bounded (two lines in an existing rule). Design presented to the Owner on 2026-10-11; narrowed the same day after the security review of the first commit.

## Problem

`analyzeSql` refuses any `:name` sequence as psql variable interpolation, so a PostgreSQL array slice such as `select arr[2:3] from t` is denied during a QA run. At the same time the `:'name'` and `:"name"` spellings of interpolation are not caught after literal stripping.

## Design

- On the literal-stripped text, blank each colon inside square brackets that has an integer on both sides (`[2:3]`) before the interpolation check: a slice with literal bounds is a read. A bound that is a name (`[1:n]`, `[i:j]`) stays refused: psql substitutes a variable of that name, set with `-v` or a psqlrc, and the analyzer cannot see it. The refusal message says that a slice needs integer bounds.
- `psql -v`, `--set` and `--variable` (attached or separate) are refused: they define the variables any `:name` would substitute.
- The interpolation check covers the three psql spellings: `:name`, `:''` (what the stripper leaves of `:'name'`), and `:"name"`. A `::` cast is untouched, and a colon inside a string literal is already text. The later rules keep reading the unblanked text.

## Files

- `hooks/lib/qa-shell-writes.mjs`: the slice blanking, the widened check and the `-v` refusal in `analyzeSql` and `analyzePsql`.
- `tests/qa-gatekeeper/qa-shell-writes.test.mjs`: integer slices pass (`arr[2:3]`, `a[1 : 10]`, `a[1:2]::text`); `select :name`, `select :'name'`, `select :"name"`, `a[:n]`, `a[1:n]`, `m[i:j]`, `[ x :v ]`, a nested `a[b[1:2]:n]` and `a[1:2]; select :v` are refused; `-v`, `--set=`, `--variable` and `-vn=3` are refused; `select 1::int` still passes.
- `RELEASE-NOTES.md`: a line under `## Unreleased`.

## Acceptance

The unit tests above, written first and watched failing; every `psql` fixture of the guardrail suite unchanged in verdict.
