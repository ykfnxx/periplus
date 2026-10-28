"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Link } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type {
  JourneyInvitation,
  JourneyInvitationCreated,
  JourneyMember,
} from "@/modules/data-model/contracts/collaboration"
import type { RecordingStore } from "../../state/recording-store"
import { Modal, useConfirmation } from "./Modal"
import UserSource from "./UserSource"

export default function JourneyMembers({
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
  const api = store.getState().collaboration
  const [members, setMembers] = useState<JourneyMember[] | null>(null)
  const [invitations, setInvitations] = useState<JourneyInvitation[]>([])
  const [created, setCreated] = useState<JourneyInvitationCreated | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const linkInput = useRef<HTMLInputElement>(null)
  const { ask, confirmation } = useConfirmation()
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let disposed = false
    Promise.all([
      api.members(journeyId),
      owner ? api.invitations(journeyId) : Promise.resolve({ invitations: [] }),
    ])
      .then(([result, links]) => {
        if (!disposed) {
          setMembers(result.members)
          setInvitations(links.invitations)
        }
      })
      .catch((cause) => {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "同行者读取失败，请重试。"
          )
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [api, journeyId, owner, reload])
  async function create() {
    setBusy(true)
    setError(null)
    setStatus("")
    try {
      const result = created || (await api.invite(journeyId))
      if (!created) {
        setCreated(result)
        setInvitations((items) => [result.invitation, ...items])
      }
      try {
        await navigator.clipboard.writeText(result.url)
        setStatus("邀请链接已复制")
      } catch {
        setStatus("链接已生成，可选择后复制。")
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "邀请创建失败，请重试。"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Modal
        title="同行者"
        onClose={onClose}
        beforeClose={() => !busy}
        className="journal-members w-[480px]! p-6!"
      >
        {() => (
          <div className="space-y-5">
            <h3 className="text-lg font-semibold break-words">{title}</h3>
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
                  disabled={busy}
                  onClick={() => {
                    setLoading(true)
                    setError(null)
                    setReload((value) => value + 1)
                  }}
                >
                  重新读取
                </Button>
              </div>
            )}
            {members && (
              <ul className="space-y-4">
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
                    <span className="shrink-0 text-xs text-journal-muted">
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
                <ul className="space-y-3" aria-label="已发邀请">
                  {invitations.map((invitation) => {
                    const expired =
                      new Date(invitation.expiresAt).getTime() <= Date.now()
                    return (
                      <li
                        key={invitation.id}
                        className="flex items-center gap-3 rounded-xl bg-journal-soft px-3 py-2"
                      >
                        <Link
                          size={16}
                          className="shrink-0 text-journal-muted"
                        />
                        <span className="min-w-0 flex-1 text-xs text-journal-muted">
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
                              setBusy(true)
                              setError(null)
                              try {
                                await api.revokeInvitation(
                                  journeyId,
                                  invitation.id
                                )
                                setInvitations((items) =>
                                  items.map((item) =>
                                    item.id === invitation.id
                                      ? {
                                          ...item,
                                          revokedAt: new Date().toISOString(),
                                        }
                                      : item
                                  )
                                )
                                if (created?.invitation.id === invitation.id) {
                                  setCreated(null)
                                  setStatus("")
                                }
                              } catch (cause) {
                                setError(
                                  cause instanceof Error
                                    ? cause.message
                                    : "撤销失败，请重试。"
                                )
                              } finally {
                                setBusy(false)
                              }
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
        )}
      </Modal>
      {confirmation}
    </>
  )
}
