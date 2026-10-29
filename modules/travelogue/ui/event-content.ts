import type {
  EventContent,
  EventInput,
  JourneyEvent,
} from "@/modules/data-model/contracts"

export type EventDraft = EventContent & {
  planning: { startAt: string | null; endAt: string | null }
  transit: EventInput["transit"]
}

export function eventContent(event?: JourneyEvent): EventDraft {
  return {
    title: event?.title ?? "",
    body: event?.body ?? "",
    category: event?.category ?? "VISIT",
    date: event?.date ?? new Date().toLocaleDateString("en-CA"),
    time: event?.time ?? null,
    timeZone: event
      ? event.timeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: event?.location ?? null,
    planning: {
      startAt: event?.planning?.startAt ?? null,
      endAt: event?.planning?.endAt ?? null,
    },
    transit: event?.transit
      ? {
          fromName: event.transit.fromName,
          toName: event.transit.toName,
          transportMode: event.transit.transportMode,
          distanceMeters: event.transit.distanceMeters ?? null,
          ...(event.transit.fromEventId
            ? { fromEventId: event.transit.fromEventId }
            : {}),
          ...(event.transit.toEventId
            ? { toEventId: event.transit.toEventId }
            : {}),
        }
      : null,
  }
}

type EventDraftPatch = Partial<Omit<EventDraft, "planning">> & {
  planning?: Partial<EventDraft["planning"]>
}

export function eventContentPatch(
  draft: EventDraft,
  baseline: EventDraft
): EventDraftPatch {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    const previous = baseline[key as keyof EventDraft]
    if (JSON.stringify(value) === JSON.stringify(previous)) continue
    // Save only the edited nested fields so rereading a concurrent change does
    // not overwrite another author's time or transit facts.
    if ((key === "planning" || key === "transit") && value && previous) {
      patch[key] = Object.fromEntries(
        Object.entries(value).filter(
          ([field, next]) =>
            JSON.stringify(next) !==
            JSON.stringify((previous as Record<string, unknown>)[field])
        )
      )
    } else patch[key] = value
  }
  return patch as EventDraftPatch
}

export function eventLocalDateTime(
  instant: string | null | undefined,
  zone: string | null
) {
  if (!instant) return ""
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function eventTimeInstant(local: string, zone: string) {
  const provisional = new Date(`${local}:00Z`)
  const offset =
    new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(provisional)
      .find((part) => part.type === "timeZoneName")!
      .value.replace("GMT", "") || "Z"
  return new Date(`${local}:00${offset}`).toISOString()
}
