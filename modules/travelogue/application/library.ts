import { createStore } from "zustand/vanilla"
import type {
  JourneyCreate,
  JourneySummary,
  MapPhoto,
} from "@/modules/data-model/contracts"
import type { RecordingApi } from "../ports"
import { operationId } from "./operation-id"

export function createLibrarySession(api: RecordingApi) {
  const state = createStore(() => ({
    journeys: [] as JourneySummary[],
    photos: [] as MapPhoto[],
    loading: true,
    error: null as string | null,
  }))
  let generation = 0
  let pendingCreate: JourneyCreate | null = null
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    async load() {
      const current = ++generation
      state.setState({ loading: true, error: null })
      try {
        const atlas = await api.atlas()
        if (current === generation) state.setState({ ...atlas, loading: false })
      } catch (cause) {
        if (current === generation)
          state.setState({
            error:
              cause instanceof Error ? cause.message : "旅程列表打开失败。",
            loading: false,
          })
      }
    },
    dispose() {
      generation++
    },
    async create(title: string) {
      pendingCreate ||= { idempotencyKey: operationId(), title }
      const result = await api.create(pendingCreate)
      if (result.journey.title !== title)
        await api.command(result.journey.id, {
          expectedRevision: result.journey.revision,
          idempotencyKey: operationId(),
          command: { name: "journey.update", patch: { title } },
        })
      pendingCreate = null
      return result.journey.id
    },
    async rename(id: string, title: string) {
      const journey = await api.get(id)
      const result = await api.command(id, {
        expectedRevision: journey.revision,
        idempotencyKey: operationId(),
        command: { name: "journey.update", patch: { title } },
      })
      state.setState(({ journeys }) => ({
        journeys: journeys.map((item) =>
          item.id === id
            ? {
                ...item,
                title: result.journey.title,
                updatedAt: result.journey.updatedAt,
                revision: result.journey.revision,
              }
            : item
        ),
      }))
    },
  }
}
