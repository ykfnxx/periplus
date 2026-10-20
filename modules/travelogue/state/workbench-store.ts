import { createStore } from "zustand/vanilla"
export type EventWindowRequest = {
  eventId: string | null
  afterEventId: string | null
}
export const createWorkbenchStore = () =>
  createStore(() => ({
    selected: null as string | null,
    focusId: 0,
    activeDay: null as string | null,
    dialog: null as EventWindowRequest | null,
    expanded: null as { eventId: string; photoIndex: number } | null,
    metadata: false,
    sheet: "half" as "small" | "half" | "full",
    panelWidth: 384,
  }))
