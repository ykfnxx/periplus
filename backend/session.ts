import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

export const SESSION_COOKIE = "periplus_session"

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const pair of header.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=")
    if (!rawKey || rawValue.length === 0) continue
    cookies.set(rawKey, decodeURIComponent(rawValue.join("=")))
  }

  return cookies
}

export function getSessionId(req: IncomingMessage) {
  const url = new URL(req.url ?? "/", "http://periplus.local")
  const querySessionId = url.searchParams.get("sessionId")
  if (querySessionId) return querySessionId

  return parseCookies(req.headers.cookie).get(SESSION_COOKIE) ?? null
}

export function ensureSessionId(req: IncomingMessage, res?: ServerResponse) {
  const existingSessionId = getSessionId(req)
  if (existingSessionId) return existingSessionId

  const sessionId = `session-${randomUUID()}`
  if (res) {
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; SameSite=Lax`
    )
  }
  return sessionId
}
