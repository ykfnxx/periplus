import type { JourneyEvent } from "@/modules/data-model/contracts"
import { eventInstantLabel } from "@/lib/journeys/calendar"
import {
  formatTransitDistance,
  formatTransitDuration,
  transitModeLabel,
} from "@/lib/journeys/display"
import { ProviderImage } from "./ProviderImage"

export default function EventPlanning({
  event,
  expanded = false,
}: {
  event: JourneyEvent
  expanded?: boolean
}) {
  const plan =
    event.transit?.routeState === "READY"
      ? event.transit.route?.plans[0]
      : undefined
  const duration = plan
    ? formatTransitDuration(plan.durationSeconds)
    : event.planning?.durationMinutes
      ? formatTransitDuration(event.planning.durationMinutes * 60)
      : null
  const cover = event.hotel?.coverImageUrl ?? event.planning?.coverImageUrl
  const facts = [
    event.time,
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
      {cover && event.photos.length === 0 && (
        <ProviderImage
          src={cover}
          alt={event.title}
          category={event.hotel ? "HOTEL" : "SIGHT"}
          width={640}
          height={320}
          className="mt-3 max-h-48 w-full rounded-xl object-cover"
        />
      )}
      {expanded && (
        <div className="mt-4 space-y-3 text-sm leading-6 text-journal-muted">
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
          {event.planning?.startAt && (
            <div>
              计划时间：
              {eventInstantLabel(event.planning.startAt, event.timeZone)}
              {event.planning.endAt
                ? ` — ${eventInstantLabel(event.planning.endAt, event.timeZone)}`
                : ""}
            </div>
          )}
          {event.actualStartAt && (
            <div>
              实际时间：{eventInstantLabel(event.actualStartAt, event.timeZone)}
              {event.actualEndAt
                ? ` — ${eventInstantLabel(event.actualEndAt, event.timeZone)}`
                : ""}
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
      )}
    </>
  )
}
