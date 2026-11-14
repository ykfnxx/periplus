"use client"
import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyInvitationPreview } from "@/modules/data-model/contracts/collaboration"
import UserSource from "../workbench/UserSource"
const RecordMap = dynamic(() => import("../map/RecordMap"), { ssr: false })
export default function InvitationView({
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
    <main className="journal-workbench fixed inset-0 isolate flex items-center justify-center overflow-y-auto bg-map-land px-5 py-6 text-ink">
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
