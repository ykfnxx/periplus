"use client"
import { useState } from "react"
import EventEditor from "./EventEditor"
import { eventContent } from "../../model/event-draft"
import {
  previewJourney,
  type PreviewVariant,
} from "../workbench/fixtures.preview"
export default function EventEditorPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const entry = previewJourney.events[0]
  const [draft, setDraft] = useState(() => eventContent(entry))
  const [files, setFiles] = useState<File[]>([])
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <EventEditor
        entry={entry}
        draft={draft}
        files={files}
        busy={variant === "busy"}
        pendingSave={false}
        error={variant === "error" ? "保存失败，输入保留，请重试。" : null}
        status=""
        dirty={false}
        uploads={[]}
        saving={0}
        onChange={setDraft}
        onFiles={setFiles}
        onClose={() => {}}
        onPickLocation={async () => {}}
        onPickTransitLocation={async () => {}}
        onSave={async () => {}}
        revisionNotice={
          variant === "conflict" ? (
            <button onClick={() => setDraft(eventContent(entry))}>
              读取最新记录
            </button>
          ) : null
        }
        renderPhotos={() => <p>照片面板有独立预览。</p>}
      />
    </div>
  )
}
