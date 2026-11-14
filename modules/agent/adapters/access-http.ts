import type { AgentAccessApi } from "../ports"
export const agentAccessApi: AgentAccessApi = {
  async authorize(input) {
    const response = await fetch("/api/agent/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    return result
  },
  async revoke(journeyId, id) {
    const response = await fetch(
      `/api/journeys/${encodeURIComponent(journeyId)}/agent-grants/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    )
    if (!response.ok) {
      const body = await response.json()
      throw new Error(body.error)
    }
  },
}
