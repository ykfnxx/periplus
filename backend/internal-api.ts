import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import { DraftInputError, DraftStore } from './draft-store';
import { ensureSessionId } from './session';
import type { AgentEventEmitter, DraftToolName } from './types';

type JsonBody = Record<string, unknown>;

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin ?? process.env.PERIPLUS_FRONTEND_ORIGIN ?? 'http://localhost:3001';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonBody;
}

function errorBody(error: unknown) {
  if (error instanceof ZodError) {
    return { error: { code: 'invalid_input', message: error.issues.map((issue) => issue.message).join('; ') } };
  }
  if (error instanceof DraftInputError) {
    return { error: { code: 'invalid_input', message: error.message } };
  }
  if (error instanceof Error) {
    return { error: { code: 'internal_error', message: error.message } };
  }
  return { error: { code: 'internal_error', message: 'Unexpected backend error' } };
}

export async function handleInternalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: DraftStore,
  broadcast: AgentEventEmitter
) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://periplus.local');

  if (req.method === 'GET' && url.pathname === '/session') {
    const sessionId = ensureSessionId(req, res);
    sendJson(res, 200, {
      sessionId,
      draft: store.getSnapshot(sessionId),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/internal/draft-tool') {
    try {
      const body = await readJson(req);
      const sessionId = String(body.sessionId);
      const result = await store.callTool(
        sessionId,
        body.tool as DraftToolName,
        (body.input as Record<string, unknown> | undefined) ?? {}
      );

      broadcast(sessionId, {
        type: 'draft.updated',
        payload: result,
      });
      sendJson(res, 200, { result });
    } catch (error) {
      sendJson(res, 400, errorBody(error));
    }
    return;
  }

  sendJson(res, 404, { error: { code: 'not_found', message: 'Endpoint not found' } });
}
