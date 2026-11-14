"use client"
import { useState } from "react"
import JourneyLibrary from "./JourneyLibrary"
import {
  previewJourney,
  type PreviewVariant,
} from "../workbench/fixtures.preview"
export default function JourneyLibraryPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const [title, setTitle] = useState(previewJourney.title)
  const journey = {
    ...previewJourney,
    title,
    coverUrl: null,
    eventCount: 1,
    photoCount: 0,
    startDate: "2026-11-14",
    endDate: "2026-11-16",
  }
  return (
    <JourneyLibrary
      journeys={variant === "empty" ? [] : [journey]}
      account={{ name: "预览作者", email: "preview@example.test" }}
      draftEntry={<span>草稿箱 · 2</span>}
      loading={variant === "busy"}
      error={variant === "error" ? "旅程列表打开失败。" : null}
      onRetry={() => {}}
      onSignOut={async () => {}}
      onCreate={async (title) => setTitle(title)}
      onRename={async (_, title) => setTitle(title)}
      onOpen={() => {}}
    />
  )
}
