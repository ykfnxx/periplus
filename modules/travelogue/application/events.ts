import type { RecordingStore } from "./recording-session"
import {
  eventContent,
  eventContentPatch,
  type EventDraft,
} from "../model/event-draft"

export async function saveEvent(
  store: RecordingStore,
  input: {
    draft: EventDraft
    saved: EventDraft
    files: File[]
    eventId: string | null
    afterEventId: string | null
    saveKey: string
  }
) {
  const { draft, saved, files, eventId, afterEventId, saveKey } = input
  const normalized: EventDraft =
    draft.category === "TRANSIT" ? { ...draft, title: "" } : draft
  if (
    !eventId &&
    !normalized.body.trim() &&
    !normalized.title.trim() &&
    !files.length &&
    !normalized.location &&
    !(
      normalized.category === "TRANSIT" &&
      normalized.transit?.fromName?.trim() &&
      normalized.transit?.toName?.trim()
    )
  ) {
    throw new Error("写下一句话，选几张照片，或在地图上选个地点。")
  }
  if (!normalized.date) {
    throw new Error("请选择事件日期。")
  }
  if (
    normalized.category === "TRANSIT" &&
    (!normalized.transit?.fromName?.trim() ||
      !normalized.transit?.toName?.trim())
  ) {
    throw new Error("请填写出发地和目的地。")
  }
  if (
    normalized.startAt &&
    normalized.endAt &&
    Date.parse(normalized.endAt) < Date.parse(normalized.startAt)
  ) {
    throw new Error("结束时间不能早于开始时间，请确认到达日期。")
  }
  const changes = eventContentPatch(normalized, saved)
  const result =
    eventId && Object.keys(changes).length === 0
      ? { journey: store.getState().journey!, eventId }
      : await store.getState().mutate(
          eventId
            ? { name: "event.update", eventId, patch: changes }
            : {
                name: "event.add",
                afterEventId: afterEventId,
                content: normalized,
              },
          eventId ? undefined : saveKey
        )
  const id = eventId || result.eventId!
  const persisted = result.journey.events.find((event) => event.id === id)
  const persistedDraft = persisted && eventContent(persisted)
  if (
    persistedDraft &&
    Object.entries(eventId ? changes : normalized).some(([key, value]) => {
      const stored = persistedDraft[key as keyof EventDraft]
      return value && typeof value === "object" && key === "transit"
        ? Object.entries(value).some(
            ([field, next]) =>
              JSON.stringify(
                (stored as Record<string, unknown> | null)?.[field]
              ) !== JSON.stringify(next)
          )
        : JSON.stringify(stored) !== JSON.stringify(value)
    })
  )
    await store.getState().mutate({
      name: "event.update",
      eventId: id,
      patch: eventId ? changes : normalized,
    })
  if (files.length) store.getState().addFiles(id, files)
  return { id, draft: normalized }
}
