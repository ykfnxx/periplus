const sensitiveKeyPattern =
  /^(?:api[_-]?key|authorization|capability[_-]?token|cookie|password|secret|token|private[_-]?key|access[_-]?key|refresh[_-]?token|address|latitude|longitude|lat|lng|plannedLat|plannedLng|coordinates|url|url\.full|url\.query|http\.url|http\.target)$/i

const sensitiveStringPatterns: Array<{
  pattern: RegExp
  replacement: (match: string, ...captures: unknown[]) => string
}> = [
  {
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: () => "[REDACTED]",
  },
  {
    pattern: /(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}/g,
    replacement: () => "[REDACTED]",
  },
  {
    pattern: /AIza[A-Za-z0-9_-]{20,}/g,
    replacement: () => "[REDACTED]",
  },
  {
    pattern:
      /(?<![?&])(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
    replacement: () => "[REDACTED]",
  },
  {
    pattern:
      /([?&](?:api[_-]?key|token|secret|password|access[_-]?key|authorization)=[^&#\s]*)/gi,
    replacement: (_match, value: unknown) =>
      typeof value === "string"
        ? `${value.slice(0, value.indexOf("=") + 1)}[REDACTED]`
        : "[REDACTED]",
  },
  {
    pattern:
      /(\"(?:address|latitude|longitude|lat|lng|plannedLat|plannedLng|coordinates)\"\s*:\s*)(?:\"(?:\\.|[^\"\\])*\"|[-+]?\d+(?:\.\d+)?|\[[^\]]*\])/gi,
    replacement: (_match, prefix: unknown) =>
      typeof prefix === "string" ? `${prefix}\"[REDACTED]\"` : "[REDACTED]",
  },
]

function redactString(value: string) {
  return sensitiveStringPatterns.reduce(
    (output, pattern) => output.replace(pattern.pattern, pattern.replacement),
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
