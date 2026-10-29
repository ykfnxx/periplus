import { ArrowRight } from "lucide-react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import {
  eventCardTimes,
  eventCity,
  eventTransitDisplay,
} from "../event-card-display"

export default function TransitEventCard({
  event,
  origin,
  destination,
}: {
  event: JourneyEvent
  origin?: JourneyEvent
  destination?: JourneyEvent
}) {
  const { departure, arrival } = eventCardTimes(event)
  const { mode, duration, line } = eventTransitDisplay(event)
  // A manually written transit may not have endpoint facts. Keep it as a compact
  // record instead of inferring a journey edge from its neighbouring cards.
  if (!origin || !destination)
    return (
      <div className="journal-transit-simple">
        <span>{mode}</span>
        {[departure, duration].filter(Boolean).length > 0 && (
          <span className="font-mono">
            {[departure, duration].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    )
  const from = origin.location?.name || origin.title || "出发地"
  const to = destination.location?.name || destination.title || "目的地"
  const fromCity = eventCity(origin)
  const toCity = eventCity(destination)
  return (
    <div className="journal-transit-route" aria-label={`${from}到${to}`}>
      <div className="min-w-0">
        {departure && <div className="journal-transit-time">{departure}</div>}
        <div className="journal-transit-place" title={from}>
          {from}
        </div>
        {fromCity && fromCity !== from && (
          <div className="journal-transit-city">{fromCity}</div>
        )}
      </div>
      <div className="journal-transit-axis min-w-0">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
          <span className="journal-transit-mode">{mode}</span>
          {duration && <span>{duration}</span>}
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
        {toCity && toCity !== to && (
          <div className="journal-transit-city">{toCity}</div>
        )}
      </div>
    </div>
  )
}
