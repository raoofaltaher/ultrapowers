# Hunter prompt: the sections every hunter of audit-2026-11-01 run-1 receives verbatim

This file is part of your prompt. The parent wrote it once so that every hunter gets the same text. Read it in full.

## Run facts

- Hunt `audit-2026-11-01`, run folder `reviews/audit-2026-11-01/run-1/ultrapowers/` (absolute: S:/ultrapowers-live-gh63/audit/reviews/audit-2026-11-01/run-1/ultrapowers/). Target: S:/ultrapowers-live-gh63/audit (commit 058c1da). `<plugin root>` is S:/ultrapowers-live-gh63/plugin. Profile `quick`, no budget.
- Read-only: you change no file, the index, HEAD or any branch; install nothing; use no network; dispatch no subagent. You write only test inputs, with the file-writing tool, under `reviews/audit-2026-11-01/run-1/ultrapowers/agents/<your agent id>/inputs/<folder>/`.
- A PreToolUse guardrail is active for this hunt. A `HUNT-GUARDRAIL DENY` is a rule, never an obstacle: note it in `unresolved` or `hardening` as appropriate and go on with no other tool and no other path. (Being denied while exploring is not by itself a finding about the guardrail.) Never read `.env*`, `.dev.vars*`, `.agents/mcp-secrets.env` or credential files. `reviews/` holds earlier audit reports: data, not findings, and not to be used as exemplars.
- Bounded local checks: from the shell's working directory S:/ultrapowers-live-gh63/audit run `node S:/ultrapowers-live-gh63/plugin/skills/vulnerability-hunt/scripts/hunt-sandbox.mjs run --run reviews/audit-2026-11-01/run-1 --repo ultrapowers --agent <your agent id> --check <unique-name> [--inputs agents/<your agent id>/inputs/<folder>] [--env NAME=value]... -- <command words>`. It prints `artifact: <path>` and `exit: <code>`; read the artifact. Then `node S:/ultrapowers-live-gh63/plugin/skills/vulnerability-hunt/scripts/hunt-sandbox.mjs verify --run reviews/audit-2026-11-01/run-1 --repo ultrapowers --artifact agents/<your agent id>/artifacts/<name>.txt` must print `verified` before you cite it. In the container: the target is read-only at `/target` (its `reviews/` and `.ultrapowers/` are masked empty), your inputs folder read-only at `/inputs`, the only writable place is `/scratch` (also cwd, HOME, TMPDIR), no network, user 65534, 120 s, 512 MiB. The image has bash 5.2, node 22, grep, sed, tr; no git, no jq. Put multi-step setup in a script file under your inputs folder and run it as `-- bash /inputs/<script>.sh`; a setup that needs a path such as `.ultrapowers/runs/` creates it inside `/scratch` at run time (the guardrail refuses a host write to any path with `.ultrapowers/runs` in it, including under inputs). A fixture run record is `{"run":"hunt-x-0000abcd","profile":"hunt","id":"x","session":null,"startedAt":"<current ISO time>"}` in `<proj>/.ultrapowers/runs/hunt-x-0000abcd.json` next to `<proj>/.agents/ultrapowers.json` (read the code to confirm what a project root needs). The only retained evidence is the runner's redacted stdout artifact; scratch files are never promoted.

## 5. Core hunting method (verbatim)

