"use client"
import { useState } from "react"
import AuthorizeForm from "./AuthorizeForm"
import { AGENT_SCOPES, type AgentScope } from "../contracts"
export default function AuthorizeFormPreview({ variant }: { variant: string }) {
  const [journeyId, setJourneyId] = useState("preview-journey")
  const [scopes, setScopes] = useState<AgentScope[]>([...AGENT_SCOPES])
  return (
    <AuthorizeForm
      account="preview@example.test"
      clientName="演示客户端"
      clientOrigin="https://example.test"
      requestedScopes={[...AGENT_SCOPES]}
      journeys={
        variant === "empty"
          ? []
          : [{ id: "preview-journey", title: "杭州三日游" }]
      }
      journeyId={journeyId}
      setJourneyId={setJourneyId}
      scopes={scopes}
      setScopes={setScopes}
      busy={variant === "busy"}
      error={variant === "error" ? "授权未完成，请重试。" : null}
      respond={() => {}}
    />
  )
}
