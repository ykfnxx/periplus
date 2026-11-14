"use client"
import EventEditor from "./EventEditor"
import {
  previewJourney,
  type PreviewVariant,
} from "../workbench/fixtures.preview"
export default function EventEditorPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const journey = previewJourney
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <EventEditor
        journey={journey}
        request={{ eventId: journey.events[0].id, afterEventId: null }}
        uploads={[]}
        saving={variant === "busy" ? 1 : 0}
        onClose={() => {}}
        onSaved={() => {}}
        onPickLocation={async (location) => location}
        onSave={async ({ draft }) => {
          if (variant === "error")
            throw new Error("保存失败，输入保留，请重试。")
          return { id: journey.events[0].id, draft }
        }}
        renderRevision={(onReload) =>
          variant === "conflict" ? (
            <button onClick={() => onReload(journey)}>读取最新记录</button>
          ) : null
        }
        renderPhotos={() => <p>照片面板有独立预览。</p>}
      />
    </div>
  )
}
