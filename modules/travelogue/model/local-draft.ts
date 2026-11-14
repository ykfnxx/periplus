import type { JourneyMutation } from "@/modules/data-model/contracts/index"
import type { EventDraft } from "../model/event-draft"

export type DraftJourney = { id: string; title: string }
export type DraftContext = { userId: string; journeys: DraftJourney[] }
export type DraftPhoto = { id: string; file: File; assetId?: string }
export type LocalDraft = {
  id: string
  userId: string
  journey: DraftJourney
  content: EventDraft
  photos: DraftPhoto[]
  updatedAt: string
  afterEventId?: string | null
  complete?: boolean
  eventId?: string
  pending?: JourneyMutation
}
