import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  JsonlEvalTraceSink,
  MemoryEvalTraceSink,
  verifyEvalTrace,
} from "@/backend/agent/evals"

const temporaryDirectories: string[] = []
const commandHash = "0".repeat(64)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function completeTrace(sink: MemoryEvalTraceSink) {
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "run.started",
    spanId: "run-span",
    status: "OK",
    payload: { authorization: "Bearer secret-token" },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "tool.started",
    spanId: "tool-span",
    parentSpanId: "run-span",
    status: "OK",
    payload: {
      toolType: "workspace.command",
      url: "http://penpot/mcp?userToken=secret-token",
      OPENAI_API_KEY: "sk-proj-structured-secret",
      "x-api-key": "header-secret",
      note: "raw sk-proj-abcdefghijklmnopqrstuvwxyz and https://user:pass@example.com/path",
    },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "command.dispatched",
    spanId: "command-span",
    parentSpanId: "tool-span",
    commandId: "command-1",
    revisionBefore: 0,
    status: "OK",
    payload: {
      commandName: "journey.update_event",
      idempotencyKey: "safe-idempotency-key",
      commandHash,
    },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "state.diff.recorded",
    spanId: "command-span",
    parentSpanId: "tool-span",
    commandId: "command-1",
    revisionBefore: 0,
    revisionAfter: 1,
    status: "OK",
    payload: {
      changedEventIds: ["event-1"],
      projectionInvalidationScopes: ["journey"],
    },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "command.applied",
    spanId: "command-span",
    parentSpanId: "tool-span",
    commandId: "command-1",
    revisionBefore: 0,
    revisionAfter: 1,
    status: "OK",
    payload: { commandName: "journey.update_event" },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "tool.completed",
    spanId: "tool-span",
    parentSpanId: "run-span",
    status: "OK",
    payload: { toolType: "workspace.command" },
  })
  await sink.emit({
    runId: "run-1",
    scenarioId: "scenario-1",
    type: "run.completed",
    spanId: "run-span",
    status: "OK",
    payload: {},
  })
  await sink.close()
}

describe("Agent eval trace", () => {
  it("redacts credentials and produces a complete hash-linked lifecycle", async () => {
    const sink = new MemoryEvalTraceSink()
    await completeTrace(sink)

    expect(sink.events[0]?.payload.authorization).toBe("[REDACTED]")
    expect(sink.events[1]?.payload.url).toBe(
      "http://penpot/mcp?userToken=[REDACTED]"
    )
    expect(sink.events[1]?.payload.OPENAI_API_KEY).toBe("[REDACTED]")
    expect(sink.events[1]?.payload["x-api-key"]).toBe("[REDACTED]")
    expect(sink.events[1]?.payload.note).toBe(
      "raw [REDACTED] and https://[REDACTED]@example.com/path"
    )
    expect(sink.events[2]?.payload.idempotencyKey).toBe("safe-idempotency-key")
    expect(sink.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(verifyEvalTrace(sink.events)).toEqual({ valid: true, issues: [] })
  })

  it("detects a missing command terminal and a tampered event", async () => {
    const sink = new MemoryEvalTraceSink()
    await completeTrace(sink)
    const tampered = structuredClone(sink.events)
    tampered.splice(4, 1)
    tampered[1]!.payload.toolType = "place.resolve"

    const integrity = verifyEvalTrace(tampered)
    expect(integrity.valid).toBe(false)
    expect(integrity.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid event hash"),
        expect.stringContaining("has no terminal event"),
      ])
    )
  })

  it("rejects traces without one complete root run lifecycle", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "command.dispatched",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        idempotencyKey: "command-1",
        commandHash,
      },
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "state.diff.recorded",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      revisionAfter: 1,
      status: "OK",
      payload: {
        changedEventIds: ["event-1"],
        projectionInvalidationScopes: ["journey"],
      },
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "command.applied",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      revisionAfter: 1,
      status: "OK",
      payload: { commandName: "journey.update_event" },
    })

    const integrity = verifyEvalTrace(sink.events)
    expect(integrity.valid).toBe(false)
    expect(integrity.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("exactly one run.started"),
        expect.stringContaining("exactly one run terminal"),
        expect.stringContaining("outside the open run lifecycle"),
      ])
    )
  })

  it("rejects forged command identity and revision continuity", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "run.started",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "command.dispatched",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-original",
      revisionBefore: 99,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        idempotencyKey: "command-original",
        commandHash,
      },
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "state.diff.recorded",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-forged",
      revisionBefore: 0,
      revisionAfter: 1,
      status: "OK",
      payload: {
        changedEventIds: ["event-1"],
        projectionInvalidationScopes: ["journey"],
      },
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "command.applied",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-forged",
      revisionBefore: 0,
      revisionAfter: 2,
      status: "OK",
      payload: { commandName: "journey.update_event" },
    })
    await sink.emit({
      runId: "run-1",
      scenarioId: "scenario-1",
      type: "run.completed",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })

    const integrity = verifyEvalTrace(sink.events)
    expect(integrity.valid).toBe(false)
    expect(integrity.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("changed lifecycle commandId"),
        expect.stringContaining("changed lifecycle revisionBefore"),
        expect.stringContaining("changed lifecycle revisionAfter"),
      ])
    )
  })

  it("writes canonical JSONL without overwriting an existing run artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "periplus-eval-"))
    temporaryDirectories.push(directory)
    const filePath = join(directory, "events.jsonl")
    const sink = new JsonlEvalTraceSink(filePath)
    await sink.emit({
      runId: "jsonl-run",
      scenarioId: "jsonl-scenario",
      type: "run.started",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "jsonl-run",
      scenarioId: "jsonl-scenario",
      type: "run.completed",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.close()

    const events = (await readFile(filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(verifyEvalTrace(events)).toEqual({ valid: true, issues: [] })

    const duplicate = new JsonlEvalTraceSink(filePath)
    await expect(
      duplicate.emit({
        runId: "duplicate-run",
        scenarioId: "duplicate-scenario",
        type: "run.started",
        spanId: "duplicate-span",
        status: "OK",
        payload: {},
      })
    ).rejects.toMatchObject({ code: "EEXIST" })
    await expect(
      duplicate.emit({
        runId: "duplicate-run",
        scenarioId: "duplicate-scenario",
        type: "run.failed",
        spanId: "duplicate-span",
        status: "ERROR",
        payload: {},
      })
    ).rejects.toMatchObject({ code: "EEXIST" })
  })
})
