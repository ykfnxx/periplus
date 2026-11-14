import type {
  EventLocation,
  JourneySnapshot,
  EventWeather,
} from "@/modules/data-model/contracts"
export interface UploadTask {
  id: string
  eventId: string
  file: File
  assetId?: string
  name: string
  status: "uploading" | "failed"
  error?: string
}

export type RecordUpload = Omit<UploadTask, "assetId">

export type JourneyOpenRequest = {
  eventId?: string
  add?: boolean
  location?: EventLocation
}

export interface PhotoActions {
  reorder(from: number, to: number): Promise<unknown>
  cover(assetId: string): Promise<unknown>
  remove(assetId: string): Promise<unknown>
  move(assetId: string, target: string): Promise<unknown>
  location(assetId: string, location: EventLocation | null): Promise<unknown>
  add(files: File[]): void
  retry(id: string): void
  discard(id: string): void
}

export interface RecordingSnapshot {
  journey: JourneySnapshot | null
  weather: Record<string, EventWeather | null>
  loading: boolean
  error: string | null
  conflict: boolean
  saving: number
  uploads: RecordUpload[]
}
export interface RecordingActions {
  load(): Promise<void>
  removeEvent(eventId: string): Promise<unknown>
  moveEvent(eventId: string, afterEventId: string | null): Promise<unknown>
  saveJourney(
    patch: Pick<JourneySnapshot, "title" | "description" | "status">
  ): Promise<unknown>
}
