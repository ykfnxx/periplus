"use client"

import type { JourneyEvent } from "@/modules/data-model/contracts"
import { Button } from "@/components/kumo/components/button/button"
import UserSource from "./UserSource"
import { ProviderImage } from "./ProviderImage"

export default function EventCover({
  event,
  title,
  onOpen,
}: {
  event: JourneyEvent
  title: string
  onOpen: (index: number) => void
}) {
  const coverIndex = Math.max(
    0,
    event.photos.findIndex((photo) => photo.isCover)
  )
  const photo = event.photos[coverIndex]
  const providerCover =
    event.hotel?.coverImageUrl ?? event.planning?.coverImageUrl
  if (!photo && !providerCover) return null
  return (
    <div className="journal-card-cover" data-photo-strip="">
      {photo ? (
        <Button
          variant="ghost"
          aria-label={`查看${title}的照片 ${coverIndex + 1}`}
          className="h-full! w-full! rounded-none! p-0!"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpen(coverIndex)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption || title}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        </Button>
      ) : (
        <ProviderImage
          src={providerCover!}
          alt={title}
          category={event.hotel ? "HOTEL" : "SIGHT"}
          width={640}
          height={320}
          className="h-full w-full object-cover"
        />
      )}
      {photo && photo.source.userId !== event.source.userId && (
        <UserSource user={photo.source} className="journal-card-cover-source" />
      )}
    </div>
  )
}
