"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronLeft } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts/index"
import type { EventDraft } from "../../model/event-draft"
import EventComposer from "./EventComposer"
import EditorShell from "./EditorShell"
import { useConfirmation } from "@/components/ui/Modal"

import type { RecordUpload } from "../../contracts"

export default function EventEditor({
  entry,
  draft,
  files,
  busy,
  pendingSave,
  error,
  status,
  dirty,
  uploads,
  saving,
  onChange,
  onFiles,
  onSave,
  revisionNotice,
  renderPhotos,
  onClose,
  onPickLocation,
  onPickTransitLocation,
}: {
  entry: JourneyEvent | undefined
  draft: EventDraft
  files: File[]
  busy: boolean
  pendingSave: boolean
  error: string | null
  status: string
  dirty: boolean
  uploads: RecordUpload[]
  saving: number
  onChange: (draft: EventDraft) => void
  onFiles: (files: File[]) => void
  onSave: () => Promise<void>
  revisionNotice: ReactNode
  renderPhotos: (props: {
    eventId: string
    onDirtyChange: (dirty: boolean) => void
    onClose: () => void
  }) => ReactNode
  onClose: () => void
  onPickLocation: () => Promise<void>
  onPickTransitLocation: (which: "from" | "to") => Promise<void>
}) {
  const [view, setView] = useState<"edit" | "photos">("edit")
  const [viewDirty, setViewDirty] = useState(false)
  const { ask, confirmation } = useConfirmation()
  const pending = uploads.filter((upload) => upload.eventId === entry?.id)
  const unsaved = dirty || viewDirty || pendingSave
  useEffect(() => {
    if (!unsaved) return
    const unload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [unsaved])

  async function attemptClose() {
    if (busy) return
    if (
      (unsaved || saving || pending.length) &&
      !(await ask(
        pending.length
          ? "这段记录还有照片尚未保存完成。关闭会放弃未保存输入；已开始的上传会继续，失败后可返回重试。仍然关闭？"
          : "未保存的文字和照片输入将被放弃。",
        unsaved
          ? {
              title: "放弃本次修改？",
              cancelLabel: "继续编辑",
              confirmLabel: "放弃修改",
            }
          : {
              title: "关闭记录？",
              cancelLabel: "返回记录",
              confirmLabel: "关闭并继续上传",
            }
      ))
    )
      return
    onClose()
  }

  async function switchView(next: typeof view) {
    if (
      viewDirty &&
      !(await ask("照片的未保存输入将被放弃。", {
        title: "放弃本次修改？",
        cancelLabel: "继续编辑",
        confirmLabel: "放弃修改",
      }))
    )
      return
    setViewDirty(false)
    setView(next)
  }

  return (
    <EditorShell
      label={entry ? "编辑记录" : "添加记录"}
      onEscape={() => void attemptClose()}
      confirmation={confirmation}
      header={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={
              view === "edit"
                ? () => void attemptClose()
                : () => void switchView("edit")
            }
          >
            {view !== "edit" ? (
              <ChevronLeft size={16} />
            ) : (
              <ArrowLeft size={16} />
            )}
            {view === "edit" ? "取消" : "返回"}
          </Button>
          <div className="flex items-center gap-2">
            {view === "edit" && (
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                onClick={() => void onSave()}
              >
                {pendingSave ? "确认上次保存" : "保存"}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="px-4 pt-2">
        {revisionNotice}
        {error && (
          <p role="alert" className="mb-2 text-sm text-coral">
            {error}
          </p>
        )}
      </div>
      {view === "edit" ? (
        <>
          <EventComposer
            draft={draft}
            files={files}
            photos={entry?.photos || []}
            uploads={pending}
            busy={busy || pendingSave}
            onChange={onChange}
            onFiles={onFiles}
            onPickLocation={() => void onPickLocation()}
            onPickTransitLocation={(which) => void onPickTransitLocation(which)}
            onManagePhotos={entry ? () => setView("photos") : undefined}
          />
          {(status || pending.length > 0) && (
            <p role="status" className="px-4 pb-6 text-xs text-journal-muted">
              {pending.length ? `${pending.length} 张照片待保存` : status}
            </p>
          )}
        </>
      ) : view === "photos" && entry ? (
        <div className="px-4 pb-6">
          {renderPhotos({
            eventId: entry.id,
            onDirtyChange: setViewDirty,
            onClose: () => void switchView("edit"),
          })}
        </div>
      ) : (
        <p className="px-4 pb-6 text-sm text-journal-muted">这段记录已移除。</p>
      )}
    </EditorShell>
  )
}
