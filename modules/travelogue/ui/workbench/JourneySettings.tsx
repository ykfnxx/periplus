"use client"
import RevisionReload from "./RevisionReload"
import { useState } from "react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { InputArea } from "@/components/kumo/components/input/input-area"
import { Select } from "@/components/kumo/components/select/select"
import type { RecordingJourney } from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../../state/recording-store"
import { Modal, useConfirmation } from "./Modal"
export default function JourneySettings({
  journey,
  store,
  onClose,
}: {
  journey: RecordingJourney
  store: RecordingStore
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
  return (
    <>
      <Modal
        title="旅程信息"
        onClose={onClose}
        beforeClose={() =>
          !saving &&
          (saved ||
            JSON.stringify(draft) === JSON.stringify(initial) ||
            ask("旅程信息尚未保存，放弃修改？"))
        }
      >
        {(close) => (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setSaving(true)
              setError(null)
              try {
                await store
                  .getState()
                  .mutate({ name: "journey.update", patch: draft })
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
            <p className="text-sm text-walnut">
              结束旅行不影响继续补记，内容仅对本旅程成员可见。
            </p>
            <RevisionReload store={store} />
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
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                关闭
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                保存信息
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {confirmation}
    </>
  )
}
