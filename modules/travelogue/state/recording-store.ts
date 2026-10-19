import { operationId } from "../data/operation-id"
import { createStore } from "zustand/vanilla"
import type {
  RecordingCommand,
  RecordingJourney,
  RecordingMutation,
  RecordingMutationResult,
} from "@/modules/data-model/contracts/recording"
import {
  recordingApi,
  RecordingApiError,
  type RecordingApi,
} from "../data/client"
import type { RecordUpload } from "../ui/RecordPhotos"

type PendingUpload = RecordUpload & { file: File; assetId?: string }
type CommandInput =
  | RecordingCommand
  | ((journey: RecordingJourney) => RecordingCommand)

interface RecordingState {
  journey: RecordingJourney | null
  loading: boolean
  saving: number
  error: string | null
  conflict: boolean
  uploads: PendingUpload[]
  load: () => Promise<void>
  mutate: (
    command: CommandInput,
    idempotencyKey?: string
  ) => Promise<RecordingMutationResult>
  addFiles: (eventId: string, files: File[]) => void
  retryUpload: (id: string) => void
  discardUpload: (id: string) => void
  dispose: () => void
}

export function createRecordingStore(
  journeyId: string,
  api: RecordingApi = recordingApi
) {
  let writes: Promise<unknown> = Promise.resolve()
  let uploads: Promise<unknown> = Promise.resolve()
  let unconfirmed: RecordingMutation | null = null
  let disposed = false

  const store = createStore<RecordingState>((set, get) => ({
    journey: null,
    loading: true,
    saving: 0,
    error: null,
    conflict: false,
    uploads: [],
    load: async () => {
      disposed = false
      set({ loading: true, error: null })
      try {
        const journey = await api.get(journeyId)
        if (!disposed) {
          unconfirmed = null
          set({ journey, loading: false, conflict: false })
        }
      } catch (cause) {
        if (!disposed)
          set({
            loading: false,
            error: cause instanceof Error ? cause.message : "旅程打开失败。",
          })
      }
    },
    mutate: (input, idempotencyKey = operationId()) => {
      set({ saving: get().saving + 1 })
      const operation = writes.then(async () => {
        try {
          if (get().conflict)
            throw new Error(
              "记录已在别处更新，请先刷新最新版本。输入会保留在编辑区。"
            )
          // 网络断开时服务端可能已经写入。先用原请求确认结果，再处理后续操作，避免重复添加或覆盖顺序。
          if (unconfirmed) {
            const previous = unconfirmed
            const result = await api.command(journeyId, previous)
            unconfirmed = null
            set({ journey: result.journey, error: null })
            if (previous.idempotencyKey === idempotencyKey) return result
          }
          const journey = get().journey
          if (!journey) throw new Error("旅程尚未打开。")
          const command = typeof input === "function" ? input(journey) : input
          unconfirmed = {
            expectedRevision: journey.revision,
            idempotencyKey,
            command,
          }
          const result = await api.command(journeyId, unconfirmed)
          unconfirmed = null
          set({ journey: result.journey, error: null })
          return result
        } catch (cause) {
          const conflict =
            get().conflict ||
            (cause instanceof RecordingApiError &&
              cause.code === "REVISION_CONFLICT")
          if (cause instanceof RecordingApiError && cause.status < 500)
            unconfirmed = null
          const message = conflict
            ? "这份记录已在别处修改。请刷新最新版本后再保存，当前输入仍保留。"
            : cause instanceof Error
              ? cause.message
              : "保存失败，请重试。"
          set({ error: message, conflict })
          throw new Error(message)
        } finally {
          set({ saving: Math.max(0, get().saving - 1) })
        }
      })
      writes = operation.catch(() => {})
      return operation
    },
    addFiles: (eventId, files) => {
      const entries: PendingUpload[] = files.map((file) => ({
        id: operationId(),
        eventId,
        file,
        name: file.name,
        preview: URL.createObjectURL(file),
        status: "uploading",
      }))
      set({ uploads: [...get().uploads, ...entries] })
      entries.forEach((entry) => queueUpload(entry.id))
    },
    retryUpload: (id) => {
      set({
        uploads: get().uploads.map((upload) =>
          upload.id === id
            ? { ...upload, status: "uploading", error: undefined }
            : upload
        ),
      })
      queueUpload(id)
    },
    discardUpload: (id) => {
      const upload = get().uploads.find((item) => item.id === id)
      if (upload?.status !== "failed") return
      URL.revokeObjectURL(upload.preview)
      set({ uploads: get().uploads.filter((item) => item.id !== id) })
    },
    dispose: () => {
      disposed = true
      get().uploads.forEach((upload) => URL.revokeObjectURL(upload.preview))
    },
  }))

  function queueUpload(id: string) {
    uploads = uploads.then(async () => {
      const upload = store.getState().uploads.find((item) => item.id === id)
      if (!upload || disposed) return
      try {
        const assetId =
          upload.assetId || (await api.upload(upload.file, upload.id)).id
        store.setState((state) => ({
          uploads: state.uploads.map((item) =>
            item.id === id ? { ...item, assetId } : item
          ),
        }))
        await store.getState().mutate((journey) => {
          const event = journey.events.find(
            (item) => item.id === upload.eventId
          )
          if (!event)
            throw new Error("记录已被删除，照片素材已上传，请重新选择归属。")
          return {
            name: "photos.set",
            eventId: event.id,
            photos: [
              ...event.photos
                .filter((photo) => photo.assetId !== assetId)
                .map((photo) => ({
                  assetId: photo.assetId,
                  caption: photo.caption,
                })),
              { assetId, caption: "" },
            ],
            coverAssetId:
              event.photos.find((photo) => photo.isCover)?.assetId || assetId,
          }
        }, `${id}-attach`)
        URL.revokeObjectURL(upload.preview)
        store.setState((state) => ({
          uploads: state.uploads.filter((item) => item.id !== id),
        }))
      } catch (cause) {
        store.setState((state) => ({
          uploads: state.uploads.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "failed",
                  error:
                    cause instanceof Error
                      ? cause.message
                      : "上传失败，请重试。",
                }
              : item
          ),
        }))
      }
    })
  }
  return store
}
export type RecordingStore = ReturnType<typeof createRecordingStore>
