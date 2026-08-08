const sensitiveKeyPattern =
  /(?:api[_-]?key|authorization|capability[_-]?token|cookie|password|secret|token|private[_-]?key|access[_-]?key|refresh[_-]?token|address|latitude|longitude|plannedLat|plannedLng|coordinates)/i

const sensitiveStringPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /("(?:address|latitude|longitude|plannedLat|plannedLng|coordinates)"\s*:\s*)(?:"(?:\\.|[^"\\])*"|[-+]?\d+(?:\.\d+)?|\[[^\]]*\])/gi,
]

function redactString(value: string) {
  return sensitiveStringPatterns.reduce(
    (output, pattern) =>
      output.replace(pattern, (match, prefix?: string) =>
        prefix ? `${prefix}"[REDACTED]"` : "[REDACTED]"
      ),
    value
  )
}

export function redactTelemetryValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value)
  if (Array.isArray(value)) return value.map(redactTelemetryValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? "[REDACTED]"
          : redactTelemetryValue(entry),
      ])
    )
  }
  return value
}

export function redactTelemetryText(value: string) {
  return redactString(value)
}

export function redactedJson(value: unknown) {
  const redacted = redactTelemetryValue(value)
  return typeof redacted === "string" ? redacted : JSON.stringify(redacted)
}
