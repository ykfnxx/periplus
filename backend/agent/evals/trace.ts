import { createHash } from "node:crypto"
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  EVAL_TRACE_SCHEMA_VERSION,
  evalTraceEventSchema,
  type EvalTraceEvent,
  type EvalTraceEventType,
  type EvalTraceInput,
} from "./contracts"

const REDACTED = "[REDACTED]"
const DEFAULT_SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "token",
  "accesstoken",
  "refreshtoken",
  "capabilitytoken",
  "usertoken",
  "apikey",
  "password",
  "secret",
  "clientsecret",
  "privatekey",
  "env",
])
const SENSITIVE_KEY_SUFFIXES = [
  "authorization",
  "accesstoken",
  "refreshtoken",
  "capabilitytoken",
  "usertoken",
  "apikey",
  "password",
  "secret",
  "clientsecret",
  "privatekey",
] as const

export interface EvalRedactionOptions {
  additionalSensitiveKeys?: readonly string[]
}

export interface EvalTraceSink {
  emit(input: EvalTraceInput): Promise<EvalTraceEvent>
  close(): Promise<void>
}

export interface EvalTraceIntegrityResult {
  valid: boolean
  issues: string[]
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function isSensitiveKey(key: string, sensitiveKeys: ReadonlySet<string>) {
  const normalized = normalizedKey(key)
  return (
    sensitiveKeys.has(normalized) ||
    SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  )
}

function redactString(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, `Basic ${REDACTED}`)
    .replace(
      /([?&](?:user[_-]?token|access[_-]?token|refresh[_-]?token|token|api[_-]?key|x-api-key|client[_-]?secret|password)=)[^&#\s]+/gi,
      `$1${REDACTED}`
    )
    .replace(
      /\b((?:OPENAI[_-])?API[_-]?KEY|X-API-KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD)\s*[:=]\s*[^\s,;]+/gi,
      (_match, key: string) => `${key}=${REDACTED}`
    )
    .replace(/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED)
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED)
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      REDACTED
    )
}

export function redactEvalPayload(
  value: unknown,
  options: EvalRedactionOptions = {}
): unknown {
  const sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS)
  for (const key of options.additionalSensitiveKeys ?? []) {
    sensitiveKeys.add(normalizedKey(key))
  }
  const seen = new WeakSet<object>()

  function visit(current: unknown): unknown {
    if (typeof current === "string") return redactString(current)
    if (
      current == null ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      return current
    }
    if (typeof current === "bigint") return current.toString()
    if (current instanceof Date) return current.toISOString()
    if (Array.isArray(current)) return current.map(visit)
    if (typeof current !== "object") return String(current)
    if (seen.has(current)) return "[CIRCULAR]"
    seen.add(current)
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(current)) {
      output[key] = isSensitiveKey(key, sensitiveKeys) ? REDACTED : visit(entry)
    }
    return output
  }

  return visit(value)
}

function canonicalValue(value: unknown): unknown {
  if (value === undefined) return null
  if (value == null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonicalValue)
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalValue(entry)])
  )
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

export function evalContentHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

function unsignedEvent(event: Omit<EvalTraceEvent, "eventHash">) {
  return event
}

abstract class SequencedEvalTraceSink implements EvalTraceSink {
  private nextSequence = 1
  private previousEventHash: string | undefined
  private tail: Promise<void> = Promise.resolve()
  private failure: Error | null = null

  constructor(private readonly redaction: EvalRedactionOptions = {}) {}

  emit(input: EvalTraceInput): Promise<EvalTraceEvent> {
    let resolveEvent!: (event: EvalTraceEvent) => void
    let rejectEvent!: (error: unknown) => void
    const result = new Promise<EvalTraceEvent>((resolve, reject) => {
      resolveEvent = resolve
      rejectEvent = reject
    })
    const previous = this.tail.catch(() => undefined)
    this.tail = previous.then(async () => {
      if (this.failure) {
        rejectEvent(this.failure)
        throw this.failure
      }
      try {
        const payload = redactEvalPayload(
          input.payload,
          this.redaction
        ) as Record<string, unknown>
        const base = {
          ...input,
          schemaVersion: EVAL_TRACE_SCHEMA_VERSION,
          seq: this.nextSequence,
          timestamp: input.timestamp ?? new Date().toISOString(),
          payload,
          ...(this.previousEventHash
            ? { prevEventHash: this.previousEventHash }
            : {}),
        }
        const event = evalTraceEventSchema.parse({
          ...base,
          eventHash: evalContentHash(unsignedEvent(base as never)),
        })
        await this.persist(event)
        this.nextSequence += 1
        this.previousEventHash = event.eventHash
        resolveEvent(event)
      } catch (error) {
        this.failure =
          error instanceof Error ? error : new Error("Eval trace write failed")
        rejectEvent(this.failure)
        throw this.failure
      }
    })
    this.tail.catch(() => undefined)
    return result
  }

