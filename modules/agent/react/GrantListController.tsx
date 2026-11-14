"use client"
import { useState, useSyncExternalStore } from "react"
import { agentAccessApi } from "../adapters/access-http"
import { createGrantSession } from "../application/access"
import type { AgentGrant } from "../contracts"
import GrantList from "../ui/GrantList"
export default function GrantListController({
  journeyId,
  grants,
  resource,
}: {
  journeyId: string
  grants: AgentGrant[]
  resource: string
}) {
  const [session] = useState(() =>
    createGrantSession(journeyId, grants, agentAccessApi)
  )
  const state = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  const [now] = useState(Date.now)
  return (
    <GrantList
      {...state}
      now={now}
      resource={resource}
      revoke={session.revoke}
    />
  )
}
