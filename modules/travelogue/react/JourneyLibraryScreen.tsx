"use client"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { authApi, authClient } from "@/modules/auth/adapters/better-auth"
import { createLibrarySession } from "../application/library"
import { recordingApi } from "../adapters/recording-http"
import JourneyLibrary from "../ui/library/JourneyLibrary"
import DraftEntry from "./DraftEntry"
import { journeyHref } from "./navigation"

export default function JourneyLibraryPage({
  userId,
  developerMode = false,
}: {
  userId: string
  developerMode?: boolean
}) {
  const router = useRouter()
  const { data: account } = authClient.useSession()
  const [session] = useState(() => createLibrarySession(recordingApi))
  const state = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  useEffect(() => {
    void session.load()
    return () => session.dispose()
  }, [session])
  return (
    <JourneyLibrary
      {...state}
      developerMode={developerMode}
      account={account?.user}
      draftEntry={<DraftEntry userId={userId} journeys={state.journeys} />}
      onSignOut={async () => {
        await authApi.signOut()
        window.location.assign("/")
      }}
      onRetry={session.load}
      onOpen={(id, request) => router.push(journeyHref(id, request))}
      onCreate={async (title, request) =>
        router.push(journeyHref(await session.create(title), request))
      }
      onRename={session.rename}
    />
  )
}
