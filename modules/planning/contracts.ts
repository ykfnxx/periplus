import { z } from "zod"
import { eventInputSchema } from "@/modules/data-model/contracts/commands"
import {
  eventDateSchema,
  type JourneyEvent,
} from "@/modules/data-model/contracts/event"

const id = z.string().min(1).max(200)
export const planningReferenceSchema = z.union([
  id,
  z.object({ draftRef: id }).strict(),
])
const transit = eventInputSchema.shape.transit
  .unwrap()
  .unwrap()
  .extend({
    fromEventId: planningReferenceSchema.optional(),
    toEventId: planningReferenceSchema.optional(),
  })
  .nullable()
  .optional()
export const planningFieldsSchema = eventInputSchema
  .pick({
    title: true,
    body: true,
    category: true,
    date: true,
    time: true,
    timeZone: true,
    startAt: true,
    endAt: true,
    location: true,
    planning: true,
  })
  .extend({ transit })
  .strict()
export const planningOperationSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("event.add"),
      afterEventId: planningReferenceSchema.nullable(),
      content: planningFieldsSchema.extend({
        date: eventDateSchema,
        category: z.enum(["VISIT", "MEAL", "STAY", "TRANSIT"]),
      }),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.update"),
      eventId: planningReferenceSchema,
      patch: planningFieldsSchema.refine(
        (value) => Object.keys(value).length > 0
      ),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.move"),
      eventId: planningReferenceSchema,
      afterEventId: planningReferenceSchema.nullable(),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.remove"),
      eventId: planningReferenceSchema,
    })
    .strict(),
])
export const planningEditSchema = z
  .object({
    draftRef: id.optional(),
    command: planningOperationSchema,
  })
  .strict()
  .refine(
    (value) => (value.command.name === "event.add") === Boolean(value.draftRef),
    "Only additions require a draftRef"
  )
export type PlanningEdit = z.infer<typeof planningEditSchema>
export type PlanningReference = z.infer<typeof planningReferenceSchema>
export const createProposalSchema = z
  .object({ requestId: id, message: z.string().trim().min(1).max(10000) })
  .strict()
export const proposalTurnSchema = createProposalSchema
  .extend({
    parentVersion: z.number().int().nonnegative(),
    replyToRunId: id.optional(),
    choiceRef: id.optional(),
    mode: z.literal("rebase").optional(),
  })
  .strict()
export const proposalVersionRequestSchema = z
  .object({ version: z.number().int().nonnegative() })
  .strict()
export type CreateProposalRequest = z.infer<typeof createProposalSchema>
export type ProposalTurnRequest = z.infer<typeof proposalTurnSchema>
export type PlanningMode = "adjust" | "rebase"
export type PlanningRunStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "QUESTION"
  | "CANCELLED"
  | "TIMED_OUT"
  | "FAILED"
export interface PlanningRunView {
  runId: string
  parentVersion: number
  targetRevision: number
  mode: PlanningMode
  status: PlanningRunStatus
  deadline: string
  error: PlanningApiError | null
  progress: string | null
}
// Place choices reuse candidateRef as choiceRef; stored labels remain neutral.
export interface PlanningQuestion {
  runId: string
  message: string
  choices: { choiceRef: string; label: string }[]
}
export interface PlanningConstraint {
  id: string
  text: string
  hard: boolean
  satisfied: boolean | null
  verificationRequired: boolean
}
export type PlanningEventSummary = Pick<
  JourneyEvent,
  | "id"
  | "title"
  | "body"
  | "category"
  | "date"
  | "time"
  | "timeZone"
  | "startAt"
  | "endAt"
  | "location"
  | "planning"
  | "transit"
  | "canEdit"
  | "canRemove"
> & {
  photoCount: number
  receiptCount: number
  hasBooking: boolean
  protected: boolean
}
export interface PlanningDiffEntry {
  eventId: string
  kind: "added" | "updated" | "moved" | "removed"
  before: PlanningEventSummary | null
  after: PlanningEventSummary | null
  changedFields: string[]
  impacts: {
    photos: number
    receipts: number
    hotelCleared: boolean
    providerBindingCleared: boolean
    routeInvalidated: boolean
    linkedTransitIds: string[]
  }
}
export interface PlanningPreview {
  version: number
  baseRevision: number
  events: PlanningEventSummary[]
  delta: PlanningDiffEntry[]
  committableDiff: PlanningDiffEntry[]
  constraints: PlanningConstraint[]
  unverified: string[]
  blockers: string[]
  canApply: boolean
}
export interface PlanningApplyReceipt {
  proposalId: string
  version: number
  journeyId: string
  appliedRevision: number
  replayed: boolean
}
export interface PlanningStarted {
  proposalId: string
  runId: string
  parentVersion: number
}
export interface PlanningLivePlace {
  candidateRef: string
  name: string
  city?: string
  address?: string
  coordinates?: {
    lat: number
    lng: number
    coordinateSystem: "GCJ02" | "WGS84" | "BD09"
  }
}
export interface PlanningProposalView {
  proposalId: string
  journeyId: string
  status: "OPEN" | "APPLIED" | "DISCARDED"
  latestVersion: number
  baseRevision: number
  currentJourneyRevision: number
  run: PlanningRunView | null
  question: PlanningQuestion | null
  preview: PlanningPreview | null
  receipt: PlanningApplyReceipt | null
  livePlaces: PlanningLivePlace[]
}
export const PLANNING_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN",
  "IDEMPOTENCY_CONFLICT",
  "RUN_ACTIVE",
  "PROPOSAL_VERSION_CONFLICT",
  "PROPOSAL_CLOSED",
  "REVISION_CONFLICT",
  "PREVIEW_REQUIRED",
  "EMPTY_DIFF",
  "RUNTIME_UNAVAILABLE",
  "RUN_FAILED",
] as const
export interface PlanningApiError {
  error: string
  code: (typeof PLANNING_ERROR_CODES)[number]
}