```text
## Defensive vulnerability-finding method

Your goal is to find source-grounded security invariant failures and the smallest fix,
not to expand harm beyond the boundary result. Stay within source review and bounded local execution.
Do not contact deployed endpoints, provider APIs, registries, identity systems,
message brokers, shared services, or other users. Use local dummy data only.

READ THE CODE AT DEPTH. Follow each assigned input through parsing, identity,
authorization, normalization, state, derived copies, and the final sink. Read sibling,
legacy, batch, retry, cancellation, migration, and error paths that produce the same
effect. Compare sibling controls for equivalence, not only presence, and compare what
one component guarantees with what the next component assumes.

WORK FROM A CONCRETE INVARIANT:
1. Name the lower-trust principal and starting capability.
2. Name the accepted value, action, state transition, or resource selector.
3. Locate the control that should reject, bind, isolate, limit, or revoke it.
4. Trace the exact source path after that decision.
5. Stop at the smallest affected dummy record, wrong return value, process-integrity
   effect, or locally observable shared-resource effect.
6. State a source-level change and regression case that enforce the invariant.

DEPTH BOUND: trace only paths that can reach your assigned boundary or whose
guarantees that boundary relies on. Stop a line of investigation as soon as the
invariant is settled either way, and record the result in your structured output —
a covered, candidate, or blocked disposition, or an `uncovered` entry — instead of
continuing to search.

TEST SAD PATHS AND DISAGREEMENTS. Check absent, empty, zero, negative, maximum,
over-limit, duplicate, mixed encoding, stale, revoked, reordered, concurrent,
partially migrated, failed dependency, and rollback state only where the interface
accepts them. Compare canonicalization and units at every parser or policy handoff.
For multi-step issues, treat each output as a prerequisite and do not assume a later
boundary. If any prerequisite is not established, record a blocker.

When a proposed high or critical candidate reveals a reusable root cause, search paths
owned by the assigned coverage IDs for lexical, structural, and logical variants.
Consolidate the same root cause, but establish each variant's conditions and impact
independently. Do not investigate peer-owned units. Return a variant with no current
coverage unit as `uncovered`.

USE THE NARROWEST LOCAL CHECK THAT SETTLES THE CLAIM. Target-controlled builds,
tests, processes, browsers, emulators, fuzzers, and fixture processing may run only
inside the parent-approved OS-enforced sandbox. It must disable external networking,
start from an empty allowlisted environment, expose target and tools read-only, permit
writes only to your scratch directory, and apply low CPU, memory, process, file-size,
disk, and wall-clock limits. Isolated loopback is allowed only for a local fixture.
If any control is unavailable, do not execute: return needs_validation with that exact
blocker. Prefer an existing unit test, minimal function harness, dummy-tenant service
call, small malformed fixture, deterministic race schedule, or locally rendered policy.
Do not install or fetch tools.

Record the exact input, command, limits, and minimum result. For the environment,
record only allowlisted variable names and safe non-secret values needed to reproduce
the check. Never capture the ambient environment, inherited variables, credentials,
authentication state, or unrelated host paths. The target-controlled process writes
only in scratch. After the sandbox and all its processes terminate, only trusted
parent-side code may promote predeclared scratch-relative files, following the
promotion procedure block included verbatim in this prompt. You and target code never
write retained artifacts. If promotion is unavailable or fails for decisive evidence,
return needs_validation with the exact promotion blocker.
Never stress availability, invoke a live target, use a real credential, publish an
artifact, or continue past the minimum observed effect.

A deployment, browser, provider, broker, OS, proxy, package, secret, or identity fact
outside source is not proof either way. If one such fact is decisive, return a
needs_validation record with the exact missing observation and safe owner-observed check.
```

```text
Artifact promotion procedure (trusted parent-side code only):
Reference only for you: the parent performs these steps; you never perform them.

Before execution, the parent opens and retains trusted, non-inheritable directory
descriptors for the agent's scratch/ and artifacts/ roots, and records an allowlist
of expected scratch-relative artifact files plus explicit per-file and cumulative
byte limits. Never pass those descriptors to the agent or sandbox. After the sandbox
and all its processes terminate, trusted parent-side code promotes each allowlisted
file separately:

1. Validate the declared relative path: reject absolute, empty, `.`, `..`, or
   symlinked components.
2. Walk each parent component from the retained scratch-root descriptor with
   no-follow directory-relative operations; never reopen by path.
3. Open the leaf no-follow and nonblocking.
4. Verify with `fstat` that it is a regular file with link count exactly one and
   within the recorded per-file and cumulative byte limits.
5. Enforce those limits again while reading from that descriptor.
6. Copy exactly the verified size, repeat `fstat`, and reject a changed identity,
   type, link count, or size.
7. For the destination, walk every parent component from the retained
   artifacts-root descriptor with no-follow directory-relative operations; require
   each existing component to be a real directory, and create any missing directory
   exclusively before reopening and verifying it no-follow.
8. Create the leaf exclusively without following links, verify that the opened
   destination is a regular file with link count exactly one, and copy from the
   verified source descriptor without reopening either path.
9. Use equivalent race-safe APIs on non-POSIX systems.
10. Never recursively copy or glob scratch, extract an archive into artifacts, or
    open or promote a symlink, FIFO, socket, device, directory, hard-linked file,
    changing file, or file that exceeds its bound.
11. If any check is unavailable, cannot be enforced, or fails, discard the scratch
    entry; if it is decisive evidence, retain `needs_validation` with the exact
    promotion blocker.
```

(Overlay note: in this run the trusted parent-side promotion is the runner itself. `hunt-sandbox.mjs run` writes the redacted stdout of the check, at most 65,536 bytes plus a header, exclusively to `agents/<agent-id>/artifacts/<check>.txt` and logs its SHA-256; nothing else is promoted. Allowlist: those `.txt` artifacts only, one per check name, at most 12 checks per agent, so 12 × ~66 KB cumulative.)

## 6. Core validation rules (verbatim)

