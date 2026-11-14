"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyInvitationPreview } from "@/modules/data-model/contracts/collaboration"
import LoginForm from "@/modules/auth/react/LoginFormController"
import RegisterForm from "@/modules/auth/react/RegisterFormController"
import { recordingApi, type RecordingApi } from "../adapters/recording-http"
import InvitationView from "../ui/collaboration/InvitationView"
import { createInvitationActions } from "../application/invitation"

export default function JoinJourney({
  token,
  authenticated: initialAuthenticated,
  api = recordingApi,
}: {
  token: string
  authenticated: boolean
  api?: Pick<RecordingApi, "invitation" | "acceptInvitation">
}) {
  const router = useRouter()
  const actions = useMemo(
    () => createInvitationActions(token, api),
    [token, api]
  )
  const [authenticated, setAuthenticated] = useState(initialAuthenticated)
  const [mode, setMode] = useState<"invitation" | "login" | "register">(
    "invitation"
  )
  const [invitation, setInvitation] = useState<JourneyInvitationPreview | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let disposed = false
    actions
      .load()
      .then((result) => {
        if (!disposed) setInvitation(result)
      })
      .catch((cause) => {
        if (!disposed) {
          setInvitation(null)
          setError(cause.message)
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [actions, reload])
  async function accept() {
    if (!authenticated) {
      setMode("login")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await actions.accept()
      if (result.kind === "login") {
        setAuthenticated(false)
        setMode("login")
        setError("请重新登录后加入。")
        return
      }
      router.replace(`/journeys/${encodeURIComponent(result.journeyId)}`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加入失败，请重试。")
    } finally {
      setBusy(false)
    }
  }
  const onAuthenticated = () => {
    setAuthenticated(true)
    setMode("invitation")
    setError(null)
  }
  return (
    <InvitationView
      invitation={invitation}
      loading={loading}
      error={error}
      busy={busy}
      authenticated={authenticated}
      onAccept={() => void accept()}
      onRetry={() => {
        setLoading(true)
        setError(null)
        setReload((value) => value + 1)
      }}
    >
      {mode !== "invitation" ? (
        <div>
          {mode === "login" ? (
            <LoginForm
              onSwitchToRegister={() => setMode("register")}
              onAuthenticated={onAuthenticated}
            />
          ) : (
            <RegisterForm
              onSwitchToLogin={() => setMode("login")}
              onAuthenticated={onAuthenticated}
            />
          )}
          <Button
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => setMode("invitation")}
          >
            返回邀请
          </Button>
        </div>
      ) : undefined}
    </InvitationView>
  )
}
