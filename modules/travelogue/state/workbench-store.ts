import type { EventContent, EventLocation } from "@/modules/data-model/contracts"
import { createStore } from "zustand/vanilla"

export type EventWindowRequest = {
  eventId: string | null
  afterEventId: string | null
  date?: string
  category?: EventContent["category"]
  location?: EventLocation
}

export const createWorkbenchStore = () =>
  createStore(() => ({
    picking: null as { location: EventLocation | null } | null,
    selected: null as string | null,
    view: "list" as "list" | "timeline",
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
    sheetRatio: 0.65,
    savedSheetRatio: null as number | null,
    panelWidth: 428,
  }))
