import type { EventLocation } from "@/modules/data-model/contracts"
import { createStore } from "zustand/vanilla"
export type EventWindowRequest = {
  eventId: string | null
  afterEventId: string | null
  location?: EventLocation
}
export const createWorkbenchStore = () =>
  createStore(() => ({
    picking: null as { location: EventLocation | null } | null,
    selected: null as string | null,
    focusId: 0,
    activeDay: null as string | null,
    dialog: null as EventWindowRequest | null,
    detailsId: null as string | null,
    photoViewer: null as { ids: string[]; index: number } | null,
    metadata: false,
    members: false,
    receiptImport: null as { eventId: string | null } | null,
    receiptDetails: null as { eventId: string; assetId: string } | null,
    photoPanelId: null as string | null,
    sheet: "half" as "small" | "half" | "full",
    panelWidth: 384,
  }))
