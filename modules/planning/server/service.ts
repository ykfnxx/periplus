import { isDeepStrictEqual } from "node:util"
import { randomUUID } from "node:crypto"
import type { Prisma, PlanningProposal, PlanningRun } from "@prisma/client"
import { prisma } from "@/modules/data/db/prisma"
import {
  journeySnapshotSchema,
  type JourneySnapshot,
} from "@/modules/data-model/contracts"
import {
  presentJourney,
  writeJourneyRevision,
} from "@/modules/data/journeys/journey-repository"
import { journeyReadScope } from "@/modules/data/journeys/recording-access"
import { type AuthContext } from "@/modules/auth/server/context"
import {
  createProposalSchema,
  proposalTurnSchema,
  proposalVersionRequestSchema,
  type PlanningStarted,
  type PlanningProposalView,
  type PlanningApplyReceipt,
  type PlanningRunView,
  type PlanningEdit,
  type PlanningConstraint,
  type PlanningPreview,
  type PlanningMode,
  type PlanningQuestion,
  type PlanningLivePlace,
} from "../contracts"
import type {
  PlanningRuntime,
  PlanningRunInput,
  PlanningFieldSource,
  PlanningProviderFact,
} from "./runtime-contract"
import { PlanningError } from "./errors"
import {
  businessEvents,
  planningDiff,
  rebaseConflicts,
  reducePlanningOperations,
  summarizePlanningEvent,
} from "./preview"
import { validateFieldSources, validateRuntimeResult } from "./validation"
type Tx = Prisma.TransactionClient
const json = (v: unknown) => JSON.stringify(v)
const decode = <T>(s: string): T => JSON.parse(s)
const active = new Map<
  string,
  {
    controller: AbortController
    progress: string | null
    livePlaces: PlanningLivePlace[]
  }
>()
const placesByRun = new Map<
  string,
  { expiresAt: number; places: PlanningLivePlace[] }
