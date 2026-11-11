import { ArrowRight } from "lucide-react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { eventCardTimes, eventTransitDisplay } from "../event-card-display"

export default function TransitEventCard({ event }: { event: JourneyEvent }) {
  const { departure, arrival, arrivalDays } = eventCardTimes(event)
  const { mode, duration, distance } = eventTransitDisplay(event)
  if (!event.transit) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-journal-transit-muted">
        <strong className="font-editorial text-base text-journal-transit-ink">
          {mode}
        </strong>
        {[departure, duration].filter(Boolean).length > 0 && (
          <span className="tabular-nums">
            {[departure, duration].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    )
  }
  const from = event.transit.fromName
  const to = event.transit.toName
  const axisMeta = [duration, distance].filter(Boolean).join(" · ")
  return (
    <div className="journal-transit-route" aria-label={`${from}到${to}`}>
      <div className="journal-transit-endpoint">
        {departure && <div className="journal-transit-time">{departure}</div>}
        <div className="journal-transit-place" title={from}>
          {from}
        </div>
      </div>
      <div className="journal-transit-axis min-w-0">
        {axisMeta && <div className="truncate">{axisMeta}</div>}
        <div className="journal-transit-line" aria-hidden="true">
          <span />
          <i />
          <ArrowRight size={14} />
        </div>
      </div>
      <div className="journal-transit-endpoint">
        {arrival && (
          <div className="journal-transit-time">
            {arrival}
            {arrivalDays > 0 && (
              <span className="cards-transit-day-offset">+{arrivalDays}天</span>
            )}
          </div>
        )}
        <div className="journal-transit-place" title={to}>
          {to}
        </div>
      </div>
    </div>
  )
}
