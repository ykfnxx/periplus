"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createRecordingStore } from "../state/recording-store"
import RecordingEditor from "./RecordingEditor"

export default function RecordingPage({
  journeyId,
  canEdit,
  developerMode = false,
}: {
  journeyId: string
  canEdit: boolean
  developerMode?: boolean
}) {
  const router = useRouter()
  const [store] = useState(() => createRecordingStore(journeyId))
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  return (
    <RecordingEditor
      canEdit={canEdit}
      developerMode={developerMode}
      store={store}
      onBack={() => router.push("/journeys")}
    />
  )
}
