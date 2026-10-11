# GH-35: an array slice is not psql interpolation

Path: bounded (two lines in an existing rule). Design presented to the Owner on 2026-10-11.

## Problem

`analyzeSql` refuses any `:name` sequence as psql variable interpolation, so a PostgreSQL array slice such as `select a[1:n] from t` is denied during a QA run. At the same time the `:'name'` and `:"name"` spellings of interpolation are not caught after literal stripping.

## Design

- On the literal-stripped text, blank each colon inside square brackets that has a word character on both sides (`[1:n]`, `[2:3]`, `[i:j]`) before the interpolation check: a slice is a read.
- The interpolation check covers the three psql spellings: `:name`, `:''` (what the stripper leaves of `:'name'`), and `:"name"`. A `::` cast is untouched, and a colon inside a string literal is already text.

## Files

- `hooks/lib/qa-shell-writes.mjs`: the two lines of the rule in `analyzeSql`.
- `tests/qa-gatekeeper/qa-shell-writes.test.mjs`: slices pass (`a[1:n]`, `arr[2:3]`, `m[i:j]`); `select :name`, `select :'name'`, `select :"name"` are refused, also inside brackets without a word on both sides (`a[:n]`); `select 1::int` still passes.
- `RELEASE-NOTES.md`: a line under `## Unreleased`.

## Acceptance

The unit tests above, written first and watched failing.
