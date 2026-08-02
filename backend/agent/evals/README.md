# Agent capability evaluation

This package provides headless observability and feature-level capability
checks for the production Agent Harness. It does not start Next.js, a browser,
or the map SDK.

## Current scope

- F1 Place resolution: decision state, city, coordinate system/error, provider
  identity, content-hash-bound trace evidence for every required result status,
  parent-tool provenance, result-specific resolver allowlists, and exact
  ready-command target, coordinate, and provider bindings.
- F2 Transit planning: active endpoints and scope, selected-plan membership,
  run/plan identity, ordered and continuous geometry, endpoint and coordinate
  system agreement, plausible non-zero duration, distance/duration aggregates,
  and request fingerprint.
- F6 write protocol: complete command lifecycle, a run/workspace revision floor,
  rejected writes without revision claims, evidence references, typed replay
  outcomes, idempotency-key identity, and trace integrity under one unique root
  run lifecycle.

F3 scheduling, F4 images, and F5 sourced material use the same report contract
but are not part of this first implementation.

Run the initial smoke report with:

```bash
npm run eval:agent:smoke
```

The command prints one JSON report and exits non-zero when any hard metric
fails. It uses recorded/contract data only and makes no provider calls.
`hardPass` is fail-closed: a report needs at least one hard metric, every hard
metric must pass, and a skipped hard metric therefore fails. Persisted reports are
schema-checked against their metrics rather than trusting a supplied boolean.

## Eval Trace

Operational logs and Eval Trace are separate. Eval Trace is a complete,
unsampled, append-only event stream with monotonic sequence numbers and a SHA-256
hash chain. The optional `AgentGateway` trace integration records run, tool,
command, state-diff, and Place-evidence boundaries without copying authoritative
documents or provider payloads into events.

Use `MemoryEvalTraceSink` in focused tests and `JsonlEvalTraceSink` for durable
artifacts. JSONL creation fails if the path already exists so a run cannot
silently overwrite another run. Sensitive keys—including service-key and
database-URL environment names—and credential-shaped strings such as URI
userinfo are redacted before hashing and persistence. `verifyEvalTrace` checks
schema, sequence, one root run, run/scenario identity, hash links, open-parent
ordering, descendant workspace/journey/turn identity, evidence provenance,
command/state-diff identity, cross-command revision continuity, idempotency-key
terminal identity, typed replay semantics, and lifecycle closure. A replay must
match a prior applied outcome and its original revisions exactly, and it cannot
record a new state diff.

Eval Trace is observational. A sink failure makes the trace artifact incomplete
and therefore invalid, but it is isolated from the authoritative `AgentGateway`
operation: a committed command is never reported as rejected and the caller's
production result is unchanged.

Provider responses and full snapshots should live in separate,
content-addressed artifacts. Trace events carry hashes and evidence references,
not raw image bytes, credentials, environment values, or private source text.
