"use client"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { RecordingStore } from "../application/recording-session"
import { createMembersSession } from "../application/collaboration"
import JourneyMembers from "../ui/collaboration/JourneyMembers"
export default function MembersController({
  journeyId,
  title,
  owner,
  store,
  onClose,
}: {
  journeyId: string
  title: string
  owner: boolean
  store: RecordingStore
  onClose: () => void
}) {
  const [session] = useState(() =>
    createMembersSession(journeyId, owner, store.getState().collaboration)
  )
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  useEffect(() => {
    void session.load()
    return () => session.dispose()
  }, [session])
  return (
    <JourneyMembers
      {...snapshot}
      title={title}
      owner={owner}
      onClose={onClose}
      onLoad={session.load}
      onCreate={session.create}
      onRevoke={session.revoke}
    />
  )
}