>()
const unavailable: Pick<PlanningRuntime, "canRetain"> = {
  canRetain: () => false,
}
async function accessibleJourney(tx: Tx, context: AuthContext, id: string) {
  const user = await tx.user.findUnique({
    where: { id: context.userId },
    select: { banned: true, role: true },
  })
  if (
    !user ||
    user.banned ||
    (context.role === "admin" && user.role !== "admin")
  )
    throw new PlanningError("NOT_FOUND", "Journey not found", 404)
  const row = await tx.journey.findFirst({
    where: { id, deletedAt: null, ...journeyReadScope(context) },
  })
  if (!row) throw new PlanningError("NOT_FOUND", "Journey not found", 404)
  return presentJourney(
    context,
    journeySnapshotSchema.parse(JSON.parse(row.snapshotJson)),
    tx
  )
}
async function revision(tx: Tx, journeyId: string, number: number) {
  const row = await tx.journeyRevision.findUniqueOrThrow({
    where: { journeyId_revision: { journeyId, revision: number } },
  })
  return journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
}
async function expireRun(tx: Tx, p: PlanningProposal) {
  if (!p.activeRunId) return
  const run = await tx.planningRun.findUniqueOrThrow({
    where: { id: p.activeRunId },
  })
  if (run.deadline.getTime() > Date.now()) return
  await tx.planningRun.update({
    where: { id: run.id },
    data: { status: "TIMED_OUT" },
  })
  await tx.planningProposal.update({
    where: { id: p.id },
    data: { activeRunId: null },
  })
  p.activeRunId = null
  active.get(run.id)?.controller.abort()
}
async function withProposal<T>(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  fn: (
    tx: Tx,
    proposal: PlanningProposal,
    journey: JourneySnapshot
  ) => Promise<T>
) {
  return prisma.$transaction(
    async (tx) => {
      // All proposal operations use proposal -> Journey -> asset lock order.
      await tx.$queryRaw`SELECT "id" FROM "PlanningProposal" WHERE "id" = ${proposalId} FOR UPDATE`
      const p = await tx.planningProposal.findFirst({
        where: { id: proposalId, userId: context.userId, journeyId },
      })
      if (!p) throw new PlanningError("NOT_FOUND", "Proposal not found", 404)
      await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${journeyId} FOR UPDATE`
      const journey = await accessibleJourney(tx, context, journeyId)
      await expireRun(tx, p)
      return fn(tx, p, journey)
    },
    { timeout: 15000 }
  )
}
function requireOpen(p: PlanningProposal) {
  if (p.status !== "OPEN")
    throw new PlanningError("PROPOSAL_CLOSED", "Proposal is closed", 409)
}
function requireVersion(p: PlanningProposal, version: number) {
  if (p.latestVersion !== version)
    throw new PlanningError(
      "PROPOSAL_VERSION_CONFLICT",
      "Proposal version changed",
      409
    )
}
async function latestVersion(tx: Tx, p: PlanningProposal) {
  return p.latestVersion
    ? tx.planningVersion.findUniqueOrThrow({
        where: {
          proposalId_version: { proposalId: p.id, version: p.latestVersion },
        },
      })
    : null
}
async function newRun(
  tx: Tx,
  p: Pick<PlanningProposal, "id" | "latestVersion">,
  requestId: string,
  input: unknown,
  targetRevision: number,
  mode: PlanningMode
) {
  const run = await tx.planningRun.create({
    data: {
      id: randomUUID(),
      proposalId: p.id,
      requestId,
      signature: json(input),
      inputJson: json(input),
      parentVersion: p.latestVersion,
      targetRevision,
      mode,
      deadline: new Date(Date.now() + 120000),
    },
  })
  await tx.planningProposal.update({
    where: { id: p.id },
    data: { activeRunId: run.id, latestRunId: run.id },
  })
  return { proposalId: p.id, runId: run.id, parentVersion: run.parentVersion }
}
export async function createPlanningProposal(
  context: AuthContext,
  journeyId: string,
  input: unknown
): Promise<PlanningStarted> {
  const request = createProposalSchema.parse(input)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${journeyId} FOR UPDATE`
    const journey = await accessibleJourney(tx, context, journeyId)
    const old = await tx.planningProposal.findUnique({
      where: {
        userId_journeyId_requestId: {
          userId: context.userId,
          journeyId,
          requestId: request.requestId,
        },
      },
    })
    if (old) {
      if (old.signature !== json(request))
        throw new PlanningError(
          "IDEMPOTENCY_CONFLICT",
          "Request ID has a different payload",
          409
        )
      const run = await tx.planningRun.findUniqueOrThrow({
        where: {
          proposalId_requestId: {
            proposalId: old.id,
            requestId: request.requestId,
          },
        },
      })
      return { proposalId: old.id, runId: run.id, parentVersion: 0 }
    }
    const id = randomUUID()
    const p = await tx.planningProposal.create({
      data: {
        id,
        userId: context.userId,
        journeyId,
        requestId: request.requestId,
        signature: json(request),
        baseRevision: journey.revision,
        latestRunId: "",
      },
    })
    return newRun(tx, p, request.requestId, request, journey.revision, "adjust")
  })
}
export async function startPlanningTurn(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  input: unknown
): Promise<PlanningStarted> {
  const request = proposalTurnSchema.parse(input)
  return withProposal(
    context,
    journeyId,
    proposalId,
    async (tx, p, journey) => {
      const old = await tx.planningRun.findUnique({
        where: {
          proposalId_requestId: { proposalId, requestId: request.requestId },
        },
      })
      if (old) {
        if (old.signature !== json(request))
          throw new PlanningError(
            "IDEMPOTENCY_CONFLICT",
            "Request ID has a different payload",
            409
          )
        return { proposalId, runId: old.id, parentVersion: old.parentVersion }
      }
      requireOpen(p)
      requireVersion(p, request.parentVersion)
      if (p.activeRunId)
        throw new PlanningError("RUN_ACTIVE", "A planning turn is active", 409)
      let mode: PlanningMode = request.mode ?? "adjust"
      let targetRevision = mode === "rebase" ? journey.revision : p.baseRevision
      if (
        p.questionRunId &&
        (request.mode !== "rebase" || request.replyToRunId)
      ) {
        if (request.replyToRunId !== p.questionRunId)
          throw new PlanningError(
            "INVALID_INPUT",
            "Reply to the current question",
            400
          )
        const questionRun = await tx.planningRun.findUniqueOrThrow({
          where: { id: p.questionRunId },
        })
        const question = decode<PlanningQuestion>(questionRun.questionJson!)
        if (
          request.choiceRef &&
          !question.choices.some((c) => c.choiceRef === request.choiceRef)
        )
          throw new PlanningError(
            "INVALID_INPUT",
            "Choice does not belong to this question",
            400
          )
        mode = questionRun.mode as PlanningMode
        targetRevision =
          mode === "rebase" ? journey.revision : questionRun.targetRevision
      } else if (request.replyToRunId || request.choiceRef)
        throw new PlanningError(
          "INVALID_INPUT",
          "Question is no longer current",
          400
        )
      if (mode === "adjust" && targetRevision !== journey.revision)
        throw new PlanningError(
          "REVISION_CONFLICT",
          "Journey changed; rebase before continuing",
          409
        )
      return newRun(tx, p, request.requestId, request, targetRevision, mode)
    }
  )
}
function runView(run: PlanningRun): PlanningRunView {
  return {
    runId: run.id,
    parentVersion: run.parentVersion,
    targetRevision: run.targetRevision,
    mode: run.mode as PlanningMode,
    status: run.status as PlanningRunView["status"],
    deadline: run.deadline.toISOString(),
    error: run.errorJson ? JSON.parse(run.errorJson) : null,
    progress: active.get(run.id)?.progress ?? null,
  }
}
export async function getPlanningProposal(
  context: AuthContext,
  journeyId: string,
  proposalId: string
): Promise<PlanningProposalView> {
  return withProposal(
    context,
    journeyId,
    proposalId,
    async (tx, p, journey) => {
      const version = await latestVersion(tx, p)
      const run = await tx.planningRun.findUniqueOrThrow({
        where: { id: p.latestRunId },
      })
      const receipt = await tx.planningReceipt.findUnique({
        where: { proposalId },
      })
      const questionRun = p.questionRunId
        ? await tx.planningRun.findUniqueOrThrow({
            where: { id: p.questionRunId },
          })
        : null
      return {
        proposalId,
        journeyId,
        status: p.status as PlanningProposalView["status"],
        latestVersion: p.latestVersion,
        baseRevision: p.baseRevision,
        currentJourneyRevision: journey.revision,
        run: runView(run),
        question: questionRun?.questionJson
          ? JSON.parse(questionRun.questionJson)
          : null,
        preview: version
          ? {
              ...JSON.parse(version.previewJson),
              canApply:
                p.status === "OPEN" &&
                !p.activeRunId &&
                !p.questionRunId &&
                journey.revision === version.baseRevision &&
                decode<PlanningPreview>(version.previewJson).canApply,
            }
          : null,
        receipt: receipt
          ? {
              proposalId,
              journeyId,
              version: receipt.version,
              appliedRevision: receipt.appliedRevision,
              replayed: false,
            }
          : null,
        livePlaces:
          active.get(run.id)?.livePlaces ??
          (Date.now() < (placesByRun.get(run.id)?.expiresAt ?? 0)
            ? placesByRun.get(run.id)!.places
            : []),
      }
    }
  )
}
export async function cancelPlanningRun(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  runId: string
): Promise<PlanningRunView> {
  const result = await withProposal(
    context,
    journeyId,
    proposalId,
    async (tx, p) => {
      const run = await tx.planningRun.findFirst({
        where: { id: runId, proposalId },
      })
      if (!run) throw new PlanningError("NOT_FOUND", "Run not found", 404)
      if (run.status !== "RUNNING") return runView(run)
      const stopped = await tx.planningRun.update({
        where: { id: runId },
        data: { status: "CANCELLED" },
      })
      if (p.activeRunId === runId)
        await tx.planningProposal.update({
          where: { id: proposalId },
          data: { activeRunId: null },
        })
      return runView(stopped)
    }
  )
  active.get(runId)?.controller.abort()
  return result
}
export async function discardPlanningProposal(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  input: unknown
) {
  const request = proposalVersionRequestSchema.parse(input)
  const runId = await withProposal(
    context,
    journeyId,
    proposalId,
    async (tx, p) => {
      requireVersion(p, request.version)
      if (p.status === "DISCARDED") return null
      requireOpen(p)
      if (p.activeRunId)
        await tx.planningRun.update({
          where: { id: p.activeRunId },
          data: { status: "CANCELLED" },
        })
      await tx.planningProposal.update({
        where: { id: p.id },
        data: { status: "DISCARDED", activeRunId: null, questionRunId: null },
      })
      return p.activeRunId
    }
  )
  if (runId) active.get(runId)?.controller.abort()
  return { proposalId, version: request.version, status: "DISCARDED" as const }
}
async function userMessages(tx: Tx, proposalId: string) {
  return (
    await tx.planningRun.findMany({
      where: { proposalId },
      orderBy: { createdAt: "asc" },
    })
  ).map((run) => decode<{ message: string }>(run.inputJson).message)
}
export async function applyPlanningProposal(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  input: unknown,
  runtime: Pick<PlanningRuntime, "canRetain"> = unavailable
): Promise<PlanningApplyReceipt> {
  const request = proposalVersionRequestSchema.parse(input)
  return withProposal(
    context,
    journeyId,
    proposalId,
    async (tx, p, journey) => {
      const old = await tx.planningReceipt.findUnique({ where: { proposalId } })
      if (old && old.version === request.version)
        return {
          proposalId,
          journeyId,
          version: old.version,
          appliedRevision: old.appliedRevision,
          replayed: true,
        }
      requireOpen(p)
      if (p.activeRunId)
        throw new PlanningError("RUN_ACTIVE", "A planning turn is active", 409)
      requireVersion(p, request.version)
      const v = await latestVersion(tx, p)
      if (!v) throw new PlanningError("EMPTY_DIFF", "No preview to apply", 422)
      if (p.questionRunId)
        throw new PlanningError(
          "PREVIEW_REQUIRED",
          "Answer the current question first",
          422
        )
      if (journey.revision !== v.baseRevision)
        throw new PlanningError(
          "REVISION_CONFLICT",
          "Journey changed; rebase before applying",
          409
        )
      const preview = decode<PlanningPreview>(v.previewJson)
      if (!preview.committableDiff.length)
        throw new PlanningError(
          "EMPTY_DIFF",
          "Proposal has no event changes",
          422
        )
      if (preview.blockers.length)
        throw new PlanningError(
          "PREVIEW_REQUIRED",
          "Resolve preview blockers before applying",
          422
        )
      const operations = decode<PlanningEdit[]>(v.operationsJson)
      validateFieldSources(
        operations,
        decode<PlanningFieldSource[]>(v.sourcesJson),
        decode<PlanningProviderFact[]>(v.factsJson),
        await userMessages(tx, proposalId),
        journey,
        runtime
      )
      const next = await reducePlanningOperations(
        tx,
        context,
        p.id,
        journey,
        operations,
        v.createdAt.toISOString()
      )
      const expected = decode<JourneySnapshot>(v.snapshotJson)
      if (json(businessEvents(next)) !== json(businessEvents(expected)))
        throw new PlanningError(
          "PREVIEW_REQUIRED",
          "Business result differs from the preview",
          422
        )
      next.revision = journey.revision + 1
      await writeJourneyRevision(
        tx,
        context,
        {
          journey: next,
          operation: "planning.apply",
          idempotencyKey: `planning:${p.id}:${v.version}`,
          patch: [{ proposalId, version: v.version, operations }],
          inversePatch: [{ journey }],
        },
        journey
      )
      await tx.planningProposal.update({
        where: { id: proposalId },
        data: { status: "APPLIED" },
      })
      await tx.planningReceipt.create({
        data: {
          proposalId,
          journeyId,
          userId: context.userId,
          version: v.version,
          appliedRevision: next.revision,
        },
      })
      return {
        proposalId,
        journeyId,
        version: v.version,
        appliedRevision: next.revision,
        replayed: false,
      }
    }
  )
}

