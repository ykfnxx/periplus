"use client"
import AuthorizeFormView from "../ui/AuthorizeForm"
import { agentAccessApi } from "../adapters/access-http"
import { useState } from "react"
import { AGENT_SCOPES, type AgentScope } from "../contracts"

export default function AuthorizeForm({
  oauthQuery,
  clientName,
  clientOrigin,
  account,
  journeys,
  requestedScopes,
}: {
  oauthQuery: string
  clientName: string
  clientOrigin: string
  account: string
  journeys: { id: string; title: string }[]
  requestedScopes: string[]
}) {
  const [journeyId, setJourneyId] = useState(journeys[0]?.id || "")
  const [scopes, setScopes] = useState<AgentScope[]>(
    AGENT_SCOPES.filter((scope) => requestedScopes.includes(scope))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function respond(accept: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await agentAccessApi.authorize({
        oauthQuery,
        accept,
        journeyId,
        scopes,
      })
      window.location.assign(result.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "授权未完成，请重试。")
      setBusy(false)
    }
  }
  return (
    <AuthorizeFormView
      clientName={clientName}
      clientOrigin={clientOrigin}
      account={account}
      journeys={journeys}
      requestedScopes={requestedScopes}
      journeyId={journeyId}
      scopes={scopes}
      busy={busy}
      error={error}
      setJourneyId={setJourneyId}
      setScopes={setScopes}
      respond={respond}
    />
  )
}
