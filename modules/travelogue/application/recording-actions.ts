import type { RecordingActions } from "../contracts"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import type { RecordingStore } from "./recording-session"
export function createRecordingActions(
  store: RecordingStore
): RecordingActions {
  return {
    load: () => store.getState().load(),
    async removeEvent(eventId: string) {
      if (
        store.getState().uploads.some((upload) => upload.eventId === eventId)
      ) {
        const error = "请先完成或取消这段记录的待上传照片。"
        store.setState({ error })
        throw new Error(error)
      }
      return store.getState().mutate({ name: "event.remove", eventId })
    },
    moveEvent: (eventId: string, afterEventId: string | null) =>
      store.getState().mutate({ name: "event.move", eventId, afterEventId }),
    saveJourney: (
      patch: Pick<JourneySnapshot, "title" | "description" | "status">
    ) => store.getState().mutate({ name: "journey.update", patch }),
  }
}
