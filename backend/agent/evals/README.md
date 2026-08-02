# Agent capability evaluation

This package provides headless observability and feature-level capability
checks for the production Agent Harness. It does not start Next.js, a browser,
or the map SDK.

## Current scope

- F1 Place resolution: decision state, city, coordinate system/error, provider
  identity, and evidence.
- F2 Transit planning: active endpoints and scope, selected-plan membership,
  usable geometry, and request fingerprint.
- F6 write protocol: complete command lifecycle, monotonic revisions, rejected
  writes without revision claims, evidence references, and trace integrity.

F3 scheduling, F4 images, and F5 sourced material use the same report contract
but are not part of this first implementation.

Run the initial smoke report with:

```bash
npm run eval:agent:smoke
```

The command prints one JSON report and exits non-zero when any hard metric
fails. It uses recorded/contract data only and makes no provider calls.

## Eval Trace

Operational logs and Eval Trace are separate. Eval Trace is a complete,
unsampled, append-only event stream with monotonic sequence numbers and a SHA-256
hash chain. The optional `AgentGateway` trace integration records run, tool,
command, state-diff, and Place-evidence boundaries without copying authoritative
documents or provider payloads into events.

Use `MemoryEvalTraceSink` in focused tests and `JsonlEvalTraceSink` for durable
artifacts. JSONL creation fails if the path already exists so a run cannot
silently overwrite another run. Sensitive keys and credential-shaped strings
are redacted before hashing and persistence. `verifyEvalTrace` checks schema,
sequence, run/scenario identity, hash links, and lifecycle span closure.

Provider responses and full snapshots should live in separate,
content-addressed artifacts. Trace events carry hashes and evidence references,
not raw image bytes, credentials, environment values, or private source text.
