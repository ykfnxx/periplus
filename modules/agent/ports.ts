import type { AgentScope } from "./contracts"
export interface AgentAccessApi {
  authorize(input: {
    oauthQuery: string
    accept: boolean
    journeyId: string
    scopes: AgentScope[]
  }): Promise<{ url: string }>
  revoke(journeyId: string, grantId: string): Promise<void>
}
