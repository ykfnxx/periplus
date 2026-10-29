import { ArrowRight } from "lucide-react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { eventCardTimes, eventTransitDisplay } from "../event-card-display"

export default function TransitEventCard({ event }: { event: JourneyEvent }) {
  const { departure, arrival } = eventCardTimes(event)
  const { mode, duration, distance, line } = eventTransitDisplay(event)
  // Endpoint names belong to the transit itself, independent of chain order.
  if (!event.transit)
    return (
      <div className="journal-transit-simple">
        <strong>{event.title || mode}</strong>
        {[departure, duration].filter(Boolean).length > 0 && (
          <span className="font-mono">
            {[departure, duration].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    )
  const from = event.transit.fromName
  const to = event.transit.toName
  return (
    <div className="journal-transit-route" aria-label={`${from}到${to}`}>
      <div className="min-w-0">
        {departure && <div className="journal-transit-time">{departure}</div>}
        <div className="journal-transit-place" title={from}>
          {from}
        </div>
      </div>
      <div className="journal-transit-axis min-w-0">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
          <span className="journal-transit-mode">{mode}</span>
          {(duration || distance) && (
            <span>{[duration, distance].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <div className="journal-transit-line" aria-hidden="true">
          <span />
          <i />
          <ArrowRight size={15} />
        </div>
        {line && (
          <div className="truncate" title={line}>
            {line}
          </div>
        )}
      </div>
      <div className="min-w-0 text-right">
        {arrival && <div className="journal-transit-time">{arrival}</div>}
        <div className="journal-transit-place" title={to}>
          {to}
        </div>
      </div>
    </div>
  )
}
