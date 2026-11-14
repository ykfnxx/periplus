"use client"
import { useState } from "react"
import DraftEditor from "./DraftEditor"
import { eventContent } from "../../model/event-draft"
import type { LocalDraft } from "../../model/local-draft"
import {
  previewJourney,
  type PreviewVariant,
} from "../workbench/fixtures.preview"
export default function DraftEditorPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const [draft, update] = useState<LocalDraft>({
    id: "preview-draft",
    userId: "preview-user",
    journey: previewJourney,
    content: eventContent(),
    photos: [],
    updatedAt: previewJourney.updatedAt,
  })
  const [status, setStatus] = useState("已存本机")
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <DraftEditor
        draft={draft}
        journeys={[previewJourney]}
        inline
        busy={variant === "busy"}
        picking={false}
        status={status}
        error={variant === "error" ? "本机保存失败，输入已保留。" : null}
        onClose={() => {}}
        closeInline={async () => {}}
        beforeClose={async () => true}
        publish={async () => setStatus("预览已确认")}
        update={update}
        onFiles={(files) =>
          update({
            ...draft,
            photos: files.map((file, index) => ({
              id: `preview-${index}`,
              file,
            })),
          })
        }
        canPick={false}
        pick={async () => {}}
        pickEndpoint={async () => {}}
      />
    </div>
  )
}
