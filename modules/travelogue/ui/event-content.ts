import type { EventContent, JourneyEvent } from "@/modules/data-model/contracts"

export function eventContent(event?: JourneyEvent): EventContent {
  return {
    title: event?.title ?? "",
    body: event?.body ?? "",
    category: event?.category ?? null,
    date: event?.date ?? null,
    time: event?.time ?? null,
    timeZone: event?.timeZone ?? null,
    location: event?.location ?? null,
  }
}

export function eventContentPatch(
  draft: EventContent,
  baseline: EventContent
): Partial<EventContent> {
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(baseline[key as keyof EventContent])
    )
  )
}
