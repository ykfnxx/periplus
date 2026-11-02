import { RecordingApiError, recordingApi } from "../data/client"
import { operationId } from "../data/operation-id"
import { draftStorage, type LocalDraft } from "./storage"

export async function publishDraft(
  id: string,
  userId: string,
  api = recordingApi,
  storage = draftStorage
) {
  const account = await api.account()
  if (account.userId !== userId)
    throw new Error("请登录保存这份草稿的账号后再提交。")
  const stored = await storage.get(id)
  if (!stored || stored.userId !== userId) throw new Error("草稿不存在。")
  const draft: LocalDraft = stored
  if (draft.complete) {
    await storage.remove(draft.id)
    return { journeyId: draft.journey.id, eventId: draft.eventId! }
  }
  async function persist() {
    await storage.put(draft)
  }
  async function send() {
    try {
      const result = await api.command(draft.journey.id, draft.pending!)
      if (result.eventId) draft.eventId = result.eventId
      const attached = draft.pending!.command.name === "photos.set"
      delete draft.pending
      if (attached || !draft.photos.length) draft.complete = true
      await persist()
      return attached
    } catch (cause) {
      if (
        cause instanceof RecordingApiError &&
        (cause.code === "REVISION_CONFLICT" || cause.code === "INVALID_INPUT")
      ) {
        delete draft.pending
        await persist()
        if (cause.code === "REVISION_CONFLICT")
          throw new Error("游记已更新。请检查草稿后，再次确认加入最新游记。")
      }
      throw cause
    }
  }
  // Resolve the exact persisted request before preparing another mutation.
  if (draft.pending && (await send())) {
    await storage.remove(draft.id)
    return { journeyId: draft.journey.id, eventId: draft.eventId! }
  }
  if (!draft.eventId) {
    const journey = await api.get(draft.journey.id)
    draft.pending = {
      expectedRevision: journey.revision,
      idempotencyKey: operationId(),
      command: {
        name: "event.add",
        afterEventId: journey.events.at(-1)?.id ?? null,
        content: draft.content,
      },
    }
    await persist()
    await send()
  }
  for (const photo of draft.photos) {
    if (photo.assetId) continue
    photo.assetId = (await api.upload(photo.file, photo.id)).id
    await persist()
  }
  if (draft.photos.length) {
    const journey = await api.get(draft.journey.id)
    const event = journey.events.find((event) => event.id === draft.eventId)
    if (!event) throw new Error("记录已删除，请为草稿选择其他游记。")
    const assets = new Set(event.photos.map((photo) => photo.assetId))
    draft.pending = {
      expectedRevision: journey.revision,
      idempotencyKey: operationId(),
      command: {
        name: "photos.set",
        eventId: event.id,
        photos: [
          ...event.photos.map((photo) => ({
            assetId: photo.assetId,
            caption: photo.caption,
          })),
          ...draft.photos
            .filter((photo) => !assets.has(photo.assetId!))
            .map((photo) => ({ assetId: photo.assetId!, caption: "" })),
        ],
        coverAssetId:
          event.photos.find((photo) => photo.isCover)?.assetId ??
          draft.photos[0].assetId!,
      },
    }
    await persist()
    await send()
  }
  await storage.remove(draft.id)
  return { journeyId: draft.journey.id, eventId: draft.eventId! }
}

export function draftError(cause: unknown) {
  return cause instanceof Error ? cause.message : "草稿操作失败，请重试。"
}

export function draftInputError(draft: LocalDraft) {
  if (draft.eventId || draft.pending) return null
  const { content } = draft
  if (
    !content.title.trim() &&
    !content.body.trim() &&
    !draft.photos.length &&
    !content.location &&
    content.category !== "TRANSIT"
  )
    return "写下一句话，选几张照片，或添加地点。"
  if (!content.date) return "请选择事件日期。"
  if (
    content.category === "TRANSIT" &&
    (!content.transit?.fromName?.trim() || !content.transit.toName?.trim())
  )
    return "请填写出发地和目的地。"
  if (
    content.startAt &&
    content.endAt &&
    Date.parse(content.endAt) < Date.parse(content.startAt)
  )
    return "结束时间不能早于开始时间。"
  return null
}
