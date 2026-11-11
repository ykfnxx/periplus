import type {
  PlanningDiffEntry,
  PlanningEventSummary,
  PlanningPreview as Preview,
} from "../contracts"
import {
  eventCardTimes,
  eventCardTitle,
  eventCategoryLabels,
  eventTransitDisplay,
} from "@/modules/travelogue/ui/event-card-display"

const kinds = { added: "新增", updated: "修改", moved: "移动", removed: "移除" }
const requestModes = { DRIVE: "驾车", WALK: "步行", TRANSIT: "公共交通" }
const preferences = {
  RECOMMENDED: "推荐路线",
  FASTEST: "用时最短",
  LOW_COST: "费用较低",
  FEWER_TRANSFERS: "少换乘",
  LESS_WALKING: "少步行",
}

function EventFacts({ event }: { event: PlanningEventSummary }) {
  const clock = eventCardTimes(event).range
  const transit = eventTransitDisplay(event)
  return (
    <div className="min-w-0 space-y-2 text-sm leading-6">
      <p className="font-medium break-words">{eventCardTitle(event)}</p>
      <p className="text-journal-muted">
        {eventCategoryLabels[event.category]} · {event.date}
        {clock ? ` · ${clock}` : ""}
        {event.timeZone ? ` · ${event.timeZone}` : ""}
      </p>
      {event.location && (
        <div className="break-words">
          <p>{event.location.name}</p>
          {event.location.address && (
            <p className="text-journal-muted">{event.location.address}</p>
          )}
          {event.location.coordinates && (
            <p className="text-journal-muted">
              经度 {event.location.coordinates.lng}，纬度{" "}
              {event.location.coordinates.lat}
            </p>
          )}
        </div>
      )}
      {event.transit && (
        <div>
          <p className="break-words">
            {event.transit.fromName} → {event.transit.toName}
          </p>
          <p>
            {[transit.mode, transit.duration, transit.distance]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {event.transit.requestMode && (
            <p>路线查询：{requestModes[event.transit.requestMode]}</p>
          )}
          {event.transit.preference && (
            <p>路线偏好：{preferences[event.transit.preference]}</p>
          )}
          <p className="text-journal-muted">
            {event.transit.routeState === "READY"
              ? "已有路线"
              : event.transit.routeState === "ROUTE_STALE"
                ? "原路线已失效"
                : "路线尚未查询"}
          </p>
          {event.transit.notes && (
            <p className="break-words whitespace-pre-wrap">
              {event.transit.notes}
            </p>
          )}
        </div>
      )}
      {event.planning?.durationMinutes !== undefined && (
        <p>停留 {event.planning.durationMinutes} 分钟</p>
      )}
      {event.body && (
        <details>
          <summary className="cursor-pointer text-journal-muted">正文</summary>
          <p className="mt-2 max-h-64 overflow-y-auto break-words whitespace-pre-wrap">
            {event.body}
          </p>
        </details>
      )}
      {(event.photoCount > 0 ||
        event.receiptCount > 0 ||
        event.hasBooking ||
        event.protected) && (
        <p className="text-journal-muted">
          {[
            event.photoCount > 0 && `${event.photoCount} 张照片`,
            event.receiptCount > 0 && `${event.receiptCount} 张账单`,
            event.hasBooking && "有预订信息",
            event.protected && "受保护记录",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  )
}

function Changes({ entries }: { entries: PlanningDiffEntry[] }) {
  return (
    <ol className="divide-y divide-journal-paper-line">
      {entries.map((entry, index) => {
        const impacts = entry.impacts
        return (
          <li
            key={`${entry.eventId}:${entry.kind}:${index}`}
            className="py-5 first:pt-0"
          >
            <h3
              className={`mb-3 text-sm font-semibold ${entry.kind === "removed" ? "text-coral" : "text-action"}`}
            >
              {kinds[entry.kind]} ·{" "}
              {eventCardTitle((entry.after || entry.before)!)}
            </h3>
            <div
              className={`grid gap-4 ${entry.before && entry.after ? "sm:grid-cols-2" : ""}`}
            >
              {entry.before && (
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium text-journal-muted">
                    原内容
                  </p>
                  <EventFacts event={entry.before} />
                </div>
              )}
              {entry.after && (
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium text-journal-muted">
                    应用后
                  </p>
                  <EventFacts event={entry.after} />
                </div>
              )}
            </div>
            {(impacts.photos > 0 ||
              impacts.receipts > 0 ||
              impacts.hotelCleared ||
              impacts.providerBindingCleared ||
              impacts.routeInvalidated ||
              impacts.linkedTransitIds.length > 0) && (
              <ul
                className="mt-4 space-y-1 text-sm leading-6 text-coral"
                aria-label="关联影响"
              >
                {(impacts.photos > 0 || impacts.receipts > 0) && (
                  <li>
                    {entry.kind === "removed" ? "将随事件移除" : "涉及"}：
                    {[
                      impacts.photos > 0 && `${impacts.photos} 张照片`,
                      impacts.receipts > 0 && `${impacts.receipts} 张账单`,
                    ]
                      .filter(Boolean)
                      .join("、")}
                  </li>
                )}
                {impacts.hotelCleared && <li>将清除原酒店资料</li>}
                {impacts.providerBindingCleared && <li>将解除原地点关联</li>}
                {impacts.routeInvalidated && (
                  <li>原交通路线将失效，需重新查询</li>
                )}
                {impacts.linkedTransitIds.length > 0 && (
                  <li>
                    影响 {impacts.linkedTransitIds.length}{" "}
                    条关联交通，请核对处理结果
                  </li>
                )}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function PlanningPreview({ preview }: { preview: Preview }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          第 {preview.version} 版 · 待应用变更
        </h2>
        <p className="mt-2 text-sm leading-6 text-journal-muted">
          基于旅程修订 {preview.baseRevision}，确认应用前不会改动正式记录。
        </p>
      </div>
      {preview.blockers.length > 0 && (
        <section
          aria-label="应用阻塞"
          className="space-y-2 text-sm leading-6 text-coral"
        >
          <h3 className="font-semibold">需要先解决</h3>
          <ul className="list-inside list-disc">
            {preview.blockers.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {preview.committableDiff.length ? (
        <Changes entries={preview.committableDiff} />
      ) : (
        <p className="text-sm text-journal-muted">
          当前没有需要应用的事件变更。
        </p>
      )}
      {preview.version > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            本轮相对上一版的调整（{preview.delta.length} 项）
          </summary>
          <div className="pt-5">
            {preview.delta.length ? (
              <Changes entries={preview.delta} />
            ) : (
              <p className="text-journal-muted">本轮未改变事件内容。</p>
            )}
          </div>
        </details>
      )}
      {preview.constraints.length > 0 && (
        <section className="text-sm leading-6">
          <h3 className="mb-2 font-semibold">行程要求</h3>
          <ul className="space-y-2">
            {preview.constraints.map((item) => (
              <li key={item.id}>
                {item.text}
                <span
                  className={`ml-2 ${item.satisfied === false ? "text-coral" : "text-journal-muted"}`}
                >
                  {item.satisfied === true
                    ? "已满足"
                    : item.satisfied === false
                      ? "未满足"
                      : "待核实"}
                  {item.hard ? " · 必须满足" : ""}
                  {item.verificationRequired && item.satisfied !== true
                    ? " · 需验证"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.unverified.length > 0 && (
        <section className="text-sm leading-6">
          <h3 className="mb-2 font-semibold">尚未核实</h3>
          <ul className="list-inside list-disc text-journal-muted">
            {preview.unverified.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          应用后的事件顺序（{preview.events.length} 项）
        </summary>
        <ol className="mt-4 space-y-3">
          {preview.events.map((event, index) => (
            <li key={event.id} className="flex gap-3">
              <span className="shrink-0 text-journal-muted tabular-nums">
                {index + 1}.
              </span>
              <span className="break-words">
                {eventCardTitle(event)}
                <span className="ml-2 text-journal-muted">
                  {event.date} {eventCardTimes(event).range}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
