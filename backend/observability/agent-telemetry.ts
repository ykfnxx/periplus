import { createHmac } from "node:crypto"
import type { IncomingHttpHeaders } from "node:http"
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  metrics,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api"
import {
  getInputAttributes,
  getOutputAttributes,
} from "@arizeai/openinference-core"
import {
  INPUT_VALUE,
  OpenInferenceSpanKind,
  OUTPUT_VALUE,
  PROMPT_TEMPLATE_VERSION,
  SESSION_ID,
  TOOL_NAME,
  USER_ID,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions"
import { periplusServerConfig } from "@/config/periplus.server"
import { redactTelemetryText, redactedJson } from "./prompt-redaction"

export interface TraceCarrier {
  traceparent?: string
  tracestate?: string
}

export type TelemetryStatus = "OK" | "ERROR" | "CANCELLED"

export interface TelemetrySpan {
  readonly span: Span
  readonly context: Context
  readonly startedAt: number
  setAttribute(key: string, value: string | number | boolean): void
  setAttributes(attributes: Attributes): void
  addEvent(name: string, attributes?: Attributes): void
  recordException(error: unknown): void
  end(status?: TelemetryStatus, attributes?: Attributes): void
}

const tracer = trace.getTracer("periplus")

function metricInstruments() {
  const meter = metrics.getMeter("periplus")
  return {
    runCounter: meter.createCounter("periplus.agent.runs", { unit: "{run}" }),
    runDuration: meter.createHistogram("periplus.agent.run.duration", {
      unit: "ms",
    }),
    runTtft: meter.createHistogram("periplus.agent.run.ttft", {
      unit: "ms",
    }),
    toolCounter: meter.createCounter("periplus.agent.tool.calls", {
      unit: "{call}",
    }),
    toolDuration: meter.createHistogram("periplus.agent.tool.duration", {
      unit: "ms",
    }),
    runtimeErrors: meter.createCounter("periplus.agent.runtime.errors", {
      unit: "{error}",
    }),
    streamBytes: meter.createCounter("periplus.agent.stream.bytes", {
      unit: "By",
    }),
    streamDeltas: meter.createCounter("periplus.agent.stream.deltas", {
      unit: "{delta}",
    }),
  }
}

let instrumentCache: ReturnType<typeof metricInstruments> | null = null

function instruments() {
  instrumentCache ??= metricInstruments()
  return instrumentCache
}

const nodeHeadersGetter = {
  keys(carrier: IncomingHttpHeaders) {
    return Object.keys(carrier)
  },
  get(carrier: IncomingHttpHeaders, key: string) {
    return carrier[key]
  },
}

function statusCode(status: TelemetryStatus) {
  return status === "OK" ? SpanStatusCode.OK : SpanStatusCode.ERROR
}

function hashIdentity(value: string) {
  const salt = periplusServerConfig.observability.idSalt
  if (!salt) {
    throw new Error(
      "PERIPLUS_OBSERVABILITY_ID_SALT is required when observability is enabled"
    )
  }
  return createHmac("sha256", salt).update(value).digest("hex")
}

const droppedTelemetryAttributePattern =
  /^(?:url\.full|http\.url|url\.query|http\.target)$/i

function safeSpanAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => !droppedTelemetryAttributePattern.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? redactTelemetryText(value) : value,
      ])
  )
}

function spanAttributes(
  kind: OpenInferenceSpanKind,
  attributes: Attributes = {}
): Attributes {
  return {
    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: kind,
    ...safeSpanAttributes(attributes),
  }
}

export function startTelemetrySpan(
  name: string,
  kind: OpenInferenceSpanKind,
  attributes: Attributes = {},
  parentContext: Context = context.active()
): TelemetrySpan {
  const span = tracer.startSpan(
    name,
    {
      kind: SpanKind.INTERNAL,
      attributes: spanAttributes(kind, attributes),
    },
    parentContext
  )
  const spanContext = trace.setSpan(parentContext, span)
  const startedAt = performance.now()
  let ended = false
  return {
    span,
    context: spanContext,
    startedAt,
    setAttribute(key, value) {
      const safe = safeSpanAttributes({ [key]: value })[key]
      if (safe !== undefined) {
        span.setAttribute(key, safe as string | number | boolean)
      }
    },
    setAttributes(next) {
      span.setAttributes(safeSpanAttributes(next))
    },
    addEvent(eventName, eventAttributes) {
      span.addEvent(
        eventName,
        eventAttributes ? safeSpanAttributes(eventAttributes) : undefined
      )
    },
    recordException(error) {
      if (error instanceof Error) {
        span.recordException({
          name: error.name,
          message: redactTelemetryText(error.message),
        })
      } else {
        span.recordException(redactTelemetryText(String(error)))
      }
    },
    end(status = "OK", endAttributes) {
      if (ended) return
      ended = true
      if (endAttributes) span.setAttributes(safeSpanAttributes(endAttributes))
      span.setStatus({ code: statusCode(status) })
      span.end()
    },
  }
}

