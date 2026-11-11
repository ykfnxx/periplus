import { z } from "zod"

export const AGENT_SCOPES = [
  "journey:read",
  "journey:write",
  "photos:upload",
] as const
export const agentScopeSchema = z.enum(AGENT_SCOPES)
export type AgentScope = z.infer<typeof agentScopeSchema>
export const agentAuthorizationSchema = z
  .object({
    oauthQuery: z.string().min(1),
    accept: z.boolean(),
    journeyId: z.string().min(1).optional(),
    scopes: z.array(agentScopeSchema).optional(),
  })
  .strict()

export class AgentAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 | 409 = 401,
    readonly scopes: readonly string[] = []
  ) {
    super(message)
  }
}
