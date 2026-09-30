---
name: qa-lane-7-content
description: Use when the feature under QA generates content, such as documents, exports, reports, summaries, translations, emails or model answers, and that content's quality must be judged, not only the flow that produced it
user-invocable: false
---

# Lane 7 — Generated-content quality

A flow that produces a file proves the flow, not the file. This lane judges what the feature
generated in this run, with the smallest set of checks that can each be verified from the
artifact itself. Your human partner reads the result as "the content is right", so a check you
did not run is `pending`, never passed.

## Gate

Active when the preflight found generation terms in the brief or spec (`gates.lane7.active`,
with the terms as the reason) OR you observe a generated artifact during the sweep (a download,
a rendered document, a model answer, an email preview, an export). When neither happens, the
lane is `not-covered — the feature generates nothing`, stated in the report. Do not invent
content to judge.

## Inventory

List every generated artifact the spec names and every one you observed, with: the action that
produced it, the role and language of the session, the format (PDF, DOCX, CSV, HTML, Markdown,
plain text, JSON, email), and where you saved a copy under `reviews/<ID>/artifacts/`. Write the
inventory, with each artifact's five check results as you get them, to `content-inventory.txt`.

## Checks, per artifact (the smallest verifiable set)

| Check | How | Finding when |
|---|---|---|
| Correctness against the spec | compare the content's facts, sections and numbers to what the spec and the inputs you entered say it must contain | a required element is missing, a fact contradicts the inputs, or numbers do not add up (Medium; Critical when the content is a decision record, a legal or financial document) |
| Language matches the requested locale | the artifact was produced in a session set to language `<lang>`; every sentence is in that language, including headings, dates and units | mixed languages, untranslated fragments, raw translation keys (Localization, Medium) |
| Format validity | the file opens as its declared type: a PDF starts with `%PDF`, a DOCX or XLSX is a valid zip, a CSV has a consistent column count, JSON parses, HTML has no unclosed structural tags; check with the file-reading tool and `head -c 8` | the file does not open or is empty (Medium) |
| No leaked prompts or internal identifiers | search the content for prompt scaffolding ("You are", "As an AI", "system:", template braces), internal ids (UUIDs, database ids, tenant ids), stack traces, environment names | any hit (Medium; Critical when another tenant's identifier or personal data appears) |
| Consistency across runs | produce the same artifact twice with the same inputs; compare structure and facts (wording may vary for model output) | structure or facts differ (Medium) |

## Evidence

Save each artifact copy and a `content-<finding>.txt` with the check, the expected value, the
observed excerpt (redacting personal data) and the artifact path. Embed a screenshot of the
rendered artifact when it is visual.

## Never

Never judge content you did not generate through the feature in this run. Never edit an artifact
before saving it. Never paste a whole generated document into the report; excerpts only.

## Checklist

Create a todo for each item and complete them in order:

1. **Decide the gate** — `gates.lane7.active`, or an artifact observed in the sweep; neither means
   run-state `lanes.7 = not-covered` with the reason, and stop here
2. **Inventory** — every artifact the spec names and every one observed, with its producing action,
   role, language and format
3. **Save a copy** of each artifact under `reviews/<ID>/artifacts/` before judging it
4. **Run the five checks** on each artifact: correctness, locale, format, leaks, consistency
5. **Write the evidence** — one `content-<finding>.txt` per failed check, at capture time
6. **Record the lane** — `lanes.7 = done` only when every artifact has all five results

## Red Flags

| Thought | Reality |
|---------|---------|
| "The file downloaded and opened, so the lane passed" | Opening proves the format check only. Correctness, locale, leaks and consistency are four more results. |
| "It is model output; wording varies, so any answer is fine" | Wording may vary. Facts, structure, locale and leaked scaffolding may not. |
| "The spec names no generated artifact, so the lane is off" | An artifact observed in the sweep opens the gate too. |
| "I'll judge the example in the spec instead of producing one" | Judge only what the feature produced in this run; the example is the expectation, not the evidence. |
| "A few English headings in the French export are close enough" | Mixed language is a Localization finding. Record it. |
| "Generating it a second time is wasteful" | The consistency check needs two runs with the same inputs; list the extra data under data hygiene. |
| "Pasting the whole document is the best evidence" | Excerpts in the report, the copy under `artifacts/`; a whole document leaks data your human partner never asked to publish. |
