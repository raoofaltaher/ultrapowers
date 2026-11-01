# Parent consolidation (HUNTING.md, "Parent consolidation and ledger update").
# Input: the ledger. $r[0]: one hunter's structured result.
# Per result unit: status = disposition; local_checks = checks (a source check
# with no artifact key gets artifact null); a path the unit lists but no check
# owns is added to the unit's first check, so the unit's reviewed_paths stay the
# union of its checks; fingerprints and unresolved are copied. The hunter's
# hardening list is kept on its first unit as parent bookkeeping.
($r[0]) as $res
| ($res.units | map({key: .coverage_id, value: .}) | from_entries) as $by
| ($res.units[0].coverage_id) as $first
| map(
    if $by[.coverage_id] then
      ($by[.coverage_id]) as $u
      | ($u.checks | map(if has("artifact") then . else . + {artifact: null} end)) as $c0
      | ($u.reviewed_paths - [$c0[].reviewed_paths[]]) as $missing
      | ($c0 | .[0].reviewed_paths += $missing) as $c
      | .status = $u.disposition
      | .local_checks = $c
      | .reviewed_paths = ([$c[].reviewed_paths[]] | unique)
      | .result_fingerprints = $u.candidate_fingerprints
      | .unresolved = $u.unresolved
      | if .coverage_id == $first then .parent_hardening = $res.hardening else . end
    else . end)
