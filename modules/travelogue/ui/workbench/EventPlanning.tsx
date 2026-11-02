import type { JourneyEvent } from "@/modules/data-model/contracts"
import {
  formatTransitDistance,
  formatTransitDuration,
  transitModeLabel,
} from "@/lib/journeys/display"

export default function EventPlanning({ event }: { event: JourneyEvent }) {
  const plan =
    event.transit?.routeState === "READY"
      ? event.transit.route?.plans[0]
      : undefined
  const duration = plan
    ? formatTransitDuration(plan.durationSeconds)
    : event.planning?.durationMinutes
      ? formatTransitDuration(event.planning.durationMinutes * 60)
      : null
  const facts = [
    duration,
    plan ? formatTransitDistance(plan.distanceMeters) : null,
    event.hotel?.startingPrice
      ? `${event.hotel.startingPrice.amount.toFixed(2)} ${event.hotel.startingPrice.currency} 起`
      : null,
  ].filter(Boolean)
  return (
    <>
      {facts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-journal-muted">
          {facts.map((fact, index) => (
            <span key={index}>{fact}</span>
          ))}
        </div>
      )}
      {event.category === "TRANSIT" && (
        <div className="mt-2 text-sm text-journal-muted">
          {plan?.label ??
            (event.transit?.routeState === "ROUTE_STALE"
              ? "路线待更新"
              : "尚未记录路线")}
        </div>
      )}
      <div className="journal-event-facts space-y-3 text-sm leading-6 text-journal-muted">
        {event.location?.address && <div>{event.location.address}</div>}
        {event.hotel?.address &&
          event.hotel.address !== event.location?.address && (
            <div>{event.hotel.address}</div>
          )}
        {event.executionStatus && (
          <div>
            {
              {
                PLANNED: "计划中",
                STARTED: "进行中",
                CONFIRMED: "已确认",
                SKIPPED: "已跳过",
                CANCELLED: "已取消",
              }[event.executionStatus]
            }
          </div>
        )}
        {plan && (
          <ol className="space-y-2" aria-label="交通路线明细">
            {plan.segments.map((segment) => (
              <li key={segment.id}>
                {transitModeLabel(segment.mode)}
                {segment.lineName ? ` · ${segment.lineName}` : ""}
                {(segment.fromName || segment.toName) && (
                  <div>
                    {segment.fromName || "出发地"} →{" "}
                    {segment.toName || "目的地"}
                  </div>
                )}
                <div>
                  {[
                    segment.durationSeconds
                      ? formatTransitDuration(segment.durationSeconds)
                      : null,
                    segment.distanceMeters
                      ? formatTransitDistance(segment.distanceMeters)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ol>
        )}
        {event.transit?.route?.warning && (
          <div>{event.transit.route.warning}</div>
        )}
        {event.transit?.notes && (
          <div className="whitespace-pre-wrap">{event.transit.notes}</div>
        )}
        {event.hotel?.checkInNote && <div>{event.hotel.checkInNote}</div>}
        {event.hotel?.externalUrl && (
          <a
            href={event.hotel.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-journal-accent underline"
          >
            查看酒店
          </a>
        )}
        {event.cuisine && <div>{event.cuisine}</div>}
        {event.bookingReference && (
          <div>预订信息：{event.bookingReference}</div>
        )}
      </div>
    </>
  )
}