  async close() {
    await this.tail
    if (this.failure) throw this.failure
  }

  protected abstract persist(event: EvalTraceEvent): Promise<void>
}

export class MemoryEvalTraceSink extends SequencedEvalTraceSink {
  readonly events: EvalTraceEvent[] = []

  protected async persist(event: EvalTraceEvent) {
    this.events.push(structuredClone(event))
  }
}

export class JsonlEvalTraceSink extends SequencedEvalTraceSink {
  private readonly initialized: Promise<void>

  constructor(
    readonly filePath: string,
    redaction: EvalRedactionOptions = {}
  ) {
    super(redaction)
    this.initialized = mkdir(dirname(filePath), { recursive: true }).then(() =>
      writeFile(filePath, "", { flag: "wx" })
    )
  }

  protected async persist(event: EvalTraceEvent) {
    await this.initialized
    await appendFile(this.filePath, `${canonicalJson(event)}\n`)
  }
}

const LIFECYCLE_STARTS = new Map<
  EvalTraceEventType,
  ReadonlySet<EvalTraceEventType>
>([
  ["run.started", new Set(["run.completed", "run.failed"])],
  ["turn.started", new Set(["turn.completed", "turn.failed"])],
  ["model.requested", new Set(["model.completed", "model.failed"])],
  ["tool.started", new Set(["tool.completed", "tool.failed"])],
  ["command.dispatched", new Set(["command.applied", "command.rejected"])],
])

const LIFECYCLE_TERMINALS = new Set(
  [...LIFECYCLE_STARTS.values()].flatMap((types) => [...types])
)

