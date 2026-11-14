import type { JourneyEvent } from "@/modules/data-model/contracts"
import type { RecordingStore } from "./recording-session"
export function createPhotoActions(store: RecordingStore, eventId: string) {
  function edit(
    transform: (entry: JourneyEvent) => {
      photos: JourneyEvent["photos"]
      coverAssetId: string | null
    }
  ) {
    return store.getState().mutate((journey) => {
      const result = transform(
        journey.events.find((entry) => entry.id === eventId)!
      )
      return {
        name: "photos.set",
        eventId,
        photos: result.photos.map(({ assetId, caption }) => ({
          assetId,
          caption,
        })),
        coverAssetId: result.coverAssetId,
      }
    })
  }
  return {
    reorder(from: number, to: number) {
      return edit((entry) => {
        const photos = [...entry.photos]
        const [moved] = photos.splice(from, 1)
        photos.splice(to, 0, moved)
        return { photos, coverAssetId: photos[0]?.assetId || null }
      })
    },
    cover(assetId: string) {
      return edit((entry) => ({
        photos: [
          entry.photos.find((photo) => photo.assetId === assetId)!,
          ...entry.photos.filter((photo) => photo.assetId !== assetId),
        ],
        coverAssetId: assetId,
      }))
    },
    remove(assetId: string) {
      return edit((entry) => {
        const photos = entry.photos.filter((photo) => photo.assetId !== assetId)
        return {
          photos,
          coverAssetId:
            photos.find((photo) => photo.isCover)?.assetId ??
            photos[0]?.assetId ??
            null,
        }
      })
    },
    move(assetId: string, toEventId: string) {
      return store
        .getState()
        .mutate((journey) => ({
          name: "photo.move",
          assetId,
          fromEventId: eventId,
          toEventId,
          afterAssetId:
            journey.events
              .find((entry) => entry.id === toEventId)
              ?.photos.at(-1)?.assetId || null,
        }))
    },
    location(assetId: string, location: JourneyEvent["location"]) {
      return store
        .getState()
        .mutate({ name: "photo.update", eventId, assetId, patch: { location } })
    },
    add(files: File[]) {
      store.getState().addFiles(eventId, files)
    },
    retry(id: string) {
      store.getState().retryUpload(id)
    },
    discard(id: string) {
      store.getState().discardUpload(id)
    },
  }
}
