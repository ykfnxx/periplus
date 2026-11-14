"use client"

import { useRef, useState } from "react"
import { ArrowLeft, Copy, Link } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type {
  JourneyInvitation,
  JourneyInvitationCreated,
  JourneyMember,
} from "@/modules/data-model/contracts/collaboration"
import { useConfirmation } from "@/components/ui/Modal"
import UserSource from "../workbench/UserSource"

export default function JourneyMembers({
  title,
  owner,
  members,
  invitations,
  created,
  loading,
  busy,
  error,
  nowMs,
  onLoad,
  onCreate,
  onRevoke,
  onClose,
}: {
  title: string
  owner: boolean
  members: JourneyMember[] | null
  invitations: JourneyInvitation[]
  created: JourneyInvitationCreated | null
  loading: boolean
  busy: boolean
  error: string | null
  nowMs: number
  onLoad: () => Promise<void>
  onCreate: () => Promise<JourneyInvitationCreated | undefined>
  onRevoke: (id: string) => Promise<boolean>
  onClose: () => void
}) {
  const [status, setStatus] = useState("")
  const linkInput = useRef<HTMLInputElement>(null)
  const { ask, confirmation } = useConfirmation()
  async function create() {
    setStatus("")
    const result = await onCreate()
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setStatus("邀请链接已复制")
    } catch {
      setStatus("链接已生成，可选择后复制。")
    }
  }
  return (
    <>
      <section
        className="journal-subpage journal-members"
        aria-label="同行者"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented && !busy) {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="journal-subpage-header sticky top-0 z-10">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              shape="square"
              aria-label="返回"
              disabled={busy}
              onClick={() => !busy && onClose()}
            >
              <ArrowLeft size={16} />
            </Button>
            <h2 className="truncate font-editorial text-lg font-bold">
              同行者
            </h2>
          </div>
        </header>

        <div className="journal-subpage-body">
          <div className="space-y-5 rounded-3xl border border-journal-line bg-journal-card p-5 shadow-journal-card">
            <h3 className="font-editorial text-lg font-bold break-words text-journal-ink">
              {title}
            </h3>
            {loading && (
              <p role="status" className="text-sm text-journal-muted">
                正在读取同行者…
              </p>
            )}
            {error && (
              <div role="alert" className="space-y-2 text-sm text-coral">
                <p>{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onLoad()}
                >
                  重新读取
                </Button>
              </div>
            )}
            {members && (
              <ul className="space-y-3.5">
                {members.map((member) => (
                  <li
                    key={member.user.userId}
                    className="flex items-center justify-between gap-3"
                  >
                    <UserSource
                      size="md"
                      user={member.user}
                      className="text-journal-ink"
                    />
                    <span className="shrink-0 rounded-full bg-journal-chip px-2.5 py-0.5 text-xs text-journal-muted">
                      {member.role === "OWNER" ? "作者" : "同行者"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {owner && !loading && (
              <>
                <Button
                  variant="primary"
                  className="w-full justify-center!"
                  loading={busy}
                  onClick={() => void create()}
                >
                  <Copy size={16} />
                  复制邀请链接
                </Button>
                {created && (
                  <Input
                    ref={linkInput}
                    aria-label="邀请链接"
                    value={created.url}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                )}
                {status && (
                  <p role="status" className="text-sm text-journal-muted">
                    {status}
                  </p>
                )}
                <ul className="space-y-2.5" aria-label="已发邀请">
                  {invitations.map((invitation) => {
                    const expired =
                      nowMs > 0 &&
                      new Date(invitation.expiresAt).getTime() <= nowMs
                    return (
                      <li
                        key={invitation.id}
                        className="flex items-center gap-3 rounded-xl border border-journal-line bg-journal-paper-soft px-3 py-2"
                      >
                        <Link
                          size={15}
                          className="shrink-0 text-journal-muted"
                        />
                        <span className="min-w-0 flex-1 text-xs text-journal-muted tabular-nums">
                          {invitation.revokedAt
                            ? "已撤销"
                            : expired
                              ? "已过期"
                              : `有效至 ${new Date(invitation.expiresAt).toLocaleDateString("zh-CN")}`}
                        </span>
                        {!expired && !invitation.revokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await ask("已加入的同行者不受影响。", {
                                  title: "撤销邀请？",
                                  confirmLabel: "撤销邀请",
                                }))
                              )
                                return
                              if (await onRevoke(invitation.id)) setStatus("")
                            }}
                          >
                            撤销
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>
      {confirmation}
    </>
  )
}
