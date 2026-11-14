import type { DraftStorage, RecordingApi } from "../ports"
import type {
  DraftContext,
  DraftJourney,
  LocalDraft,
} from "../model/local-draft"
import { loadDraftContext } from "./draft-context"
import { operationId } from "./operation-id"
import { eventContent } from "../model/event-draft"
export function createLocalDraft(
  userId: string,
  journey: DraftJourney
): LocalDraft {
  return {
    id: operationId(),
    userId,
    journey,
    content: eventContent(),
    photos: [],
    updatedAt: new Date().toISOString(),
  }
}
export function createDraftLibrary(storage: DraftStorage, api: RecordingApi) {
  return {
    async load() {
      const result = await loadDraftContext(api, storage)
      return { ...result, drafts: await storage.list(result.context.userId) }
    },
    list: (userId: string) => storage.list(userId),
    remove: (id: string) => storage.remove(id),
    async open(userId: string) {
      const [, drafts] = await Promise.all([
        storage.activate(userId),
        storage.list(userId),
      ])
      return drafts
    },
    remember: (context: DraftContext) => storage.remember(context),
  }
}