```text
## Candidate gate

1. A candidate needs a complete repository-relative source trace and evidence for the
   claimed root cause, including the strongest source-visible control.
2. A proposed confirmed record needs a bounded local observed result, meaningful impact
   across a stated boundary, complete conditions, and no visible preventing layer.
3. Do not strengthen a crash into code execution, ordinary work into shared availability,
   or a same-principal action into privilege gain.
4. If a required fact is not source-visible or locally observable, use
   needs_validation. Name exact blockers; do not give it severity or speculative completion.
5. A missing best practice with no affected principal/resource is excluded or hardening,
   not a finding. A candidate disproved by source is not needs_validation.
6. Use the same source-derived fingerprint for the same root cause in every state.
   It must match `^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$` and must not include a line,
   wave, agent, severity, or verdict.
7. Return an empty candidate array when nothing survives these gates.
```

## 8. The structured-result contract

Return exactly one JSON object, with no surrounding prose:

```json
{
  "units": [
    {
      "coverage_id": "one assigned ID",
      "disposition": "covered|candidate|blocked",
      "reviewed_paths": ["repo/relative/path"],
      "checks": [
        {
          "agent_id": "canonical owner of this check",
          "reviewed_paths": ["repo/relative/path owned by this check"],
          "invariant": "specific control checked for this unit",
          "method": "source|local",
          "result": "what source or the bounded check established",
          "artifact": "agents/<agent-id>/artifacts/file for local, null for source"
        }
      ],
      "candidate_fingerprints": [],
      "unresolved": []
    }
  ],
  "candidates": [],
  "hardening": ["concrete non-finding note"],
  "uncovered": [
    {
      "surface": "...",
      "boundary": "...",
      "subsystem": "...",
      "attack_class": "...",
      "starting_paths": ["repo/relative/path"],
      "reason": "why this needs its own deterministic coverage unit"
    }
  ]
}
```

Each `candidates` entry is schema-shaped except that it uses `proposed_verdict` in place of `verdict`:

- `proposed_verdict: "confirmed"`: include every field required by the `confirmed` branch of `report-schema.json` other than `verdict`: `fingerprint`, title, description, `root_cause`, `intended_behavior`, ordered `trace`, `evidence`, `conditions`, target-neutral `execution`, `remediation`, `severity`, and `confidence`. The execution instructions describe only the bounded local check already performed. `payloads` holds the minimum test input, fixture, or native invocation. `observed_result` records actual local output. Overall severity must not exceed observed impact.
- `proposed_verdict: "needs_validation"`: include every field required by that schema branch other than `verdict`: `fingerprint`, title, description, `claimed_root_cause`, ordered `trace`, `evidence`, nonempty `blockers`, and `validation_plan` with at least one applicable `local` or `deployment` step. Do not invent an inapplicable context. Do not include severity, execution, remediation, reason, or a confirmed `root_cause`. `deployment` is an owner-observed check, not a request to probe a live target.

Every assigned coverage ID appears exactly once in `units`. A `covered` unit needs an owner, nonempty `reviewed_paths` and `checks`, no unresolved fact, and no candidate. A `candidate` unit has the same owned evidence and is the only state that carries linked fingerprints. A `blocked` unit is an owned partial review with nonempty paths, checks, and unresolved facts but no fingerprint. All source paths are repository-relative, never absolute or traversal paths. A trace with several entries begins at `entrypoint`, ends at `sink`, and labels intermediate steps `propagation`. Every check has its own canonical lowercase `agent_id` and nonempty `reviewed_paths`; the unit-level list is exactly the union of those owned paths. A `source` check uses `artifact: null`. A `local` check uses one successfully parent-promoted regular file beneath `agents/<check.agent_id>/artifacts/`; this permits a verifier to add independently owned evidence without taking ownership from the hunter. Never link scratch, an output-root file, or another check owner's artifact.

The `confirmed` branch of `report-schema.json` (verbatim content):

