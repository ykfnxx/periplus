import type { DraftJourney, TransitEvent } from "@/types/journey"
import type {
  ChatMessage,
  ChatMessageRole,
} from "@/modules/workspace/state/types"

export function createChatMessage(
  role: ChatMessageRole,
  content: string
): ChatMessage {
  return { id: `message-${Date.now()}-${Math.random()}`, role, content }
}

export function mapTransitEvents(
  journey: DraftJourney | null,
  mapper: (event: TransitEvent) => TransitEvent
) {
  if (!journey) return null
  return {
    ...journey,
    events: journey.events.map((event) =>
      event.type === "TRANSIT" ? mapper(event) : event
    ),
  }
}
