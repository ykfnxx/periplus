"use client"

import { useState, type ReactNode } from "react"
import { useStore } from "zustand"
import dynamic from "next/dynamic"
import type {
  RecordingEvent,
  RecordingJourney,
} from "@/modules/data-model/contracts/recording"
import type { RecordingStore } from "../state/recording-store"
import RecordDialog from "./RecordDialog"
import {
  RecordButton,
  RecordError,
  RecordField,
  recordInputClass,
} from "./primitives"
import { eventTitle } from "./display"

const RecordLocationForm = dynamic(() => import("./RecordLocationForm"))
const RecordActions = dynamic(() => import("./RecordActions"))
const RecordPhotos = dynamic(() => import("./RecordPhotos"))
const RecordPhotoViewer = dynamic(() => import("./RecordPhotoViewer"))
export type RecordingOverlay =
  | { type: "location" | "actions" | "photos"; eventId: string }
  | { type: "viewer"; eventId: string; index: number }
  | { type: "metadata" }
  | { type: "map" }

function JourneyInformation({
  journey,
  store,
  onClose,
}: {
  journey: RecordingJourney
  store: RecordingStore
  onClose: () => void
}) {
  const [draft, setDraft] = useState({
    title: journey.title,
    description: journey.description,
    status: journey.status,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <RecordDialog
      title="旅程信息"
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setError(null)
          setSaving(true)
          try {
            await store
              .getState()
              .mutate({ name: "journey.update", patch: draft })
            onClose()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存失败")
            setSaving(false)
          }
        }}
      >
        <RecordField label="名称">
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            className={recordInputClass}
          />
        </RecordField>
        <RecordField label="简介">
          <textarea
            rows={3}
            maxLength={10000}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            className={recordInputClass}
          />
        </RecordField>
        <RecordField label="旅行状态">
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target.value as typeof draft.status,
              })
            }
            className={recordInputClass}
          >
            <option value="DRAFT">尚未出发</option>
            <option value="ACTIVE">旅途中</option>
            <option value="COMPLETED">旅行已结束</option>
          </select>
        </RecordField>
        <p className="text-sm text-walnut">
          结束旅行不影响继续补记，内容仍仅自己可见。
        </p>
        <RecordError message={error} />
        <div className="flex justify-end">
          <RecordButton primary type="submit" disabled={saving}>
            保存信息
          </RecordButton>
        </div>
      </form>
    </RecordDialog>
  )
}

export default function RecordingOverlays({
  store,
  overlay,
  onClose,
  onOpen,
  onEdit,
  mapContent,
}: {
  store: RecordingStore
  overlay: RecordingOverlay | null
  onClose: () => void
  onOpen: (overlay: RecordingOverlay) => void
  onEdit: (event: RecordingEvent) => void
  mapContent: ReactNode
}) {
  const { journey, uploads } = useStore(store)
  if (!journey || !overlay) return null
  const event =
    "eventId" in overlay
      ? journey.events.find((event) => event.id === overlay.eventId)
      : null
  const events = journey.events.map((event) => ({
    id: event.id,
    title: eventTitle(event),
  }))
  async function photosSet(
    transform: (event: RecordingEvent) => {
      photos: { assetId: string; caption: string }[]
      coverAssetId: string | null
    }
  ) {
    await store.getState().mutate((journey) => ({
      name: "photos.set",
      eventId: event!.id,
      ...transform(journey.events.find((entry) => entry.id === event!.id)!),
    }))
  }
  if (overlay.type === "metadata")
    return (
      <JourneyInformation journey={journey} store={store} onClose={onClose} />
    )
  if (overlay.type === "map")
    return (
      <RecordDialog title="旅程地图" onClose={onClose} wide>
        <div className="h-[65dvh]">{mapContent}</div>
      </RecordDialog>
    )
  if (!event) return null
  if (overlay.type === "location")
    return (
      <RecordLocationForm
        initialLocation={event.location}
        onClose={onClose}
        onSave={async (location) => {
          await store.getState().mutate({
            name: "event.update",
            eventId: event.id,
            patch: { location },
          })
        }}
      />
    )
  if (overlay.type === "viewer")
    return (
      <RecordPhotoViewer
        photos={event.photos}
        initialIndex={overlay.index}
        onClose={onClose}
      />
    )
  if (overlay.type === "actions")
    return (
      <RecordActions
        eventId={event.id}
        title={eventTitle(event)}
        events={events}
        onClose={onClose}
        onEdit={() => onEdit(event)}
        onPhotos={() => onOpen({ type: "photos", eventId: event.id })}
        onMove={async (afterEventId) => {
          await store
            .getState()
            .mutate({ name: "event.move", eventId: event.id, afterEventId })
        }}
        onDelete={async () => {
          if (
            store
              .getState()
              .uploads.some((upload) => upload.eventId === event.id)
          )
            throw new Error("请先完成或取消这段记录的待上传照片。")
          await store
            .getState()
            .mutate({ name: "event.remove", eventId: event.id })
        }}
      />
    )
  return (
    <RecordPhotos
      title={eventTitle(event)}
      eventId={event.id}
      events={events}
      photos={event.photos}
      uploads={uploads.filter((upload) => upload.eventId === event.id)}
      onClose={onClose}
      onFiles={(files) => store.getState().addFiles(event.id, files)}
      onRetry={(id) => store.getState().retryUpload(id)}
      onDiscard={(id) => store.getState().discardUpload(id)}
      onCaption={async (assetId, caption) => {
        await photosSet((event) => ({
          photos: event.photos.map((photo) => ({
            assetId: photo.assetId,
            caption: photo.assetId === assetId ? caption : photo.caption,
          })),
          coverAssetId:
            event.photos.find((photo) => photo.isCover)?.assetId || null,
        }))
      }}
      onReorder={async (ids) => {
        await photosSet((event) => ({
          photos: ids.map((assetId) => ({
            assetId,
            caption: event.photos.find((photo) => photo.assetId === assetId)!
              .caption,
          })),
          coverAssetId:
            event.photos.find((photo) => photo.isCover)?.assetId || null,
        }))
      }}
      onMove={async (assetId, targetEventId) => {
        await store.getState().mutate((journey) => ({
          name: "photo.move",
          assetId,
          fromEventId: event.id,
          toEventId: targetEventId,
          afterAssetId:
            journey.events
              .find((event) => event.id === targetEventId)
              ?.photos.at(-1)?.assetId || null,
        }))
      }}
      onUnlink={async (assetId) => {
        await photosSet((event) => ({
          photos: event.photos
            .filter((photo) => photo.assetId !== assetId)
            .map((photo) => ({
              assetId: photo.assetId,
              caption: photo.caption,
            })),
          coverAssetId:
            event.photos.find(
              (photo) => photo.isCover && photo.assetId !== assetId
            )?.assetId || null,
        }))
      }}
    />
  )
}
