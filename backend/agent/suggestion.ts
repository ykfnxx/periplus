import {
  JOURNEY_TOOL_NAMES,
  type JourneyToolName,
  type ToolCallSuggestionCall,
  type ToolCallSuggestionCreateInput,
} from "@/modules/workspace/server/contracts"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function findJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1]

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

function normalizeToolCall(value: unknown): ToolCallSuggestionCall {
  const record = asRecord(value)
  if (!record) throw new Error("Invalid tool call")

  const tool = String(record.tool ?? record.name ?? "")
  if (!JOURNEY_TOOL_NAMES.includes(tool as JourneyToolName)) {
    throw new Error(`Unsupported suggestion tool: ${tool}`)
  }
  if (tool === "get_current_journey") {
    throw new Error("Suggestion cannot use get_current_journey")
  }

  const input = asRecord(record.input ?? record.arguments ?? {}) ?? {}
  return { tool: tool as JourneyToolName, input }
}

export function parseSuggestion(text: string): ToolCallSuggestionCreateInput {
  const payload = JSON.parse(findJsonObject(text)) as unknown
  const record = asRecord(payload)
  if (!record) throw new Error("Suggestion output must be a JSON object")

  const rawCalls = record.toolCalls ?? record.tool_calls
  if (!Array.isArray(rawCalls)) {
    throw new Error("Suggestion output must include toolCalls")
  }

  return {
    title: String(record.title ?? "路线修改建议"),
    summary: String(record.summary ?? "Agent 生成了一组待确认的路线修改"),
    toolCalls: rawCalls.map(normalizeToolCall),
  }
}
