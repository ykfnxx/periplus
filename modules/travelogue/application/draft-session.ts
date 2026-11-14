import { createStore } from "zustand/vanilla"
import type { LocalDraft } from "../model/local-draft"
import type { DraftStorage, RecordingApi } from "../ports"
import { draftError, draftInputError, publishDraft } from "./publish-draft"
import { operationId } from "./operation-id"

export function createDraftSession(
  initial: LocalDraft,
  storage: DraftStorage,
  api: RecordingApi
) {
  const state = createStore(() => ({
    draft: initial,
    status: "",
    error: null as string | null,
    busy: false,
  }))
  let writes: Promise<unknown> = Promise.resolve()

  function update(value: LocalDraft) {
    const next = { ...value, updatedAt: new Date().toISOString() }
    state.setState({ draft: next, status: "正在保存到本机…", error: null })
    // A failed write remains visible; the next edit can persist the complete draft.
    writes = writes
      .catch(() => {})
      .then(async () => {
        await storage.put(next)
        if (state.getState().draft === next)
          state.setState({ status: "已存本机" })
      })
    void writes.catch((cause) => {
      state.setState({
        status: "未存入本机",
        error: `本机保存失败：${draftError(cause)}`,
      })
    })
  }

  return {
    getState: state.getState,
    subscribe: state.subscribe,
    update,
    changeFiles(files: File[]) {
      const draft = state.getState().draft
      update({
        ...draft,
        photos: files.map(
          (file) =>
            draft.photos.find((photo) => photo.file === file) || {
              id: operationId(),
              file,
            }
        ),
      })
    },
    async beforeClose() {
      if (state.getState().busy) return false
      try {
        await writes
        return true
      } catch (cause) {
        state.setState({
          error: `本机保存失败，请保留此页面：${draftError(cause)}`,
        })
        return false
      }
    },
    async publish() {
      if (state.getState().busy) return
      const { draft } = state.getState()
      const invalid = draftInputError(draft)
      if (invalid) {
        state.setState({ error: invalid })
        return
      }
      state.setState({ busy: true, error: null })
      let persisted = false
      try {
        await writes.catch(() => {})
        await storage.put(state.getState().draft)
        persisted = true
        return await publishDraft(draft.id, draft.userId, api, storage)
      } catch (cause) {
        const stored =
          persisted && (await storage.get(draft.id).catch(() => undefined))
        state.setState({
          ...(stored ? { draft: stored } : {}),
          error: draftError(cause),
        })
      } finally {
        state.setState({ busy: false })
      }
    },
  }
}
