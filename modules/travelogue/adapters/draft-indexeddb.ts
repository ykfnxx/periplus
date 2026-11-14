import type { DraftContext, LocalDraft } from "../model/local-draft"
import type { DraftStorage } from "../ports"
export type {
  DraftJourney,
  DraftContext,
  DraftPhoto,
  LocalDraft,
} from "../model/local-draft"

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("periplus-drafts", 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "id" })
      request.result.createObjectStore("context")
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(
  store: "drafts" | "context",
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = action(tx.objectStore(store))
    tx.oncomplete = () => {
      db.close()
      resolve(request.result)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error || request.error)
    }
  })
}

export const draftStorage: DraftStorage = {
  get: (id: string) =>
    transaction<LocalDraft | undefined>("drafts", "readonly", (s) => s.get(id)),
  put: (draft: LocalDraft) =>
    transaction("drafts", "readwrite", (s) => s.put(draft)),
  remove: (id: string) =>
    transaction("drafts", "readwrite", (s) => s.delete(id)),
  list: async (userId: string) => {
    const drafts = await transaction<LocalDraft[]>("drafts", "readonly", (s) =>
      s.getAll()
    )
    return drafts
      .filter((draft) => draft.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  context: async (userId?: string): Promise<DraftContext | undefined> => {
    const account =
      userId ??
      (await transaction<string | undefined>("context", "readonly", (s) =>
        s.get("active-user")
      ))
    if (!account) return undefined
    return (
      (await transaction<DraftContext | undefined>("context", "readonly", (s) =>
        s.get(`user:${account}`)
      )) ?? { userId: account, journeys: [] }
    )
  },
  activate: (userId: string) =>
    transaction("context", "readwrite", (s) => s.put(userId, "active-user")),
  remember: (context: DraftContext) =>
    transaction("context", "readwrite", (s) =>
      s.put(context, `user:${context.userId}`)
    ),
}
