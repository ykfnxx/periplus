"use client"

import { useState, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { InputArea } from "@/components/kumo/components/input/input-area"
import { Select } from "@/components/kumo/components/select/select"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { useConfirmation } from "../../../../components/ui/Modal"

export default function JourneySettings({
  journey,
  onSave,
  revisionNotice,
  onClose,
}: {
  journey: JourneySnapshot
  onSave: (
    patch: Pick<JourneySnapshot, "title" | "description" | "status">
  ) => Promise<unknown>
  revisionNotice: ReactNode
  onClose: () => void
}) {
  const initial = {
    title: journey.title,
    description: journey.description,
    status: journey.status,
  }
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()

  async function attemptClose() {
    if (saving) return
    if (
      !saved &&
      JSON.stringify(draft) !== JSON.stringify(initial) &&
      !(await ask("旅程信息尚未保存，放弃修改？"))
    )
      return
    onClose()
  }

  return (
    <>
      <section
        className="journal-subpage"
        aria-label="旅程信息"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation()
            void attemptClose()
          }
        }}
      >
        <header className="journal-subpage-header sticky top-0 z-10">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              shape="square"
              aria-label="返回"
              disabled={saving}
              onClick={() => void attemptClose()}
            >
              <ArrowLeft size={16} />
            </Button>
            <h2 className="truncate font-editorial text-lg font-bold">
              旅程信息
            </h2>
          </div>
        </header>

        <div className="journal-subpage-body">
          <form
            className="space-y-4 rounded-3xl border border-journal-line bg-journal-card p-5 shadow-journal-card"
            onSubmit={async (event) => {
              event.preventDefault()
              setSaving(true)
              setError(null)
              try {
                await onSave(draft)
                setSaved(true)
                setSaving(false)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "保存失败")
                setSaving(false)
              }
            }}
          >
            <Input
              label="名称"
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => {
                setSaved(false)
                setDraft({ ...draft, title: event.target.value })
              }}
            />
            <InputArea
              label="简介"
              rows={3}
              maxLength={10000}
              value={draft.description}
              onChange={(event) => {
                setSaved(false)
                setDraft({ ...draft, description: event.target.value })
              }}
            />
            <Select
              label="旅行状态"
              value={draft.status}
              items={[
                { value: "DRAFT", label: "尚未出发" },
                { value: "ACTIVE", label: "旅途中" },
                { value: "COMPLETED", label: "旅行已结束" },
              ]}
              onValueChange={(value) => {
                setSaved(false)
                if (value)
                  setDraft({ ...draft, status: value as typeof draft.status })
              }}
            />
            {revisionNotice}
            {error && (
              <p role="alert" className="text-sm text-coral">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm text-olive">
                已保存
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => void attemptClose()}
              >
                关闭
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                保存信息
              </Button>
            </div>
          </form>
        </div>
      </section>
      {confirmation}
    </>
  )
}
