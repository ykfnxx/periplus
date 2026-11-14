import { createStore } from "zustand/vanilla"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import {
  eventContent,
  eventContentPatch,
  type EventDraft,
} from "../model/event-draft"
import type { RecordingStore } from "./recording-session"
import { saveEvent } from "./events"
import { operationId } from "./operation-id"

export function createEventEditor(
  store: RecordingStore,
  eventId: string,
  initial: EventDraft
) {
  const state = createStore(() => ({
    draft: initial,
    saved: initial,
    files: [] as File[],
    busy: false,
    pending: false,
    error: null as string | null,
    status: "",
  }))
  let saveKey = operationId()
  async function save() {
    if (state.getState().busy) return
    if (state.getState().pending) return confirmPending()
    state.setState({ busy: true, error: null })
    try {
      const { draft, saved, files } = state.getState()
      const result = await saveEvent(store, {
        draft,
        saved,
        files,
        eventId,
        saveKey,
      })
      saveKey = operationId()
      state.setState({
        draft: result.draft,
        saved: result.draft,
        files: [],
        pending: false,
        status: "已保存",
      })
      return result.id
    } catch (cause) {
      state.setState({
        pending: store.getState().pendingMutationKey === saveKey,
        error:
          cause instanceof Error
            ? cause.message
            : "保存失败，内容保留，请重试。",
      })
    } finally {
      state.setState({ busy: false })
    }
  }
  async function confirmPending() {
    if (state.getState().busy) return
    state.setState({ busy: true, error: null })
    try {
      const result = await store.getState().confirmPending()
      const journey = result?.journey ?? store.getState().journey!
      const entry = journey.events.find((event) => event.id === eventId)
      if (!entry) throw new Error("这段记录已移除。")
      // Confirmation only settles the original intent; later edits require another save.
      const files = state.getState().files
      if (files.length) store.getState().addFiles(eventId, files)
      saveKey = operationId()
      state.setState({
        saved: eventContent(entry),
        files: [],
        pending: false,
        status: "已确认保存",
      })
      return eventId
    } catch (cause) {
      state.setState({
        pending: store.getState().pendingMutationKey === saveKey,
        error: cause instanceof Error ? cause.message : "确认失败，请重试。",
      })
    } finally {
      state.setState({ busy: false })
    }
  }
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    change(draft: EventDraft) {
      state.setState({ draft, status: "" })
    },
    files(files: File[]) {
      state.setState({ files })
    },
    save,
    confirmPending,
    reload(journey: JourneySnapshot) {
      const entry = journey.events.find((event) => event.id === eventId)
      if (!entry) {
        state.setState({ error: "这段记录已移除。" })
        return
      }
      const fresh = eventContent(entry)
      const patch = eventContentPatch(
        state.getState().draft,
        state.getState().saved
      )
      state.setState({
        draft: {
          ...fresh,
          ...patch,
          transit:
            patch.transit === undefined
              ? fresh.transit
              : patch.transit === null
                ? null
                : { ...fresh.transit, ...patch.transit },
        },
        saved: fresh,
        error: null,
      })
    },
  }
}
