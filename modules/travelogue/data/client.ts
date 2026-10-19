import type {
  RecordingJourney,
  RecordingJourneySummary,
  RecordingJourneyCreate,
  RecordingMutation,
  RecordingMutationResult,
} from "@/modules/data-model/contracts/recording"
import type { PhotoDto } from "@/types/photo"

export class RecordingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = "RecordingApiError"
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new RecordingApiError(
      body?.error || "保存请求失败，请重试。",
      response.status,
      body?.code
    )
  }
  return body as T
}

export const recordingApi = {
  list: () => request<RecordingJourneySummary[]>("/api/journeys"),
  get: (id: string) =>
    request<RecordingJourney>(`/api/journeys/${encodeURIComponent(id)}`),
  create: (input: RecordingJourneyCreate) =>
    request<RecordingMutationResult>("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  command: (id: string, mutation: RecordingMutation) =>
    request<RecordingMutationResult>(
      `/api/journeys/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      }
    ),
  upload: (file: File, uploadId: string) => {
    const body = new FormData()
    body.set("file", file)
    body.set("uploadId", uploadId)
    return request<PhotoDto>("/api/photos", { method: "POST", body })
  },
}
export type RecordingApi = typeof recordingApi