export async function executePlanningRun(
  context: AuthContext,
  journeyId: string,
  proposalId: string,
  runId: string,
  runtime: PlanningRuntime
) {
  if (active.has(runId)) return
  const state = {
    controller: new AbortController(),
    progress: null as string | null,
    livePlaces: [] as PlanningLivePlace[],
  }
  active.set(runId, state)
  let livePlacesExpiresAt: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const input = await withProposal(
      context,
      journeyId,
      proposalId,
      async (tx, p, journey) => {
        const run = await tx.planningRun.findFirst({
          where: { id: runId, proposalId, status: "RUNNING" },
        })
        if (!run || p.activeRunId !== runId || p.status !== "OPEN") return null
        const request = decode<{
          message: string
          replyToRunId?: string
          choiceRef?: string
        }>(run.inputJson)
        const base = await presentJourney(
          context,
          await revision(tx, journeyId, run.targetRevision),
          tx
        )
        const previous = await latestVersion(tx, p)
        const priorBase = await revision(
          tx,
          journeyId,
          previous?.baseRevision ?? p.baseRevision
        )
        const operations = previous
          ? decode<PlanningEdit[]>(previous.operationsJson)
          : []
        const preview = previous
          ? decode<JourneySnapshot>(previous.snapshotJson)
          : base
        const questionRun = request.replyToRunId
          ? await tx.planningRun.findUniqueOrThrow({
              where: { id: request.replyToRunId },
            })
          : null
        return {
          proposalId,
          runId,
          journeyId,
          parentVersion: run.parentVersion,
          baseRevision: run.targetRevision,
          mode: run.mode as PlanningMode,
          message: request.message,
          replyToRunId: request.replyToRunId,
          choiceRef: request.choiceRef,
          question: questionRun?.questionJson
            ? decode<PlanningQuestion>(questionRun.questionJson)
            : undefined,
          userMessages: await userMessages(tx, proposalId),
          baseEvents: base.events.map(summarizePlanningEvent),
          previewEvents: preview.events.map(summarizePlanningEvent),
          operations,
          constraints: previous
            ? decode<PlanningConstraint[]>(previous.constraintsJson)
            : [],
          rebaseConflicts:
            run.mode === "rebase"
              ? rebaseConflicts(priorBase, journey, operations)
              : [],
          deadline: run.deadline.toISOString(),
          signal: state.controller.signal,
          onProgress: (message: string) => {
            state.progress = message
          },
          onLivePlaces: (places: PlanningLivePlace[]) => {
            state.livePlaces = places
          },
        } satisfies PlanningRunInput
      }
    )
    if (!input) return
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          state.controller.abort()
          reject(
            new PlanningError(
              "RUN_FAILED",
              "Planning turn exceeded its deadline",
              504
            )
          )
        },
        Math.max(0, Date.parse(input.deadline) - Date.now())
      )
    })
    const result = await Promise.race([runtime.run(input), timedOut])
    if (result.livePlacesExpiresAt)
      livePlacesExpiresAt = Date.parse(result.livePlacesExpiresAt)
    await withProposal(
      context,
      journeyId,
      proposalId,
      async (tx, p, journey) => {
        const run = await tx.planningRun.findUniqueOrThrow({
          where: { id: runId },
        })
        if (
          p.status !== "OPEN" ||
          p.activeRunId !== runId ||
          run.status !== "RUNNING" ||
          p.latestVersion !== run.parentVersion ||
          run.deadline.getTime() <= Date.now()
        )
          return
        if (journey.revision !== run.targetRevision)
          throw new PlanningError(
            "REVISION_CONFLICT",
            "Journey changed during generation",
            409
          )
        const base = await presentJourney(
          context,
          await revision(tx, journeyId, run.targetRevision),
          tx
        )
        const messages = await userMessages(tx, proposalId)
        const output = validateRuntimeResult(result, messages, base)
        if (output.kind === "question") {
          if (
            new Set(output.choices.map((c) => c.choiceRef)).size !==
            output.choices.length
          )
            throw new PlanningError(
              "INVALID_INPUT",
              "Question choices must be unique",
              422
            )
          if (
            output.choices.some(
              (choice) =>
                choice.choiceRef.startsWith("amap:") &&
                !state.livePlaces.some(
                  (place) => place.candidateRef === choice.choiceRef
                )
            )
          )
            throw new PlanningError(
              "INVALID_INPUT",
              "Place choices must reuse current candidate references",
              422
            )
          await tx.planningRun.update({
            where: { id: runId },
            data: {
              status: "QUESTION",
              questionJson: json({ ...output, kind: undefined, runId }),
            },
          })
          await tx.planningProposal.update({
            where: { id: proposalId },
            data: { activeRunId: null, questionRunId: runId },
          })
          return
        }
        const previous = await latestVersion(tx, p)
        if (input.rebaseConflicts.length && !input.replyToRunId)
          throw new PlanningError(
            "PREVIEW_REQUIRED",
            "Clarify changed rebase targets before publishing",
            422
          )
        // A second change after a clarification needs a fresh question against the new target.
        if (input.replyToRunId) {
          const answered = await tx.planningRun.findUniqueOrThrow({
            where: { id: input.replyToRunId },
          })
          if (
            answered.targetRevision !== run.targetRevision &&
            input.rebaseConflicts.length
          )
            throw new PlanningError(
              "PREVIEW_REQUIRED",
              "Rebase target changed after the question",
              422
            )
        }
        const prefix: PlanningEdit[] =
          run.mode === "rebase" || !previous
            ? []
            : decode(previous.operationsJson)
        const operations = [...prefix, ...output.operations]
        const sources: PlanningFieldSource[] = [
          ...(prefix.length && previous
            ? decode<PlanningFieldSource[]>(previous.sourcesJson)
            : []),
          ...output.sources.map((s) => ({
            ...s,
            operation: s.operation + prefix.length,
          })),
        ]
        const facts = validateFieldSources(
          operations,
          sources,
          [
            ...(prefix.length && previous
              ? decode<PlanningProviderFact[]>(previous.factsJson)
              : []),
            ...result.permittedFacts,
          ],
          messages,
          base,
          runtime
        )
        const now = new Date(
          Math.max(Date.now(), Date.parse(base.updatedAt) + 1)
        ).toISOString()
        const next = await reducePlanningOperations(
          tx,
          context,
          proposalId,
          base,
          operations,
          now
        )
        if (Date.now() >= run.deadline.getTime()) {
          await tx.planningRun.update({
            where: { id: runId },
            data: { status: "TIMED_OUT" },
          })
          await tx.planningProposal.update({
            where: { id: proposalId },
            data: { activeRunId: null },
          })
          return
        }
        const prior = previous
          ? decode<JourneySnapshot>(previous.snapshotJson)
          : base
        const constraints = output.constraints
        const permissions = (values: PlanningProviderFact[]) =>
          values.map(({ provider, policyId, value }) => ({
            provider,
            policyId,
            value,
          }))
        const samePermissions = isDeepStrictEqual(
          permissions(facts),
          permissions(
            previous ? decode<PlanningProviderFact[]>(previous.factsJson) : []
          )
        )
        const unchanged =
          samePermissions &&
          json(businessEvents(prior)) === json(businessEvents(next)) &&
          json(constraints) === (previous?.constraintsJson ?? "[]") &&
          json(output.unverified) === (previous?.unverifiedJson ?? "[]") &&
          (previous?.baseRevision ?? p.baseRevision) === run.targetRevision
        if (!unchanged) {
          const version = p.latestVersion + 1
          const committableDiff = planningDiff(base, next)
          const blockers = constraints
            .filter(
              (c) =>
                (c.hard && c.satisfied === false) ||
                (c.verificationRequired && c.satisfied !== true)
            )
            .map((c) => c.text)
          const preview: PlanningPreview = {
            version,
            baseRevision: run.targetRevision,
            events: next.events.map(summarizePlanningEvent),
            delta: planningDiff(prior, next),
            committableDiff,
            constraints,
            unverified: output.unverified,
            blockers,
            canApply: committableDiff.length > 0 && blockers.length === 0,
          }
          await tx.planningVersion.create({
            data: {
              proposalId,
              version,
              baseRevision: run.targetRevision,
              operationsJson: json(operations),
              sourcesJson: json(sources),
              factsJson: json(facts),
              constraintsJson: json(constraints),
              unverifiedJson: json(output.unverified),
              snapshotJson: json(next),
              previewJson: json(preview),
              createdAt: new Date(now),
            },
          })
          await tx.planningProposal.update({
            where: { id: proposalId },
            data: { latestVersion: version, baseRevision: run.targetRevision },
          })
        }
        await tx.planningRun.update({
          where: { id: runId },
          data: { status: "SUCCEEDED" },
        })
        await tx.planningProposal.update({
          where: { id: proposalId },
          data: { activeRunId: null, questionRunId: null },
        })
      }
    )
  } catch (error) {
    // The provider's exception can contain display-only data or request URLs.
    // Persist only our structured failures; unexpected errors remain a generic failed run.
    const failure =
      error instanceof PlanningError
        ? { error: error.message, code: error.code }
        : { error: "Planning turn failed", code: "RUN_FAILED" }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PlanningProposal" WHERE "id" = ${proposalId} FOR UPDATE`
      const p = await tx.planningProposal.findUniqueOrThrow({
        where: { id: proposalId },
      })
      if (p.activeRunId !== runId) return
      const run = await tx.planningRun.findUniqueOrThrow({
        where: { id: runId },
      })
      if (run.status !== "RUNNING") return
      await tx.planningRun.update({
        where: { id: runId },
        data: {
          status: run.deadline.getTime() <= Date.now() ? "TIMED_OUT" : "FAILED",
          errorJson: json(failure),
        },
      })
      await tx.planningProposal.update({
        where: { id: proposalId },
        data: { activeRunId: null },
      })
    })
  } finally {
    if (timer) clearTimeout(timer)
    state.controller.abort()
    active.delete(runId)
    const expiresAt = livePlacesExpiresAt ?? Date.now() + 120000
    if (state.livePlaces.length && expiresAt > Date.now()) {
      placesByRun.set(runId, { expiresAt, places: state.livePlaces })
      const cleanup = setTimeout(
        () => placesByRun.delete(runId),
        expiresAt - Date.now()
      )
      cleanup.unref()
    }
  }
}
