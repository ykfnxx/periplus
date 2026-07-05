export interface McpTextResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export function mcpJsonResult(data: unknown): McpTextResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

export function mcpErrorResult(code: string, message: string): McpTextResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code, message } }, null, 2),
      },
    ],
  }
}
