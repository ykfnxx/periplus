import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { mcpErrorResult, mcpJsonResult } from '@/mcp/errors';
import {
  addDraftPointInputSchema,
  deleteDraftPointInputSchema,
  getCurrentDraftInputSchema,
  reorderDraftPointsInputSchema,
  replaceDraftInputSchema,
  updateDraftPointInputSchema,
} from '../schemas/draft';
import type { DraftToolName } from '../../types';

type ToolInput = Record<string, unknown>;
type McpResult = ReturnType<typeof mcpJsonResult>;

const backendUrl = process.env.PERIPLUS_BACKEND_URL ?? 'http://127.0.0.1:3002';
const sessionId = process.env.PERIPLUS_SESSION_ID;

function asCallToolResult(result: McpResult): CallToolResult {
  return result as CallToolResult;
}

function toolErrorResult(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    return asCallToolResult(mcpErrorResult('invalid_input', error.issues.map((issue) => issue.message).join('; ')));
  }
  if (error instanceof Error) {
    return asCallToolResult(mcpErrorResult('internal_error', error.message));
  }
  return asCallToolResult(mcpErrorResult('internal_error', 'Unexpected draft tool error'));
}

async function callDraftBackend(tool: DraftToolName, input: unknown): Promise<CallToolResult> {
  if (!sessionId) return asCallToolResult(mcpErrorResult('invalid_session', 'PERIPLUS_SESSION_ID is required'));

  const response = await fetch(`${backendUrl}/internal/draft-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, tool, input }),
  });
  const body = (await response.json()) as {
    result?: unknown;
    error?: { code: string; message: string };
  };

  if (!response.ok || body.error) {
    return asCallToolResult(
      mcpErrorResult(body.error?.code ?? 'internal_error', body.error?.message ?? 'Draft tool failed')
    );
  }

  return asCallToolResult(mcpJsonResult(body.result));
}

export const draftToolHandlers = {
  async getCurrentDraft(input: ToolInput) {
    try {
      return callDraftBackend('get_current_draft', getCurrentDraftInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },

  async replaceDraft(input: ToolInput) {
    try {
      return callDraftBackend('replace_draft', replaceDraftInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },

  async addDraftPoint(input: ToolInput) {
    try {
      return callDraftBackend('add_draft_point', addDraftPointInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },

  async updateDraftPoint(input: ToolInput) {
    try {
      return callDraftBackend('update_draft_point', updateDraftPointInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },

  async deleteDraftPoint(input: ToolInput) {
    try {
      return callDraftBackend('delete_draft_point', deleteDraftPointInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },

  async reorderDraftPoints(input: ToolInput) {
    try {
      return callDraftBackend('reorder_draft_points', reorderDraftPointsInputSchema.parse(input));
    } catch (error) {
      return toolErrorResult(error);
    }
  },
};

function callTool(handler: (input: ToolInput) => Promise<CallToolResult>, input: unknown) {
  return handler(input as ToolInput);
}

export function registerDraftTools(server: McpServer): void {
  server.registerTool(
    'periplus.get_current_draft',
    {
      title: 'Get current draft',
      description: 'Read the current Periplus draft route for this session.',
      inputSchema: getCurrentDraftInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.getCurrentDraft, input)
  );

  server.registerTool(
    'periplus.replace_draft',
    {
      title: 'Replace draft',
      description: 'Replace the full current draft route without saving it.',
      inputSchema: replaceDraftInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.replaceDraft, input)
  );

  server.registerTool(
    'periplus.add_draft_point',
    {
      title: 'Add draft point',
      description: 'Add a point to the current draft at an optional relative position.',
      inputSchema: addDraftPointInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.addDraftPoint, input)
  );

  server.registerTool(
    'periplus.update_draft_point',
    {
      title: 'Update draft point',
      description: 'Patch a draft point and optionally move it by relative position.',
      inputSchema: updateDraftPointInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.updateDraftPoint, input)
  );

  server.registerTool(
    'periplus.delete_draft_point',
    {
      title: 'Delete draft point',
      description: 'Delete a point from the current draft.',
      inputSchema: deleteDraftPointInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.deleteDraftPoint, input)
  );

  server.registerTool(
    'periplus.reorder_draft_points',
    {
      title: 'Reorder draft points',
      description: 'Replace the current draft point ordering with a complete point id list.',
      inputSchema: reorderDraftPointsInputSchema.shape,
    },
    (input) => callTool(draftToolHandlers.reorderDraftPoints, input)
  );
}
