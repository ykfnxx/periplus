import {
  RecordingApiError,
  type RecordingApi,
  type DraftStorage,
} from "../ports"

import { draftError } from "./publish-draft"

export async function loadDraftContext(
  api: RecordingApi,
  storage: DraftStorage
) {
  let userId: string
  try {
    userId = (await api.account()).userId
  } catch (cause) {
    if (cause instanceof RecordingApiError && cause.status !== 401) throw cause
    const context = await storage.context()
    if (!context)
      throw new Error("请先联网登录并打开一次游记，再使用本机草稿。")
    return { context, error: null }
  }
  await storage.activate(userId)
  const context = (await storage.context(userId))!
  let journeys
  try {
    journeys = await api.list()
  } catch (cause) {
    return { context, error: `游记目录暂时无法更新：${draftError(cause)}` }
  }
  const next = {
    userId,
    journeys: journeys.map(({ id, title }) => ({ id, title })),
  }
  await storage.remember(next)
  return { context: next, error: null }
}