export function withIncomingTraceContext<T>(
  headers: IncomingHttpHeaders,
  callback: () => T | Promise<T>
) {
  const activeContext = context.active()
  const extracted = propagation.extract(
    activeContext,
    headers,
    nodeHeadersGetter
  )
  return context.with(
    trace.getSpan(activeContext) ? activeContext : extracted,
    callback
  )
}

function carrierFromContext(parentContext: Context): TraceCarrier {
  const carrier: Record<string, string> = {}
  propagation.inject(parentContext, carrier)
  return {
    ...(carrier.traceparent ? { traceparent: carrier.traceparent } : {}),
    ...(carrier.tracestate ? { tracestate: carrier.tracestate } : {}),
  }
}

export interface AgentRunTelemetryInput {
  workspaceId: string
  userId: string
  runId: string
  mode: string
  runtimeId: string
  promptVersion: string
}

export class AgentRunTelemetry {
  readonly root: TelemetrySpan
  readonly context: Context
  readonly traceCarrier: TraceCarrier
  private readonly mode: string
  private readonly runtimeId: string
  private readonly commonAttributes: Attributes
  private readonly startedAt: number
  private stream: TelemetrySpan | null = null
  private persistence: TelemetrySpan | null = null
  private firstDeltaAt: number | null = null
  private deltaCount = 0
  private byteCount = 0
  private firstDelta: string | null = null
  private lastDelta: string | null = null
  private persistedCount = 0
  private lastPersistedAt: string | null = null
  private ended = false

  constructor(input: AgentRunTelemetryInput) {
    this.mode = input.mode
    this.runtimeId = input.runtimeId
    if (periplusServerConfig.observability.enabled) {
      const sessionId = hashIdentity(`session:${input.workspaceId}`)
      const userIdHash = hashIdentity(`user:${input.userId}`)
      const runIdHash = hashIdentity(`run:${input.runId}`)
      this.commonAttributes = {
        [SESSION_ID]: sessionId,
        [USER_ID]: userIdHash,
        "periplus.session.id_hash": sessionId,
        "periplus.agent.run_id_hash": runIdHash,
      }
    } else {
      this.commonAttributes = {}
    }
    this.root = startTelemetrySpan("agent.run", OpenInferenceSpanKind.AGENT, {
      ...this.commonAttributes,
      "periplus.agent.mode": input.mode,
      "periplus.agent.runtime": input.runtimeId,
      "periplus.prompt.version": input.promptVersion,
    })
    this.context = this.root.context
    this.traceCarrier = carrierFromContext(this.context)
    this.startedAt = this.root.startedAt
  }

  startSpan(
    name: string,
    kind: OpenInferenceSpanKind,
    attributes: Attributes = {},
    parentContext: Context = this.context
  ) {
    return startTelemetrySpan(
      name,
      kind,
      { ...this.commonAttributes, ...attributes },
      parentContext
    )
  }

  carrierFor(span: TelemetrySpan = this.root) {
    return carrierFromContext(span.context)
  }

  get traceId() {
    const traceId = this.root.span.spanContext().traceId
    return /^0+$/.test(traceId) ? undefined : traceId
  }

  withContext<T>(callback: () => T | Promise<T>) {
    return context.with(this.context, callback)
  }

  withSpan<T>(span: TelemetrySpan, callback: () => T | Promise<T>) {
    return context.with(span.context, callback)
  }

  setPromptInput(prompt: string) {
    this.root.setAttributes(getInputAttributes(redactTelemetryText(prompt)))
  }

  setPromptVersion(version: string) {
    this.root.setAttribute("periplus.prompt.version", version)
  }

  setPromptOutput(output: string) {
    this.root.setAttributes(getOutputAttributes(redactTelemetryText(output)))
  }

  startRuntimeStream(parentContext: Context = this.context) {
    const stream = this.startSpan(
      "agent.runtime.stream",
      OpenInferenceSpanKind.CHAIN,
      {
        "periplus.agent.runtime": this.runtimeId,
      },
      parentContext
    )
    this.stream = stream
    this.persistence = this.startSpan(
      "agent.stream.persist",
      OpenInferenceSpanKind.CHAIN,
      { "periplus.agent.runtime": this.runtimeId },
      stream.context
    )
    return stream
  }

