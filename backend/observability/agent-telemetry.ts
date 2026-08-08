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
  return createHmac("sha256", periplusServerConfig.observability.idSalt)
    .update(value)
    .digest("hex")
}

function spanAttributes(
  kind: OpenInferenceSpanKind,
  attributes: Attributes = {}
): Attributes {
  return {
    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: kind,
    ...attributes,
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
      span.setAttribute(key, value)
    },
    setAttributes(next) {
      span.setAttributes(next)
    },
    addEvent(eventName, eventAttributes) {
      span.addEvent(eventName, eventAttributes)
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
      if (endAttributes) span.setAttributes(endAttributes)
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
  private firstDeltaAt: number | null = null
  private ended = false

  constructor(input: AgentRunTelemetryInput) {
    const sessionId = hashIdentity(`session:${input.workspaceId}`)
    const runIdHash = hashIdentity(`run:${input.runId}`)
    this.mode = input.mode
    this.runtimeId = input.runtimeId
    this.commonAttributes = {
      [SESSION_ID]: sessionId,
      [USER_ID]: hashIdentity(`user:${input.userId}`),
      "periplus.session.id_hash": sessionId,
      "periplus.agent.run_id_hash": runIdHash,
      "periplus.agent.run_id": runIdHash,
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
    return stream
  }

  recordStreamDelta(text: string) {
    const now = performance.now()
    if (this.firstDeltaAt === null) {
      this.firstDeltaAt = now
      this.stream?.setAttribute("periplus.stream.ttft_ms", now - this.startedAt)
      this.root.setAttribute("periplus.agent.ttft_ms", now - this.startedAt)
    }
    const attributes = {
      runtime: this.runtimeId,
      status: "streaming",
    }
    instruments().streamDeltas.add(1, attributes)
    instruments().streamBytes.add(Buffer.byteLength(text, "utf8"), attributes)
    this.stream?.setAttributes({
      "periplus.stream.delta_count": 1,
      "periplus.stream.byte_count": Buffer.byteLength(text, "utf8"),
    })
  }

  finishRuntimeStream(status: TelemetryStatus, error?: unknown) {
    if (error) this.stream?.recordException(error)
    this.stream?.end(status, {
      "periplus.stream.status": status,
      ...(this.firstDeltaAt === null ? { "periplus.stream.ttft_ms": -1 } : {}),
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
