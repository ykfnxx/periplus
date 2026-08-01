import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { periplusServerConfig } from "@/config/periplus.server"
import {
  targetWorkspaceWebSocketTicketClaimsSchema,
  WORKSPACE_WEBSOCKET_TICKET_SECONDS,
} from "@/modules/data-model/contracts"

export class WorkspaceTicketError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceTicketError"
  }
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url")
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

export function issueWorkspaceTicket(
  subjectUserId: string,
  workspaceId: string,
  options: {
    nowSeconds?: number
    ttlSeconds?: number
    secret?: string
    nonce?: string
  } = {}
) {
  const issuedAt = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const ttlSeconds = options.ttlSeconds ?? WORKSPACE_WEBSOCKET_TICKET_SECONDS
  const claims = targetWorkspaceWebSocketTicketClaimsSchema.parse({
    subjectUserId,
    workspaceId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    nonce: options.nonce ?? randomUUID(),
  })
  const payload = encode(JSON.stringify(claims))
  const secret = options.secret ?? periplusServerConfig.auth.secret
  return `${payload}.${signature(payload, secret)}`
}

export function verifyWorkspaceTicket(
  ticket: string,
  options: { nowSeconds?: number; secret?: string } = {}
) {
  const [payload, suppliedSignature, extra] = ticket.split(".")
  if (!payload || !suppliedSignature || extra) {
    throw new WorkspaceTicketError("Malformed Workspace ticket")
  }
  const expectedSignature = signature(
    payload,
    options.secret ?? periplusServerConfig.auth.secret
  )
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new WorkspaceTicketError("Invalid Workspace ticket signature")
  }

  let value: unknown
  try {
    value = JSON.parse(decode(payload))
  } catch {
    throw new WorkspaceTicketError("Invalid Workspace ticket payload")
  }
  const claims = targetWorkspaceWebSocketTicketClaimsSchema.parse(value)
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (claims.issuedAt > now) {
    throw new WorkspaceTicketError("Workspace ticket is not active yet")
  }
  if (claims.expiresAt <= now) {
    throw new WorkspaceTicketError("Workspace ticket expired")
  }
  return claims
}
