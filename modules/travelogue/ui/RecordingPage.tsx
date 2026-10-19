"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createRecordingStore } from "../state/recording-store"
import RecordingEditor from "./RecordingEditor"

export default function RecordingPage({ journeyId }: { journeyId: string }) {
  const router = useRouter()
  const [store] = useState(() => createRecordingStore(journeyId))
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  return (
    <RecordingEditor store={store} onBack={() => router.push("/journeys")} />
  )
}
