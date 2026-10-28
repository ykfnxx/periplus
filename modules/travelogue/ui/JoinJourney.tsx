"use client"

import { useEffect, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyInvitationPreview } from "@/modules/data-model/contracts/collaboration"
import LoginForm from "@/modules/auth/ui/LoginForm"
import RegisterForm from "@/modules/auth/ui/RegisterForm"
import {
  recordingApi,
  RecordingApiError,
  type RecordingApi,
} from "../data/client"
import UserSource from "./workbench/UserSource"
const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })

export function InvitationView({
  invitation,
  loading,
  error,
  busy,
  authenticated,
  onAccept,
  onRetry,
  children,
}: {
  invitation: JourneyInvitationPreview | null
  loading: boolean
  error: string | null
  busy: boolean
  authenticated: boolean
  onAccept: () => void
  onRetry: () => void
  children?: ReactNode
}) {
  return (
    <main className="journal-workbench fixed inset-0 isolate flex items-center justify-center overflow-y-auto bg-cream px-5 py-6 text-ink">
      <div className="absolute inset-0">
        <RecordMap points={[]} />
      </div>
      <section className="journal-panel relative max-h-[calc(100dvh-48px)] w-full max-w-md overflow-y-auto p-7 md:p-9">
        {loading ? (
          <p
            role="status"
            className="py-8 text-center text-sm text-journal-muted"
          >
            正在打开邀请…
          </p>
        ) : invitation ? (
          <>
            <h1 className="text-center text-2xl font-semibold break-words">
              {invitation.journeyTitle}
            </h1>
            <div className="my-7 flex justify-center">
              <UserSource
                size="md"
                user={invitation.owner}
                className="text-journal-muted"
              />
            </div>
            <p className="mb-7 text-center text-sm text-journal-muted">
              邀请你一起记录这次旅程
            </p>
            {children || (
              <Button
                variant="primary"
                className="w-full justify-center!"
                loading={busy}
                onClick={onAccept}
              >
                {authenticated ? "加入旅程" : "登录后加入"}
              </Button>
            )}
          </>
        ) : (
          <h1 className="text-center text-xl font-semibold">无法打开邀请</h1>
        )}
        {error && (
          <div role="alert" className="mt-5 space-y-3 text-sm text-coral">
            <p>{error}</p>
            <Button
              variant="ghost"
              disabled={loading || busy}
              onClick={onRetry}
            >
              重试
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}

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
    api
      .invitation(token)
      .then((result) => {
        if (!disposed) setInvitation(result)
      })
      .catch((cause) => {
        if (!disposed) {
          setInvitation(null)
          setError(
            cause instanceof RecordingApiError && cause.status === 404
              ? "邀请已过期或被撤销，请联系作者获取新链接。"
              : "邀请暂时无法读取，请重试。"
          )
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [api, token, reload])
  async function accept() {
    if (!authenticated) {
      setMode("login")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.acceptInvitation(token)
      router.replace(`/journeys/${encodeURIComponent(result.journeyId)}`)
      router.refresh()
    } catch (cause) {
      if (cause instanceof RecordingApiError && cause.status === 401) {
        setAuthenticated(false)
        setMode("login")
        setError("请重新登录后加入。")
      } else
        setError(
          cause instanceof RecordingApiError && cause.status === 404
            ? "邀请已过期或被撤销，请联系作者获取新链接。"
            : "加入失败，请重试。"
        )
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