export function verifyEvalTrace(
  rawEvents: readonly unknown[]
): EvalTraceIntegrityResult {
  const issues: string[] = []
  if (rawEvents.length === 0) {
    return { valid: false, issues: ["trace is empty"] }
  }
  const events: EvalTraceEvent[] = []
  for (const [index, rawEvent] of rawEvents.entries()) {
    const parsed = evalTraceEventSchema.safeParse(rawEvent)
    if (!parsed.success) {
      issues.push(`event[${index}] failed schema validation`)
      continue
    }
    events.push(parsed.data)
  }
  if (events.length !== rawEvents.length) return { valid: false, issues }

  let previousHash: string | undefined
  const firstRunId = events[0]?.runId
  const firstScenarioId = events[0]?.scenarioId
  const openSpans = new Map<
    string,
    {
      start: EvalTraceEvent
      terminals: ReadonlySet<EvalTraceEventType>
      stateDiff?: EvalTraceEvent
    }
  >()
  const closedSpans = new Set<string>()
  const runStarts = events.filter((event) => event.type === "run.started")
  const runTerminals = events.filter(
    (event) => event.type === "run.completed" || event.type === "run.failed"
  )
  if (runStarts.length !== 1) {
    issues.push(
      `trace must contain exactly one run.started, got ${runStarts.length}`
    )
  }
  if (runTerminals.length !== 1) {
    issues.push(
      `trace must contain exactly one run terminal, got ${runTerminals.length}`
    )
  }
  const rootRunSpanId = runStarts[0]?.spanId
  let runOpen = false
  let runClosed = false

  function sameOptionalIdentity(
    index: number,
    label: string,
    left: unknown,
    right: unknown
  ) {
    if (left !== right) {
      issues.push(`event[${index}] changed lifecycle ${label}`)
    }
  }

  for (const [index, event] of events.entries()) {
    if (event.seq !== index + 1) {
      issues.push(`event[${index}] expected seq ${index + 1}, got ${event.seq}`)
    }
    if (event.runId !== firstRunId || event.scenarioId !== firstScenarioId) {
      issues.push(`event[${index}] changed run or scenario identity`)
    }
    if (event.prevEventHash !== previousHash) {
      issues.push(`event[${index}] has a broken previous hash link`)
    }
    const { eventHash, ...withoutHash } = event
    if (eventHash !== evalContentHash(unsignedEvent(withoutHash))) {
      issues.push(`event[${index}] has an invalid event hash`)
    }
    previousHash = eventHash

    const terminals = LIFECYCLE_STARTS.get(event.type)
    const isTerminal = LIFECYCLE_TERMINALS.has(event.type)

    if (event.type === "run.started") {
      if (index !== 0) issues.push("run.started must be the first trace event")
      if (event.parentSpanId) issues.push("run.started must be a root span")
      if (runOpen || runClosed)
        issues.push("run lifecycle started more than once")
      runOpen = true
    } else if (!runOpen || runClosed) {
      issues.push(`event[${index}] occurred outside the open run lifecycle`)
    }

    const isRunTerminal =
      event.type === "run.completed" || event.type === "run.failed"
    if (isRunTerminal) {
      if (event.spanId !== rootRunSpanId) {
        issues.push(`event[${index}] terminates a non-root run span`)
      }
      if (event.parentSpanId) issues.push("run terminal must be a root event")
      if (index !== events.length - 1) {
        issues.push("run terminal must be the final trace event")
      }
    } else if (event.type !== "run.started") {
      if (!event.parentSpanId) {
        issues.push(`event[${index}] must reference an open parent span`)
      } else if (!openSpans.has(event.parentSpanId)) {
        issues.push(
          `event[${index}] references unknown or closed parent span ${event.parentSpanId}`
        )
      }
    }

    if (!terminals && !isTerminal && closedSpans.has(event.spanId)) {
      issues.push(`event[${index}] occurred after span ${event.spanId} closed`)
    }

    if (terminals) {
      if (openSpans.has(event.spanId) || closedSpans.has(event.spanId)) {
        issues.push(`span ${event.spanId} was started more than once`)
      } else {
        openSpans.set(event.spanId, { start: event, terminals })
      }
    }

    if (event.type === "state.diff.recorded") {
      const command = openSpans.get(event.spanId)
      if (!command || command.start.type !== "command.dispatched") {
        issues.push(
          `event[${index}] state diff is not inside an open command span`
        )
      } else {
        if (command.stateDiff) {
          issues.push(
            `command span ${event.spanId} recorded more than one state diff`
          )
        }
        sameOptionalIdentity(
          index,
          "parentSpanId",
          event.parentSpanId,
          command.start.parentSpanId
        )
        sameOptionalIdentity(
          index,
          "commandId",
          event.commandId,
          command.start.commandId
        )
        sameOptionalIdentity(
          index,
          "revisionBefore",
          event.revisionBefore,
          command.start.revisionBefore
        )
        sameOptionalIdentity(
          index,
          "workspaceId",
          event.workspaceId,
          command.start.workspaceId
        )
        sameOptionalIdentity(
          index,
          "journeyId",
          event.journeyId,
          command.start.journeyId
        )
        command.stateDiff = event
      }
    }

    if (isTerminal) {
      const open = openSpans.get(event.spanId)
      if (!open) {
        issues.push(`span ${event.spanId} terminated without a start`)
      } else if (!open.terminals.has(event.type)) {
        issues.push(
          `span ${event.spanId} started as ${open.start.type} but ended as ${event.type}`
        )
      } else {
        sameOptionalIdentity(
          index,
          "parentSpanId",
          event.parentSpanId,
          open.start.parentSpanId
        )
        sameOptionalIdentity(index, "turnId", event.turnId, open.start.turnId)
        sameOptionalIdentity(
          index,
          "workspaceId",
          event.workspaceId,
          open.start.workspaceId
        )
        sameOptionalIdentity(
          index,
          "journeyId",
          event.journeyId,
          open.start.journeyId
        )
        if (open.start.type === "tool.started") {
          sameOptionalIdentity(
            index,
            "toolType",
            event.payload.toolType,
            open.start.payload.toolType
          )
        }
        if (open.start.type === "command.dispatched") {
          sameOptionalIdentity(
            index,
            "commandId",
            event.commandId,
            open.start.commandId
          )
          sameOptionalIdentity(
            index,
            "commandName",
            event.payload.commandName,
            open.start.payload.commandName
          )
          sameOptionalIdentity(
            index,
            "revisionBefore",
            event.revisionBefore,
            open.start.revisionBefore
          )
          if (event.type === "command.applied") {
            if (!open.stateDiff) {
              issues.push(
                `command span ${event.spanId} applied without a state diff`
              )
            } else {
              sameOptionalIdentity(
                index,
                "revisionAfter",
                event.revisionAfter,
                open.stateDiff.revisionAfter
              )
            }
          } else if (open.stateDiff) {
            issues.push(
              `command span ${event.spanId} rejected after a state diff`
            )
          }
        }
        const openChildren = [...openSpans.values()].filter(
          (candidate) => candidate.start.parentSpanId === event.spanId
        )
        if (openChildren.length > 0) {
          issues.push(`span ${event.spanId} closed with open child spans`)
        }
        openSpans.delete(event.spanId)
        closedSpans.add(event.spanId)
        if (isRunTerminal) {
          runOpen = false
          runClosed = true
        }
      }
    }
  }
  for (const [spanId, open] of openSpans) {
    issues.push(`span ${spanId} (${open.start.type}) has no terminal event`)
  }
  return { valid: issues.length === 0, issues }
}
