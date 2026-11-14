import { operationId } from "./operation-id"
import { createStore } from "zustand/vanilla"
import type {
  JourneyCommand,
  JourneySnapshot,
  JourneySummary,
  JourneyMutation,
  JourneyMutationResult,
  EventWeather,
} from "@/modules/data-model/contracts/index"
import { weatherInput } from "../model/weather-input"
import { RecordingApiError, type RecordingApi } from "../ports"
import type { ReceiptExtraction } from "@/modules/data-model/contracts/receipts"
import type { UploadTask } from "../contracts"

type PendingUpload = UploadTask
type CommandInput =
  | JourneyCommand
  | ((journey: JourneySnapshot) => JourneyCommand)

interface RecordingState {
  journey: JourneySnapshot | null
  weather: Record<string, EventWeather | null>
  loading: boolean
  saving: number
  error: string | null
  conflict: boolean
  uploads: PendingUpload[]
  directory: {
    journeys: JourneySummary[]
    loading: boolean
    error: string | null
  }
  loadDirectory: () => Promise<void>
  activate: () => void
  pendingMutationKey: string | null
  confirmPending: () => Promise<JourneyMutationResult | null>
  load: () => Promise<void>
  mutate: (
    command: CommandInput,
    idempotencyKey?: string
  ) => Promise<JourneyMutationResult>
  addFiles: (eventId: string, files: File[]) => void
  retryUpload: (id: string) => void
  discardUpload: (id: string) => void
  dispose: () => void
  uploadReceipt: (file: File, uploadId: string) => Promise<string>
  recognizeReceipt: (assetId: string) => Promise<ReceiptExtraction>
  collaboration: Pick<
    RecordingApi,
    "members" | "invitations" | "invite" | "revokeInvitation"
  >
}

export function createRecordingStore(journeyId: string, api: RecordingApi) {
  let writes: Promise<unknown> = Promise.resolve()
  let uploads: Promise<unknown> = Promise.resolve()
  let unconfirmed: JourneyMutation | null = null
  let disposed = false
  let loadGeneration = 0
  let directoryGeneration = 0

  const store = createStore<RecordingState>((set, get) => ({
    directory: { journeys: [], loading: true, error: null },
    activate: () => {
      disposed = false
    },
    pendingMutationKey: null,
    confirmPending: () =>
      unconfirmed
        ? get().mutate(unconfirmed.command, unconfirmed.idempotencyKey)
        : Promise.resolve(null),
    loadDirectory: async () => {
      if (disposed) return
      const generation = ++directoryGeneration
      set({ directory: { ...get().directory, loading: true, error: null } })
      try {
        const journeys = await api.list()
        if (!disposed && generation === directoryGeneration)
          set({ directory: { journeys, loading: false, error: null } })
      } catch (cause) {
        if (!disposed && generation === directoryGeneration)
          set({
            directory: {
              ...get().directory,
              loading: false,
              error: cause instanceof Error ? cause.message : "目录打开失败",
            },
          })
      }
    },
    journey: null,
    weather: {},
    loading: true,
    saving: 0,
    error: null,
    conflict: false,
    uploads: [],
    collaboration: api,
    uploadReceipt: async (file, uploadId) => {
      const asset = await api.upload(file, uploadId)
      return asset.id
    },
    recognizeReceipt: (assetId) => api.extractReceipt(assetId),
    load: async () => {
      if (disposed) return
      const generation = ++loadGeneration
      set({ loading: true, error: null })
      try {
        const journey = await api.get(journeyId)
        if (!disposed && generation === loadGeneration) {
          if (unconfirmed) {
            set({ loading: false })
            return
          }
          acceptJourney(journey)
          set({ loading: false, conflict: false })
        }
      } catch (cause) {
        if (!disposed && generation === loadGeneration)
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
          if (disposed) throw new Error("旅程页面已关闭。")
          if (get().conflict)
            throw new Error(
              "记录已在别处更新，请先刷新最新版本。输入会保留在编辑区。"
            )
          // 网络断开时服务端可能已经写入。先用原请求确认结果，再处理后续操作，避免重复添加或覆盖顺序。
          if (unconfirmed) {
            const previous = unconfirmed
            const result = await api.command(journeyId, previous)
            unconfirmed = null
            set({ pendingMutationKey: null })
            if (disposed) throw new Error("旅程页面已关闭。")
            acceptJourney(result.journey)
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
          set({ pendingMutationKey: idempotencyKey })
          const result = await api.command(journeyId, unconfirmed)
          unconfirmed = null
          set({ pendingMutationKey: null })
          if (disposed) throw new Error("旅程页面已关闭。")
          acceptJourney(result.journey)
          return result
        } catch (cause) {
          const conflict =
            get().conflict ||
            (cause instanceof RecordingApiError &&
              cause.code === "REVISION_CONFLICT")
          if (cause instanceof RecordingApiError && cause.status < 500) {
            unconfirmed = null
            set({ pendingMutationKey: null })
          }
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
      set({ uploads: get().uploads.filter((item) => item.id !== id) })
    },
    dispose: () => {
      disposed = true
      loadGeneration++
      directoryGeneration++
    },
  }))

  function acceptJourney(journey: JourneySnapshot) {
    if (disposed) return
    const previous = store.getState()
    const oldEvents = new Map(
      previous.journey?.events.map((event) => [event.id, event])
    )
    const weather = Object.fromEntries(
      journey.events.flatMap((event) => {
        const old = oldEvents.get(event.id)
        return old && weatherInput(old) === weatherInput(event)
          ? [[event.id, previous.weather[event.id] ?? null]]
          : []
      })
    )
    store.setState({ journey, weather, error: null })
    void loadWeather(journey.id)
  }

  async function loadWeather(id: string) {
    try {
      const result = await api.weather(id)
      const current = store.getState().journey
      if (
        disposed ||
        !current ||
        result.journeyId !== current.id ||
        result.revision !== current.revision
      )
        return
      store.setState({
        weather: Object.fromEntries(
          result.events.map((event) => [event.eventId, event.weather])
        ),
      })
    } catch {
      // Weather is optional derived data; its failure never changes save state.
    }
  }

  function queueUpload(id: string) {
    uploads = uploads.then(async () => {
      const upload = store.getState().uploads.find((item) => item.id === id)
      if (!upload || disposed) return
      try {
        const assetId =
          upload.assetId || (await api.upload(upload.file, upload.id)).id
        if (disposed) return
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
