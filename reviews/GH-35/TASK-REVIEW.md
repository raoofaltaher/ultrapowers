# Task review — GH-35

| Ticket | GH-35 |
|---|---|
| Date (UTC) | 2026-10-11 04:49 |
| Repositories | .: GH-35-array-slice against dev at 1ec1784 |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: BLOCKED — there is no usable QA verdict; the code review found 1 Important finding and 1 Minor finding.

## Summary

0 Critical findings, 1 Important finding and 1 Minor finding across 1 repository. QA gate: no verdict. there is no usable QA verdict; the code review found 1 Important finding and 1 Minor finding.

## Code review

### . (GH-35-array-slice against dev)

#### Critical

None.

#### Important

1. **Slice exemption lets psql interpolation through (whitespace before colon; -v variables)** `hooks/lib/qa-shell-writes.mjs:233`
   - Problem: The blanking regex (\w)\s*:\s*(?=\w) inside any [...] span accepts `[ x :v ]` and `a[1:n]` where psql still substitutes :v / :n. `psql -v n=... -c 'select a[1:n] from t'` is allowed; -v is not refused. Substituted text can close the slice and append SQL the analyzer never saw.
   - Root cause: A static check cannot tell a slice from a variable reference (psql lexes :name everywhere outside quotes), and the exemption trusts any bracket span and tolerates whitespace.
   - Fix: Fixed on the branch after this review: the exemption is limited to integer bounds ([2:3]); a bound that is a name stays refused; -v, --set and --variable are refused; the adversarial rows are in the test.

#### Minor

1. **Tests lack adversarial rows for the new regex** `tests/qa-gatekeeper/qa-shell-writes.test.mjs:434`
   - Problem: No rows for a[x :v], -v with a slice, nested brackets, a[1::n], an unclosed [, or a slice followed by '; select :v'.
   - Root cause: Only the cases listed in the spec were written.
   - Fix: Added on the branch after this review: [ x :v ], a nested a[b[1:2]:n], a[1:2]; select :v, and the four -v spellings.

#### TDD assessment

partial — Behavior tests through analyze, no mocks, cases match the spec, test-first claimed in the commit message but not independently verifiable. Missing adversarial and regression rows around the new regex (added after the review).

#### Strengths

- Minimal change in the right place on stripped text
- Later rules read the unblanked text, so SELECT INTO, function and split checks are unaffected
- Fails closed on unclosed brackets, a[:n], a[1: :n] and a[x:"y"]
- No fixture or other caller verdict changes; the unit tests pass

#### Declined to judge

- Behavior of a live psql on bracketed :n substitution (not executed)
- The remaining qa-gatekeeper fixture runs (the reviewer's run timed out; the dispatcher ran every psql fixture by hand, all as expected)

## QA gate

> No QA report was found for ticket GH-35; the gate has not produced a verdict.
