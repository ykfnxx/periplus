import type { Route } from '@/types/route';

export interface DraftSnapshot {
  sessionId: string;
  route: Route | null;
  sourceRouteId: string | null;
  isLocked: boolean;
  lockedByRunId: string | null;
  updatedAt: string;
}

export interface AgentEvent {
  type: string;
  payload?: unknown;
}

interface SessionResponse {
  sessionId: string;
  draft: DraftSnapshot;
}

export const agentBackendUrl =
  process.env.NEXT_PUBLIC_PERIPLUS_BACKEND_URL ?? 'http://127.0.0.1:3002';

export async function bootstrapAgentSession() {
  const response = await fetch(`${agentBackendUrl}/session`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return (await response.json()) as SessionResponse;
}

export function connectAgentSocket(sessionId: string) {
  const url = new URL(agentBackendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.searchParams.set('sessionId', sessionId);
  return new WebSocket(url);
}

export function sendAgentEvent(socket: WebSocket, type: string, payload?: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}
