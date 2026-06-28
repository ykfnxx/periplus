import { RouteInputError } from '@/lib/routes/service';
import { ZodError } from 'zod';

export interface McpTextResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function mcpJsonResult(data: unknown): McpTextResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function mcpErrorResult(code: string, message: string): McpTextResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: { code, message } }, null, 2),
      },
    ],
  };
}

export function routeToolErrorResult(error: unknown): McpTextResult {
  if (error instanceof ZodError) {
    return mcpErrorResult('invalid_input', error.issues.map((issue) => issue.message).join('; '));
  }

  if (error instanceof RouteInputError) {
    return mcpErrorResult('invalid_input', error.message);
  }

  if (error instanceof Error) {
    return mcpErrorResult('internal_error', error.message);
  }

  return mcpErrorResult('internal_error', 'Unexpected route tool error');
}
