"use client"
import RevisionReload from "./RevisionReload"
import { useState } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/kumo/components/button/button"
import { Select } from "@/components/kumo/components/select/select"
import type { RecordingStore } from "../../state/recording-store"
import { eventTitle } from "../display"
import { useConfirmation } from "./Modal"
export default function EventActions({
  store,
  eventId,
  onRemoved,
  onMoved,
}: {
  store: RecordingStore
  eventId: string
  onRemoved: () => void
  onMoved: () => void
}) {
  const { journey } = useStore(store)
  const events = journey!.events
  const entry = events.find((event) => event.id === eventId)!
  const owner = journey?.role === "OWNER"
  const index = events.findIndex((event) => event.id === eventId)
  const [after, setAfter] = useState(index > 0 ? events[index - 1].id : "first")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()
  async function run(action: () => Promise<unknown>, complete: () => void) {
    setBusy(true)
    setError(null)
    try {
      await action()
      complete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <h3 className="text-xl font-black">整理记录</h3>
      {owner && (
        <>
          <Select
            label="移动到"
            value={after}
            onValueChange={(value) => {
              if (value) setAfter(value)
            }}
            disabled={busy}
            items={[
              { value: "first", label: "旅程开头" },
              ...events
                .filter((event) => event.id !== eventId)
                .map((event) => ({
                  value: event.id,
                  label: `${eventTitle(event)}之后`,
                })),
            ]}
          />
          <p className="text-xs leading-5 text-walnut">
            只调整记录顺序，日期和内容保持原样。
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  store.getState().mutate({
                    name: "event.move",
                    eventId,
                    afterEventId: after === "first" ? null : after,
                  }),
                onMoved
              )
            }
          >
            移动记录
          </Button>
        </>
      )}
      <RevisionReload store={store} />
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      {entry.canRemove === true && (
        <div className="border-t border-ink-10 pt-5">
          <Button
            variant="secondary-destructive"
            disabled={busy}
            onClick={async () => {
              if (
                !(await ask(
                  "删除这段记录？关联的照片与账单会从记录中移除，原素材保留。"
                ))
              )
                return
              void run(async () => {
                if (
                  store
                    .getState()
                    .uploads.some((upload) => upload.eventId === eventId)
                )
                  throw new Error("请先完成或取消这段记录的待上传照片。")
                await store.getState().mutate({ name: "event.remove", eventId })
              }, onRemoved)
            }}
          >
            删除记录
          </Button>
        </div>
      )}
      {confirmation}
    </div>
  )
}