  recordStreamDelta(text: string) {
    const now = performance.now()
    const byteCount = Buffer.byteLength(text, "utf8")
    const redactedText = redactTelemetryText(text).slice(0, 1024)
    if (this.firstDeltaAt === null) {
      this.firstDeltaAt = now
      this.firstDelta = redactedText
      this.stream?.setAttribute("periplus.stream.ttft_ms", now - this.startedAt)
      this.root.setAttribute("periplus.agent.ttft_ms", now - this.startedAt)
    }
    this.deltaCount += 1
    this.byteCount += byteCount
    this.lastDelta = redactedText
    const attributes = {
      runtime: this.runtimeId,
      status: "streaming",
    }
    instruments().streamDeltas.add(1, attributes)
    instruments().streamBytes.add(byteCount, attributes)
    this.stream?.setAttributes({
      "periplus.stream.delta_count": this.deltaCount,
      "periplus.stream.byte_count": this.byteCount,
      ...(this.firstDelta
        ? { "periplus.stream.first_delta": this.firstDelta }
        : {}),
      ...(this.lastDelta
        ? { "periplus.stream.last_delta": this.lastDelta }
        : {}),
    })
  }

  recordStreamPersistence(text: string, durationMs: number, persistedAt: Date) {
    this.persistedCount += 1
    this.lastPersistedAt = persistedAt.toISOString()
    this.persistence?.setAttributes({
      "periplus.stream.persisted_count": this.persistedCount,
      "periplus.stream.last_persist_duration_ms": durationMs,
      "periplus.stream.last_persisted_at": this.lastPersistedAt,
    })
    this.persistence?.addEvent("stream.persisted", {
      "periplus.stream.chunk_bytes": Buffer.byteLength(text, "utf8"),
      "periplus.stream.persist_duration_ms": durationMs,
      "periplus.stream.persisted_at": this.lastPersistedAt,
    })
  }

  finishRuntimeStream(status: TelemetryStatus, error?: unknown) {
    if (error) {
      this.stream?.recordException(error)
      this.persistence?.recordException(error)
    }
    this.persistence?.end(status, {
      "periplus.stream.persisted_count": this.persistedCount,
      ...(this.lastPersistedAt
        ? { "periplus.stream.last_persisted_at": this.lastPersistedAt }
        : {}),
    })
    this.persistence = null
    this.stream?.end(status, {
      "periplus.stream.status": status,
      ...(this.firstDeltaAt === null ? { "periplus.stream.ttft_ms": -1 } : {}),
      "periplus.stream.delta_count": this.deltaCount,
      "periplus.stream.byte_count": this.byteCount,
      ...(this.firstDelta
        ? { "periplus.stream.first_delta": this.firstDelta }
        : {}),
      ...(this.lastDelta
        ? { "periplus.stream.last_delta": this.lastDelta }
        : {}),
      ...(this.lastPersistedAt
        ? { "periplus.stream.last_persisted_at": this.lastPersistedAt }
        : {}),
    })
    this.stream = null
  }

  recordRuntimeError(errorType: string) {
    instruments().runtimeErrors.add(1, {
      runtime: this.runtimeId,
      error_type: errorType,
    })
  }

  recordTool(
    tool: string,
    provider: string,
    status: TelemetryStatus,
    durationMs: number
  ) {
    const attributes = { tool, provider, status }
    instruments().toolCounter.add(1, attributes)
    instruments().toolDuration.record(durationMs, attributes)
  }

  finish(status: TelemetryStatus, output: string, attributes: Attributes = {}) {
    if (this.ended) return
    this.ended = true
    this.setPromptOutput(output)
    this.root.setAttributes({
      "periplus.agent.status": status,
      ...attributes,
    })
    const durationMs = performance.now() - this.startedAt
    const metricAttributes = {
      runtime: this.runtimeId,
      mode: this.mode,
      status,
    }
    instruments().runCounter.add(1, metricAttributes)
    instruments().runDuration.record(durationMs, metricAttributes)
    if (this.firstDeltaAt !== null) {
      instruments().runTtft.record(this.firstDeltaAt - this.startedAt, {
        runtime: this.runtimeId,
        mode: this.mode,
      })
    }
    this.root.end(status)
  }
}

export function startAgentRunTelemetry(input: AgentRunTelemetryInput) {
  return new AgentRunTelemetry(input)
}

let telemetryShutdown: (() => Promise<void>) | null = null

export function setTelemetryShutdown(shutdown: () => Promise<void>) {
  telemetryShutdown = shutdown
}

export async function shutdownTelemetry() {
  if (!telemetryShutdown) return
  const shutdown = telemetryShutdown
  telemetryShutdown = null
  await shutdown()
}

export function redactedInput(value: unknown) {
  return redactedJson(value)
}

export { INPUT_VALUE, OUTPUT_VALUE, PROMPT_TEMPLATE_VERSION, TOOL_NAME }