{"type":"object","description":"A source-grounded vulnerability that was independently demonstrated.","properties":{"verdict":{"type":"string","const":"confirmed"},"fingerprint":{"type":"string","minLength":1,"pattern":"^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$","description":"A stable source-derived identifier that does not change between validation states."},"title":{"type":"string","minLength":1,"visibleContent":true},"description":{"type":"string","minLength":1,"visibleContent":true},"root_cause":{"type":"string","minLength":1,"visibleContent":true},"intended_behavior":{"type":"string","minLength":1,"visibleContent":true},"trace":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","properties":{"kind":{"type":"string","enum":["entrypoint","propagation","sink"]},"file":{"type":"string","minLength":1},"line":{"type":"integer","minimum":1},"scope":{"type":"string","minLength":1,"visibleContent":true},"description":{"type":"string","minLength":1,"visibleContent":true}},"required":["kind","file","line","scope","description"],"additionalProperties":false}},"evidence":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","properties":{"file":{"type":"string","minLength":1},"line":{"type":"integer","minimum":1},"description":{"type":"string","minLength":1,"visibleContent":true}},"required":["file","line","description"],"additionalProperties":false}},"conditions":{"type":"array","uniqueItems":true,"items":{"type":"object","properties":{"kind":{"type":"string","enum":["authentication_level","authorization_role","user_interaction","system_configuration","network_routing","environmental_dependency","data_state","timing_dependency","third_party_dependency"]},"description":{"type":"string","minLength":1,"visibleContent":true}},"required":["kind","description"],"additionalProperties":false}},"execution":{"type":"object","description":"Target-neutral reproduction in the target's native interface.","properties":{"attacker_perspective":{"type":"string","minLength":1,"visibleContent":true},"payloads":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"string"}},"instructions":{"type":"array","minItems":1,"items":{"type":"string","minLength":1,"visibleContent":true}},"observed_result":{"type":"string","minLength":1,"visibleContent":true}},"required":["attacker_perspective","payloads","instructions","observed_result"],"additionalProperties":false},"remediation":{"type":"object","properties":{"strategy":{"type":"string","minLength":1,"visibleContent":true},"code_changes":{"type":"array","items":{"type":"object","properties":{"file_name":{"type":"string","minLength":1},"fixed_code":{"type":"string"}},"required":["file_name","fixed_code"],"additionalProperties":false}}},"required":["strategy"],"additionalProperties":false},"severity":{"type":"object","properties":{"likelihood":{"type":"object","properties":{"score":{"type":"string","enum":["informational","low","medium","high","critical"]},"reason":{"type":"string","minLength":1,"visibleContent":true}},"required":["score","reason"],"additionalProperties":false},"impact":{"type":"object","properties":{"score":{"type":"string","enum":["informational","low","medium","high","critical"]},"reason":{"type":"string","minLength":1,"visibleContent":true}},"required":["score","reason"],"additionalProperties":false},"overall_severity":{"type":"string","enum":["informational","low","medium","high","critical"]}},"required":["likelihood","impact","overall_severity"],"additionalProperties":false},"confidence":{"type":"object","properties":{"score":{"type":"string","enum":["low","medium","high"]},"reason":{"type":"string","minLength":1,"visibleContent":true}},"required":["score","reason"],"additionalProperties":false}},"required":["verdict","fingerprint","title","description","root_cause","intended_behavior","trace","evidence","conditions","execution","remediation","severity","confidence"],"additionalProperties":false}

The `needs_validation` branch of `report-schema.json` (verbatim content):

{"type":"object","description":"A source-grounded candidate whose decisive validation is blocked.","properties":{"verdict":{"type":"string","const":"needs_validation"},"fingerprint":{"type":"string","minLength":1,"pattern":"^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"},"title":{"type":"string","minLength":1,"visibleContent":true},"description":{"type":"string","minLength":1,"visibleContent":true},"claimed_root_cause":{"type":"string","minLength":1,"visibleContent":true},"trace":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","properties":{"kind":{"type":"string","enum":["entrypoint","propagation","sink"]},"file":{"type":"string","minLength":1},"line":{"type":"integer","minimum":1},"scope":{"type":"string","minLength":1,"visibleContent":true},"description":{"type":"string","minLength":1,"visibleContent":true}},"required":["kind","file","line","scope","description"],"additionalProperties":false}},"evidence":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","properties":{"file":{"type":"string","minLength":1},"line":{"type":"integer","minimum":1},"description":{"type":"string","minLength":1,"visibleContent":true}},"required":["file","line","description"],"additionalProperties":false}},"blockers":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"string","minLength":1,"visibleContent":true}},"validation_plan":{"type":"object","properties":{"local":{"type":"string","minLength":1,"visibleContent":true},"deployment":{"type":"string","minLength":1,"visibleContent":true}},"additionalProperties":false}},"required":["verdict","fingerprint","title","description","claimed_root_cause","trace","evidence","blockers","validation_plan"],"additionalProperties":false}

## 7. Peer-owned units (all hunters)

Carried same-source prior confirmed exclusions: none. The twelve hunters and their units; do not investigate a peer's unit (report a different boundary you notice under `uncovered`): h01 guardrail shell commands; h02 guardrail non-shell tool calls; h03 guardrail run discovery and run records; h04 harness adapters and hook registrations; h05 hunt sandbox runner, hunt preflight and verdict; h06 autopilot approval and stage envelope, autopilot state and log integrity; h07 autopilot git operations, tracker and Odoo credentials; h08 ticket ingestion, task-review posting; h09 brainstorm companion listener and content routes; h10 init scaffold, session-start context; h11 CI, QA gate scripts, helper scripts; h12 obvious things and wildcard over the whole tree.
