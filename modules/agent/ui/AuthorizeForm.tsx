"use client"
import type { Dispatch, SetStateAction } from "react"
import Link from "next/link"
import { Button } from "@/components/kumo/components/button/button"
import { Select } from "@/components/kumo/components/select/select"
import { AGENT_SCOPES, type AgentScope } from "../contracts"
const labels: Record<AgentScope, string> = {
  "journey:read": "读取旅程",
  "journey:write": "编辑旅程与照片",
  "photos:upload": "上传图片",
}
export default function AuthorizeForm({
  clientName,
  clientOrigin,
  account,
  journeys,
  requestedScopes,
  journeyId,
  scopes,
  busy,
  error,
  setJourneyId,
  setScopes,
  respond,
}: {
  clientName: string
  clientOrigin: string
  account: string
  journeys: { id: string; title: string }[]
  requestedScopes: string[]
  journeyId: string
  scopes: AgentScope[]
  busy: boolean
  error: string | null
  setJourneyId: (id: string) => void
  setScopes: Dispatch<SetStateAction<AgentScope[]>>
  respond: (accept: boolean) => void
}) {
  return (
    <main className="journal-workbench min-h-dvh bg-cream px-5 py-10 text-ink">
      <section className="mx-auto max-w-md space-y-6 rounded-2xl bg-soft-white p-6 shadow-periplus">
        <header>
          <h1 className="text-xl font-semibold">允许 {clientName} 访问旅程</h1>
          <p className="mt-2 text-sm break-all text-walnut">{clientOrigin}</p>
        </header>
        <p className="text-sm break-all">{account}</p>
        {journeys.length ? (
          <Select
            label="旅程"
            value={journeyId}
            items={journeys.map((journey) => ({
              value: journey.id,
              label: journey.title,
            }))}
            onValueChange={(value) => {
              if (value) setJourneyId(value)
            }}
          />
        ) : (
          <p>
            请先
            <Link
              className="text-russet underline underline-offset-4"
              href="/journeys"
            >
              创建旅程
            </Link>
            ，再从客户端重新连接。
          </p>
        )}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">允许的操作</legend>
          {AGENT_SCOPES.filter((scope) => requestedScopes.includes(scope)).map(
            (scope) => (
              <label key={scope} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-russet"
                  disabled={busy || scope === "journey:read"}
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((item) => item !== scope)
                    )
                  }
                />
                {labels[scope]}
              </label>
            )
          )}
        </fieldset>
        <p className="text-sm text-walnut">
          授权有效期为 30
          天，可随时在旅程中撤销。允许编辑后，客户端可直接保存修改。
        </p>
        {error && (
          <p role="alert" className="text-sm text-coral">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void respond(false)}
          >
            取消
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!journeyId || !scopes.includes("journey:read")}
            onClick={() => void respond(true)}
          >
            允许
          </Button>
        </div>
      </section>
    </main>
  )
}
