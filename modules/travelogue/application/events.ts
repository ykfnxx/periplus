import type { RecordingStore } from "./recording-session"
import { eventContentPatch, type EventDraft } from "../model/event-draft"

export async function saveEvent(
  store: RecordingStore,
  input: {
    draft: EventDraft
    saved: EventDraft
    files: File[]
    eventId: string
    saveKey: string
  }
) {
  const { draft, saved, files, eventId, saveKey } = input
  const normalized: EventDraft =
    draft.category === "TRANSIT" ? { ...draft, title: "" } : draft
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
  if (Object.keys(changes).length > 0)
    await store
      .getState()
      .mutate({ name: "event.update", eventId, patch: changes }, saveKey)
  if (files.length) store.getState().addFiles(eventId, files)
  return { id: eventId, draft: normalized }
}
