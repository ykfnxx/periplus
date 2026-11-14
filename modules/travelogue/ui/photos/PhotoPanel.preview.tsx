"use client"
import { useState } from "react"
import PhotoPanel from "./PhotoPanel"
import {
  previewJourney,
  type PreviewVariant,
} from "../workbench/fixtures.preview"
export default function PhotoPanelPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const [journey, setJourney] = useState(previewJourney)
  const eventId = journey.events[0].id
  const result = async () => {
    if (variant === "error") throw new Error("照片操作失败，请重试。")
  }
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <PhotoPanel
        subpage
        journey={
          variant === "empty"
            ? { ...journey, events: [{ ...journey.events[0], photos: [] }] }
            : journey
        }
        eventId={eventId}
        uploads={[]}
        onDirtyChange={() => {}}
        onClose={() => {}}
        revisionNotice={
          variant === "conflict" ? <p>同行者已更新记录。</p> : null
        }
        actions={{
          reorder: result,
          cover: result,
          move: result,
          location: result,
          remove: async (assetId) => {
            await result()
            setJourney({
              ...journey,
              events: journey.events.map((event) => ({
                ...event,
                photos: event.photos.filter(
                  (photo) => photo.assetId !== assetId
                ),
              })),
            })
          },
          add: () => {},
          retry: () => {},
          discard: () => {},
        }}
      />
    </div>
  )
}
