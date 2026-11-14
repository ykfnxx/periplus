import { Fragment } from "react"
import { cn } from "@/components/kumo/utils/cn"
import {
  ArrowRight,
  CalendarDays,
  ChevronUp,
  Clock3,
  ImageIcon,
  MapPin,
  TrainFront,
} from "lucide-react"
import type { SharedJourney } from "@/modules/data-model/contracts/sharing"
import { eventCategoryLabels } from "../../model/event-card-display"
import { dateLabel } from "../formatting/display"
import EventWeather from "../events/EventWeather"
import ShareGallery, {
  SharePhoto,
  type ShareGalleryPhoto,
} from "./ShareGallery"
import "./sharing.css"

export default function SharedJourneyDocument({
  document,
  photoUrls,
  preview = false,
}: {
  document: SharedJourney
  photoUrls: Record<string, string>
  preview?: boolean
}) {
  const photos: ShareGalleryPhoto[] = document.events.flatMap((event) =>
    event.photos.map((photo) => ({
      id: `${event.id}:${photo.assetId}`,
      url: photoUrls[photo.assetId],
      caption: photo.caption,
      author: photo.author,
      alt:
        photo.caption ||
        `${event.title || eventCategoryLabels[event.category]}的照片`,
    }))
  )
  const indices = new Map(photos.map((photo, index) => [photo.id, index]))
  const days = new Map<string, string>()
  for (const event of document.events)
    if (!days.has(event.date)) days.set(event.date, event.id)
  const title = document.title.split("·")
  const weather = document.events.some((event) => event.weather)
  function figure(
    eventId: string,
    photo: SharedJourney["events"][number]["photos"][number]
  ) {
    const index = indices.get(`${eventId}:${photo.assetId}`)!
    return (
      <figure key={photo.assetId}>
        <SharePhoto
          photo={photos[index]}
          index={index}
          priority={index === 0}
        />
        {(photo.caption || photo.author) && (
          <figcaption className="share-photo-credit">
            {photo.caption && <span>{photo.caption}</span>}
            <span>
              <ImageIcon size={14} aria-hidden="true" /> 照片 · {photo.author}
            </span>
          </figcaption>
        )}
      </figure>
    )
  }
  return (
    <ShareGallery photos={photos}>
      <article
        className={cn("share-doc", preview && "share-preview")}
        aria-label={`${document.title} 分享长页`}
      >
        <header className="share-brand-row">
          <span className="share-brand">Periplus</span>
          <span>
            {document.authors.join("、")}
            {document.authors.length ? "的游记" : ""}
          </span>
        </header>
        <div className="share-opening" id="journey-heading">
          <h1>
            {title.length === 2 ? (
              <>
                {title[0].trim()} ·<br />
                {title[1].trim()}
              </>
            ) : (
              document.title
            )}
          </h1>
          <div>
            {document.description && (
              <p className="share-intro">{document.description}</p>
            )}
            <div className="share-byline">
              {document.events[0] && (
                <span>
                  <CalendarDays size={16} aria-hidden="true" />
                  {document.events[0].date.slice(0, 7).replace("-", "年")}月
                </span>
              )}
              {!!document.cities.length && (
                <span>
                  <MapPin size={16} aria-hidden="true" />
                  {document.cities.join(" · ")}
                </span>
              )}
              <span>记录 · {document.authors.join("、")}</span>
            </div>
          </div>
        </div>
        {!!days.size && (
          <nav className="share-days" aria-label="按日期跳转">
            <div>
              {[...days].map(([date, first]) => (
                <a key={date} href={`#day-${first}`}>
                  {dateLabel(date)}
                </a>
              ))}
            </div>
            <a href="#journey-heading" aria-label="回到页首">
              <ChevronUp size={18} />
            </a>
          </nav>
        )}
        <div className="share-story">
          {document.events.map((event, position) => {
            const transport = event.transit
            return (
              <Fragment key={event.id}>
                {document.events[position - 1]?.date !== event.date && (
                  <h2 className="share-day-heading" id={`day-${event.id}`}>
                    {dateLabel(event.date)}
                    <span>
                      {new Intl.DateTimeFormat("zh-CN", {
                        weekday: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${event.date}T00:00:00Z`))}
                    </span>
                  </h2>
                )}
                {transport ? (
                  <article
                    className="share-event share-transit"
                    aria-label={`${transport.mode}：${transport.fromName}到${transport.toName}`}
                  >
                    <div className="share-transit-main">
                      <div>
                        <div className="share-clock">{transport.departure}</div>
                        <h3>{transport.fromName}</h3>
                      </div>
                      <div className="share-route">
                        <span>
                          <TrainFront size={16} aria-hidden="true" />
                          {transport.mode}
                        </span>
                        {transport.duration && (
                          <span>{transport.duration}</span>
                        )}
                        {transport.distance && (
                          <span>{transport.distance}</span>
                        )}
                        <div>
                          <ArrowRight size={17} />
                        </div>
                        {transport.line && <span>{transport.line}</span>}
                      </div>
                      <div className="share-transit-end">
                        <div className="share-clock">{transport.arrival}</div>
                        <h3>{transport.toName}</h3>
                      </div>
                    </div>
                    {!!event.photos.length && (
                      <div className="share-transit-photos">
                        {event.photos.map((photo) => figure(event.id, photo))}
                      </div>
                    )}
                    {transport.note && (
                      <p className="share-transit-note">{transport.note}</p>
                    )}
                    {event.body && <p className="share-body">{event.body}</p>}
                    {!!event.costs.length && (
                      <div className="share-cost">
                        <span>花费</span>
                        <strong>{event.costs.join(" · ")}</strong>
                      </div>
                    )}
                    <p className="share-source">记录 · {event.author}</p>
                  </article>
                ) : (
                  <article
                    className={cn(
                      "share-event",
                      `share-${event.category.toLowerCase()}`,
                      event.photos.length > 0 && "share-has-photos"
                    )}
                    id={`event-${event.id}`}
                  >
                    {!!event.photos.length && (
                      <div
                        className={cn(
                          "share-event-media",
                          event.photos.length > 1 && "share-multi-photo"
                        )}
                      >
                        {event.photos.map((photo) => figure(event.id, photo))}
                      </div>
                    )}
                    <div className="share-event-reading">
                      <h3>
                        {event.title || eventCategoryLabels[event.category]}
                      </h3>
                      <div className="share-event-meta">
                        {event.location && (
                          <span>
                            <MapPin size={15} aria-hidden="true" />
                            {event.location}
                          </span>
                        )}
                        {event.timeLabel && (
                          <span>
                            <Clock3 size={15} aria-hidden="true" />
                            {event.timeLabel}
                          </span>
                        )}
                        <EventWeather weather={event.weather} />
                      </div>
                      {event.body && <p className="share-body">{event.body}</p>}
                      {!!event.costs.length && (
                        <div className="share-cost">
                          <span>花费</span>
                          <strong>{event.costs.join(" · ")}</strong>
                        </div>
                      )}
                      <p className="share-source">记录 · {event.author}</p>
                    </div>
                  </article>
                )}
              </Fragment>
            )
          })}
        </div>
        <footer className="share-footer">
          <div>
            记录 · {document.authors.join("、")}
            {weather && (
              <p>
                天气数据：
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open-Meteo
                </a>{" "}
                ·{" "}
                <a
                  href="https://open-meteo.com/en/licence"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY 4.0
                </a>
              </p>
            )}
          </div>
          <div>
            Periplus
            <br />
            旅程里的片刻
          </div>
        </footer>
      </article>
    </ShareGallery>
  )
}
