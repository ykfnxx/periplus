"use client"
import { useState } from "react"
import { Button } from "@/components/kumo/components/button/button"

type Grant = {
  id: string
  clientName: string
  userName: string
  scopes: string[]
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}
export default function GrantList({
  journeyId,
  grants: initial,
  resource,
}: {
  journeyId: string
  grants: Grant[]
  resource: string
}) {
  const [grants, setGrants] = useState(initial)
  const [now] = useState(Date.now)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function revoke(id: string) {
    setBusy(id)
    setError(null)
    try {
      const response = await fetch(
        `/api/journeys/${encodeURIComponent(journeyId)}/agent-grants/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      )
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error)
      }
      setGrants((current) =>
        current.map((grant) =>
          grant.id === id
            ? { ...grant, revokedAt: new Date().toISOString() }
            : grant
        )
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销失败，请重试。")
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-medium">MCP 地址</h2>
        <p className="text-sm break-all text-walnut">{resource}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      {!grants.length ? (
        <p className="text-sm text-walnut">
          还没有授权客户端。在外部 Agent 添加 MCP 地址后，选择这篇旅程即可连接。
        </p>
      ) : (
        <ul className="divide-y divide-ink-10">
          {grants.map((grant) => {
            const active =
              !grant.revokedAt && new Date(grant.expiresAt).getTime() > now
            return (
              <li
                key={grant.id}
                className="flex flex-wrap items-start justify-between gap-4 py-5"
              >
                <div className="min-w-0 space-y-2">
                  <h2 className="font-medium break-all">{grant.clientName}</h2>
                  <p className="text-sm text-walnut">{grant.userName}</p>
                  <p className="text-sm">
                    {grant.scopes.includes("journey:write") ? "可编辑" : "只读"}
                    {grant.scopes.includes("photos:upload")
                      ? "，可上传图片"
                      : ""}
                  </p>
                  <p className="text-xs text-walnut">
                    {grant.revokedAt
                      ? "已撤销"
                      : `到期 ${grant.expiresAt.slice(0, 10)}`}
                  </p>
                  {grant.lastUsedAt && (
                    <p className="text-xs text-walnut">
                      最近使用 {grant.lastUsedAt.replace("T", " ").slice(0, 16)}{" "}
                      UTC
                    </p>
                  )}
                </div>
                {active && (
                  <Button
                    variant="secondary"
                    loading={busy === grant.id}
                    disabled={busy !== null}
                    onClick={() => void revoke(grant.id)}
                  >
                    撤销
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
