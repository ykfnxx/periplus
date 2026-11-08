import type {
  JourneyAtlas,
  JourneySnapshot,
  JourneySummary,
  JourneyCreate,
  JourneyMutation,
  JourneyMutationResult,
  JourneyWeatherResult,
  ShareStatus,
  SharePreview,
  ShareWrite,
  ShareRevoke,
} from "@/modules/data-model/contracts"
import { PHOTO_MAX_BYTES, PHOTO_SIZE_ERROR, type PhotoDto } from "@/types/photo"
import type { ReceiptExtraction } from "@/modules/data-model/contracts/receipts"
import type {
  JourneyMembers,
  JourneyInvitations,
  JourneyInvitationCreated,
  JourneyInvitationPreview,
} from "@/modules/data-model/contracts/collaboration"

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
  if (response.ok) return response.json()
  const body = await response.json().catch(() => null)
  throw new RecordingApiError(
    (
      {
        OCR_UNAVAILABLE: "账单识别暂时不可用，请稍后重试。",
        OCR_FAILED: "未能识别这张账单，可重试或换一张清晰图片。",
        STORAGE_UNAVAILABLE: "图片暂时无法保存，请重试。",
      } as Record<string, string>
    )[body?.code] ||
      body?.error ||
      (response.status === 413
        ? "上传内容过大，请减少文件大小后重试。"
        : response.status === 502
          ? "服务连接中断（HTTP 502），请稍后重试。"
          : "请求失败，请重试。"),
    response.status,
    body?.code
  )
}

export const recordingApi = {
  shareStatus: (id: string) =>
    request<ShareStatus>(`/api/journeys/${encodeURIComponent(id)}/share`),
  sharePreview: (id: string, includeCosts: boolean, signal?: AbortSignal) =>
    request<SharePreview>(
      `/api/journeys/${encodeURIComponent(id)}/share/preview?includeCosts=${includeCosts}`,
      { signal }
    ),
  publishShare: (id: string, input: ShareWrite) =>
    request<ShareStatus>(`/api/journeys/${encodeURIComponent(id)}/share`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  revokeShare: (id: string, input: ShareRevoke) =>
    request<ShareStatus>(`/api/journeys/${encodeURIComponent(id)}/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  account: () => request<{ userId: string }>("/api/drafts/account"),
  atlas: () => request<JourneyAtlas>("/api/journeys/map"),
  list: () => request<JourneySummary[]>("/api/journeys"),
  get: (id: string) =>
    request<JourneySnapshot>(`/api/journeys/${encodeURIComponent(id)}`),
  weather: (id: string) =>
    request<JourneyWeatherResult>(
      `/api/journeys/${encodeURIComponent(id)}/weather`,
      { method: "POST" }
    ),
  create: (input: JourneyCreate) =>
    request<JourneyMutationResult>("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  command: (id: string, mutation: JourneyMutation) =>
    request<JourneyMutationResult>(
      `/api/journeys/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      }
    ),
  upload: async (file: File, uploadId: string) => {
    if (file.size > PHOTO_MAX_BYTES)
      throw new RecordingApiError(PHOTO_SIZE_ERROR, 413, "FILE_TOO_LARGE")
    if (file.size === 0)
      throw new RecordingApiError(
        "图片文件为空，请重新选择。",
        400,
        "INVALID_INPUT"
      )
    const body = new FormData()
    body.set("file", file)
    body.set("uploadId", uploadId)
    return request<PhotoDto>("/api/photos", { method: "POST", body })
  },
  extractReceipt: (assetId: string) =>
    request<ReceiptExtraction>("/api/receipts/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    }),
  members: (id: string) =>
    request<JourneyMembers>(`/api/journeys/${encodeURIComponent(id)}/members`),
  invitations: (id: string) =>
    request<JourneyInvitations>(
      `/api/journeys/${encodeURIComponent(id)}/invitations`
    ),
  invite: (id: string) =>
    request<JourneyInvitationCreated>(
      `/api/journeys/${encodeURIComponent(id)}/invitations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }
    ),
  revokeInvitation: (id: string, invitationId: string) =>
    request<unknown>(
      `/api/journeys/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" }
    ),
  invitation: (token: string) =>
    request<JourneyInvitationPreview>(
      `/api/journey-invitations/${encodeURIComponent(token)}`
    ),
  acceptInvitation: (token: string) =>
    request<{ journeyId: string }>(
      `/api/journey-invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST" }
    ),
}
export type RecordingApi = typeof recordingApi
