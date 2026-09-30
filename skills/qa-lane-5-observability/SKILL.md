---
name: qa-lane-5-observability
description: Use when the qa-specialist agent verifies traces for a feature that touches an LLM or agent stack (presence, shape, correctness, masking) against the configured observability provider, or checks the observability stack's health for everything else. Gated on qa.observability and the change set.
user-invocable: false
---

# Lane 5 — Traces and observability

## Applicability gate

Two conditions, both required for full verification:

1. `qa.observability.provider` is set and not `none`, and the key variables named by
   `publicKeyEnv` and `secretKeyEnv` are present in the environment (`gates.lane5.active`).
2. The change set touches an LLM or agent stack: changed files under directories or with names
   containing `agent`, `llm`, `prompt`, `completion`, `assistant`, `rag`, `embedding`, or the
   spec names a model call.

Both true → **full trace verification** below, per `recipes/<provider>.md` (`langfuse` ships).
Condition 1 true, condition 2 false → **stack-health only**: the provider answers its health
route (from the recipe) and the collector container (if listed in `qa.containers.watch`) shows no
export errors in the watermark window; record the lane as "stack-health only — feature does not
touch the LLM or agent stack". Condition 1 false → `not-covered — <gates.lane5.reason>`.

## Access

Read the keys into shell variables by name and pass them by name; never echo them. The API base
is `qa.urls.observability`.

## Full verification (LLM or agent-touching features)

- **Presence:** every model or agent interaction you drove in lane 1 produced a trace in the run
  window (`fromTimestamp = watermark`). A missing trace is a finding (observability regression).
- **Shape:** spans follow the structure the recipe describes for the provider and the project's
  instrumentation (turn → iteration → tool dispatch → tool execution, plus a generation span with
  model, tokens and cost); traces group by the session or conversation identifier.
- **Correctness:** the tool calls in the trace match what the answer claimed; no error-status
  observations; latency and cost within sane bounds (a tenfold cost outlier is a Performance-lite
  finding).
- **Masking:** personal data (emails, phone numbers) must NOT appear in stored spans; a leaked
  value is Critical.
- **Cross-store check** for any suspicious answer (no reproduction needed): the application's
  own record of the interaction (lane 4, when active), the tool-call log the application keeps,
  and the provider's observations must agree. Disagreement between stores is itself a finding.

## Evidence

Trace ids and relevant span excerpts to `reviews/<ID>/artifacts/trace-<finding>.txt` at capture
time; ids and timings, never keys, never full prompts containing personal data. For coverage,
write the run window's trace list (id, name, timestamp, latency, cost) or the stack-health result
to `trace-window.txt`; without it the lane is not `done`.
