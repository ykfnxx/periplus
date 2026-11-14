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
import type { ReceiptExtraction } from "@/modules/data-model/contracts/receipts"
import type {
  JourneyMembers,
  JourneyInvitations,
  JourneyInvitationCreated,
  JourneyInvitationPreview,
} from "@/modules/data-model/contracts/collaboration"
import type { PhotoDto } from "@/types/photo"
import type { DraftContext, LocalDraft } from "./model/local-draft"

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

export interface RecordingApi {
  account(): Promise<{ userId: string }>
  atlas(): Promise<JourneyAtlas>
  list(): Promise<JourneySummary[]>
  get(id: string): Promise<JourneySnapshot>
  weather(id: string): Promise<JourneyWeatherResult>
  create(input: JourneyCreate): Promise<JourneyMutationResult>
  command(id: string, mutation: JourneyMutation): Promise<JourneyMutationResult>
  upload(file: File, uploadId: string): Promise<PhotoDto>
  extractReceipt(assetId: string): Promise<ReceiptExtraction>
  shareStatus(id: string): Promise<ShareStatus>
  sharePreview(
    id: string,
    includeCosts: boolean,
    signal?: AbortSignal
  ): Promise<SharePreview>
  publishShare(id: string, input: ShareWrite): Promise<ShareStatus>
  revokeShare(id: string, input: ShareRevoke): Promise<ShareStatus>
  members(id: string): Promise<JourneyMembers>
  invitations(id: string): Promise<JourneyInvitations>
  invite(id: string): Promise<JourneyInvitationCreated>
  revokeInvitation(id: string, invitationId: string): Promise<unknown>
  invitation(token: string): Promise<JourneyInvitationPreview>
  acceptInvitation(token: string): Promise<{ journeyId: string }>
}

export interface DraftStorage {
  get(id: string): Promise<LocalDraft | undefined>
  put(draft: LocalDraft): Promise<unknown>
  remove(id: string): Promise<undefined>
  list(userId: string): Promise<LocalDraft[]>
  context(userId?: string): Promise<DraftContext | undefined>
  activate(userId: string): Promise<unknown>
  remember(context: DraftContext): Promise<unknown>
}
