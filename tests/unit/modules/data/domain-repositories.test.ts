import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type {
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import {
  addEventObservation,
  attachAssetToEvent,
  createAsset,
  createSourceDocument,
  createSourceItem,
  createSourcePack,
  deleteAsset,
  getAsset,
  linkSourceItemToEvent,
} from "@/modules/data/content/content-repository"
import {
  commitJourneyDomainGraph,
  createJourney,
  getJourney,
} from "@/modules/data/journeys/journey-repository"
import {
  createPhoto,
  deletePhoto,
  listPhotosForOwner,
} from "@/modules/data/photos/photo-repository"
import { PlaceCatalogRepository } from "@/modules/data/places/place-catalog-repository"
import {
  commitTransitPlanningRun,
  selectTransitPlan,
} from "@/modules/data/transit/transit-repository"
import { TransitPlanningService } from "@/modules/data/transit/transit-planning-service"
import {
  appendWorkspaceMessage,
  appendWorkspaceRevision,
  createWorkspaceSuggestion,
  createWorkspace,
  finishWorkspaceAgentRun,
  forkWorkspace,
  getWorkspaceDocument,
  startWorkspaceAgentRun,
} from "@/modules/data/workspaces/workspace-repository"
import {
  issueWorkspaceTicket,
  verifyWorkspaceTicket,
  WorkspaceTicketError,
} from "@/modules/data/workspaces/workspace-ticket"

const ownerId = `domain-owner-${randomUUID()}`
const otherOwnerId = `domain-other-${randomUUID()}`
const context = { userId: ownerId, role: "user" as const }
const otherContext = { userId: otherOwnerId, role: "user" as const }
const journeyId = `domain-journey-${randomUUID()}`
const sectionId = `${journeyId}-section`
const startId = `${journeyId}-start`
const transitId = `${journeyId}-transit`
const endId = `${journeyId}-end`
const now = "2026-08-01T10:00:00.000Z"

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ownerId,
        name: "Domain Owner",
        email: `${ownerId}@periplus.local`,
        emailVerified: true,
      },
      {
        id: otherOwnerId,
        name: "Other Domain Owner",
        email: `${otherOwnerId}@periplus.local`,
        emailVerified: true,
      },
    ],
  })
})

function identity(id: string, parentSectionEventId: string | null) {
  return {
    id,
    journeyId,
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    introducedRevision: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function visit(
  id: string,
  title: string,
  lng: number
): Extract<TargetJourneyEvent, { type: "VISIT" }> {
  return {
    ...identity(id, sectionId),
    type: "VISIT",
    executionStatus: "PLANNED",
    title,
    detail: {
      plannedLat: 30.25,
      plannedLng: lng,
      coordinateSystem: "GCJ02",
    },
  }
}

function graph(): TargetJourneyGraphSnapshot {
  return {
    id: journeyId,
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "Domain repository fixture",
    events: [
      {
        ...identity(sectionId, null),
        type: "SECTION",
        title: "Hangzhou",
        detail: { kind: "CITY", coordinateSystem: "GCJ02" },
      },
      visit(startId, "Start", 120.15),
      {
        ...identity(transitId, sectionId),
        type: "TRANSIT",
        executionStatus: "PLANNED",
        title: "Transfer",
        detail: {
          plannedFromEventId: startId,
          plannedToEventId: endId,
          transportMode: "CAR",
          requestMode: "DRIVE",
          preference: "RECOMMENDED",
          routeState: "EMPTY",
        },
      },
      visit(endId, "End", 120.2),
    ],
    links: [
      {
        id: `${journeyId}-link-1`,
        journeyId,
        fromEventId: startId,
        toEventId: transitId,
        kind: "MAIN",
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: `${journeyId}-link-2`,
        journeyId,
        fromEventId: transitId,
        toEventId: endId,
        kind: "MAIN",
        rank: 2048,
        introducedRevision: 1,
      },
    ],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

function journeyWrite(value: TargetJourneyGraphSnapshot) {
  return {
    graph: value,
    operation: "create",
    patch: [],
    inversePatch: [],
    idempotencyKey: `${journeyId}-create`,
  }
}

describe.sequential("P2B-P2D repositories", () => {
  let workspaceId: string

  it("persists Workspace snapshots and idempotent revisions", async () => {
    const createdJourney = await createJourney(context, journeyWrite(graph()))
    const workspace = await createWorkspace(context, {
      graph: createdJourney,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    workspaceId = workspace.id

    const revisionInput = {
      expectedRevision: 0,
      commandName: "workspace.refresh" as const,
      after: createdJourney,
      patch: [],
      inversePatch: [],
      idempotencyKey: `${workspace.id}-refresh`,
      now: new Date("2026-08-01T10:01:00.000Z"),
    }
    const first = await appendWorkspaceRevision(
      context,
      workspace.id,
      revisionInput
    )
    const replay = await appendWorkspaceRevision(
      context,
      workspace.id,
      revisionInput
    )
    expect(replay?.id).toBe(first?.id)
    expect(
      (await getWorkspaceDocument(context, workspace.id))?.draftState
    ).toBe("DIRTY")

    const run = await startWorkspaceAgentRun(
      context,
      workspace.id,
      new Date("2026-08-01T10:02:00.000Z")
    )
    expect(run?.status).toBe("RUNNING")
    const otherWorkspace = await createWorkspace(context, {
      graph: createdJourney,
      sourceJourneyId: journeyId,
      baseJourneyRevision: 1,
      now: new Date(now),
    })
    const foreignRun = await startWorkspaceAgentRun(
      context,
      otherWorkspace.id,
      new Date("2026-08-01T10:02:00.000Z")
    )
    await expect(
      appendWorkspaceMessage(context, workspace.id, {
        role: "ASSISTANT",
        content: "wrong provenance",
        agentRunId: foreignRun!.id,
      })
    ).rejects.toThrow("same Workspace")
    const message = await appendWorkspaceMessage(context, workspace.id, {
      role: "ASSISTANT",
      content: "Persisted response",
      agentRunId: run!.id,
    })
    expect(message).toMatchObject({ agentRunId: run!.id })
    expect(
      await createWorkspaceSuggestion(context, workspace.id, {
        title: "Add a stop",
        summary: "One command",
        commandPayloads: [{ command: "journey.add_event" }],
        basedOnWorkspaceRevision: 1,
      })
    ).toMatchObject({ status: "PENDING", basedOnWorkspaceRevision: 1 })
    expect(
      await finishWorkspaceAgentRun(context, workspace.id, run!.id, {
        status: "SUCCEEDED",
        now: new Date("2026-08-01T10:03:00.000Z"),
      })
    ).toMatchObject({ status: "SUCCEEDED" })
    await expect(
      getWorkspaceDocument(otherContext, workspace.id)
    ).rejects.toThrow("does not belong")
  })

  it("signs short-lived Workspace tickets and rejects tampering or expiry", () => {
    const ticket = issueWorkspaceTicket(ownerId, workspaceId, {
      nowSeconds: 100,
      ttlSeconds: 300,
      secret: "workspace-test-secret",
      nonce: "ticket-nonce",
    })
    expect(
      verifyWorkspaceTicket(ticket, {
        nowSeconds: 399,
        secret: "workspace-test-secret",
      })
    ).toMatchObject({ subjectUserId: ownerId, workspaceId })
    expect(() =>
      verifyWorkspaceTicket(`${ticket}x`, {
        nowSeconds: 200,
        secret: "workspace-test-secret",
      })
    ).toThrow(WorkspaceTicketError)
    expect(() =>
      verifyWorkspaceTicket(ticket, {
        nowSeconds: 200,
        secret: "wrong-secret",
      })
    ).toThrow("signature")
    expect(() =>
      verifyWorkspaceTicket("malformed", {
        nowSeconds: 200,
        secret: "workspace-test-secret",
      })
    ).toThrow("Malformed")
    expect(() =>
      verifyWorkspaceTicket(ticket, {
        nowSeconds: 99,
        secret: "workspace-test-secret",
      })
    ).toThrow("not active yet")
    expect(() =>
      verifyWorkspaceTicket(ticket, {
        nowSeconds: 400,
        secret: "workspace-test-secret",
      })
    ).toThrow("expired")
    expect(() =>
      issueWorkspaceTicket(ownerId, workspaceId, {
        nowSeconds: 100,
        ttlSeconds: 301,
        secret: "workspace-test-secret",
      })
    ).toThrow("between 1 and 300")
  })

  it("persists stable READY and FAILED Transit runs with lossless geometry", async () => {
    const run: TargetTransitPlanningRun = {
      id: `${journeyId}-run-ready`,
      transitEventId: transitId,
      requestFingerprint: "ready-fingerprint",
      provider: "test",
      status: "READY",
      calculatedAt: "2026-08-01T11:00:00.000Z",
      plans: [
        {
          id: `${journeyId}-plan-fast`,
          planningRunId: `${journeyId}-run-ready`,
          transitEventId: transitId,
          provider: "test",
          rank: 0,
          label: "Fast",
          strategy: "FASTEST",
          distanceMeters: 1200,
          durationSeconds: 600,
          trafficBasis: "REALTIME",
          calculatedAt: "2026-08-01T11:00:00.000Z",
          segments: [
            {
              id: `${journeyId}-segment-wgs84`,
              order: 0,
              mode: "DRIVE",
              coordinateSystem: "WGS84",
              geometryKind: "ROAD_NETWORK",
              positions: [
                [116.397, 39.908],
                [116.398, 39.909],
              ],
              trafficSections: [
                {
                  status: "SLOW",
                  positions: [
                    [116.397, 39.908],
                    [116.398, 39.909],
                  ],
                },
              ],
            },
          ],
        },
        {
          id: `${journeyId}-plan-low-cost`,
          planningRunId: `${journeyId}-run-ready`,
          transitEventId: transitId,
          provider: "test",
          rank: 1,
          label: "Low cost",
          strategy: "LOW_COST",
          distanceMeters: 1500,
          durationSeconds: 900,
          trafficBasis: "TYPICAL",
          calculatedAt: "2026-08-01T11:00:00.000Z",
          segments: [
            {
              id: `${journeyId}-segment-local`,
              order: 0,
              mode: "WALK",
              coordinateSystem: "LOCAL",
              geometryKind: "SCHEMATIC",
              positions: [[0, 0]],
            },
          ],
        },
      ],
    }
    const ready = await commitTransitPlanningRun(context, journeyId, {
      run,
      expectedRevision: 1,
      idempotencyKey: `${journeyId}-plan-ready`,
    })
    expect(ready?.revision).toBe(2)
    expect(ready?.transitPlanningRuns[0]?.plans[0]?.segments[0]).toMatchObject({
      coordinateSystem: "WGS84",
      positions: [
        [116.397, 39.908],
        [116.398, 39.909],
      ],
    })
    expect(
      (
        await commitTransitPlanningRun(context, journeyId, {
          run,
          expectedRevision: 1,
          idempotencyKey: `${journeyId}-plan-ready`,
        })
      )?.revision
    ).toBe(2)
    await expect(
      commitTransitPlanningRun(context, journeyId, {
        run,
        selectedPlanId: run.plans[1]!.id,
        expectedRevision: 1,
        idempotencyKey: `${journeyId}-plan-ready`,
      })
    ).rejects.toThrow("idempotency key")

    const selected = await selectTransitPlan(context, journeyId, {
      transitEventId: transitId,
      planningRunId: run.id,
      planId: run.plans[1]!.id,
      expectedRevision: 2,
      idempotencyKey: `${journeyId}-select-low-cost`,
    })
    expect(
      selected?.events.find((event) => event.id === transitId)?.detail
    ).toMatchObject({ selectedPlanId: run.plans[1]!.id })
    expect(
      (
        await selectTransitPlan(context, journeyId, {
          transitEventId: transitId,
          planningRunId: run.id,
          planId: run.plans[1]!.id,
          expectedRevision: 2,
          idempotencyKey: `${journeyId}-select-low-cost`,
        })
      )?.revision
    ).toBe(3)

    const failedRun: TargetTransitPlanningRun = {
      id: `${journeyId}-run-failed`,
      transitEventId: transitId,
      requestFingerprint: "failed-fingerprint",
      provider: "test",
      status: "FAILED",
      errorCode: "NO_ROUTE",
      errorMessage: "No route",
      calculatedAt: "2026-08-01T12:00:00.000Z",
      plans: [],
    }
    const failed = await commitTransitPlanningRun(context, journeyId, {
      run: failedRun,
      expectedRevision: 3,
      idempotencyKey: `${journeyId}-plan-failed`,
    })
    expect(failed?.revision).toBe(4)
    expect(
      failed?.transitPlanningRuns.find(
        (candidate) => candidate.id === failedRun.id
      )
    ).toMatchObject({
      requestFingerprint: "failed-fingerprint",
      errorCode: "NO_ROUTE",
      plans: [],
    })
    expect(
      failed?.events.find((event) => event.id === transitId)?.detail
    ).toMatchObject({
      activePlanningRunId: run.id,
      selectedPlanId: run.plans[1]!.id,
      routeState: "ROUTE_STALE",
    })

    const tampered = structuredClone(failed!)
    tampered.revision += 1
    tampered.transitPlanningRuns[0]!.warning = "rewritten history"
    await expect(
      commitJourneyDomainGraph(
        context,
        journeyId,
        {
          graph: tampered,
          operation: "journey.plan_transit",
          idempotencyKey: `${journeyId}-tamper-transit-run`,
          patch: [],
          inversePatch: [],
          actor: { kind: "USER", userId: ownerId },
        },
        failed!.revision,
        "TRANSIT"
      )
    ).rejects.toThrow(/append-only|immutable/)
    expect((await getJourney(context, journeyId))?.revision).toBe(4)
  })

  it("persists Asset, Observation, and private Source provenance through Journey revisions", async () => {
    const image = await createAsset(context, {
      kind: "IMAGE",
      visibility: "JOURNEY",
      storageKey: `uploads/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 128,
      checksum: `image-${randomUUID()}`,
      lat: 30.25,
      lng: 120.15,
    })
    const attached = await attachAssetToEvent(context, journeyId, {
      eventId: startId,
      assetId: image.id,
      role: "GALLERY",
      visibility: "JOURNEY",
      expectedRevision: 4,
      idempotencyKey: `${journeyId}-attach-image`,
    })
    expect(attached?.eventAssetLinks[0]).toMatchObject({
      assetId: image.id,
      assetChecksum: image.checksum,
      introducedRevision: 5,
    })
    expect(
      (
        await attachAssetToEvent(context, journeyId, {
          eventId: startId,
          assetId: image.id,
          role: "GALLERY",
          visibility: "JOURNEY",
          expectedRevision: 4,
          idempotencyKey: `${journeyId}-attach-image`,
        })
      )?.revision
    ).toBe(5)

    const observed = await addEventObservation(context, journeyId, {
      eventId: startId,
      kind: "RATING",
      phase: "ACTUAL",
      value: 4.5,
      body: "Worth revisiting",
      visibility: "JOURNEY",
      expectedRevision: 5,
      idempotencyKey: `${journeyId}-rating`,
    })
    expect(observed?.observations[0]).toMatchObject({
      kind: "RATING",
      value: 4.5,
      actor: { kind: "USER", userId: ownerId },
    })
    expect(
      (
        await addEventObservation(context, journeyId, {
          eventId: startId,
          kind: "RATING",
          phase: "ACTUAL",
          value: 4.5,
          body: "Worth revisiting",
          visibility: "JOURNEY",
          expectedRevision: 5,
          idempotencyKey: `${journeyId}-rating`,
        })
      )?.revision
    ).toBe(6)

    const sourceAsset = await createAsset(context, {
      kind: "FILE",
      storageKey: `sources/${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 256,
      checksum: `source-${randomUUID()}`,
    })
    const pack = await createSourcePack(context, {
      title: "Private guide",
      visibility: "PRIVATE",
    })
    await expect(
      createSourcePack(context, { title: "   ", visibility: "PRIVATE" })
    ).rejects.toThrow()
    const document = await createSourceDocument(context, {
      sourcePackId: pack.id,
      assetId: sourceAsset.id,
      title: "Guide",
      pageCount: 1,
    })
    await expect(
      createSourceItem(context, {
        sourceDocumentId: document.id,
        kind: "NOTE",
        title: "Invalid confidence",
        sourceOrder: 1,
        confidence: 1.1,
      })
    ).rejects.toThrow()
    const item = await createSourceItem(context, {
      sourceDocumentId: document.id,
      kind: "NOTE",
      title: "Quiet entrance",
      sourceOrder: 0,
      confidence: 0.9,
    })
    const linked = await linkSourceItemToEvent(context, journeyId, {
      eventId: startId,
      sourceItemId: item.id,
      role: "EVIDENCE",
      confidence: 0.9,
      expectedRevision: 6,
      idempotencyKey: `${journeyId}-source-link`,
    })
    expect(linked?.eventSourceLinks[0]).toMatchObject({
      sourceItemId: item.id,
      sourceDocumentId: document.id,
      sourceDocumentChecksum: sourceAsset.checksum,
    })
    expect(
      (
        await linkSourceItemToEvent(context, journeyId, {
          eventId: startId,
          sourceItemId: item.id,
          role: "EVIDENCE",
          confidence: 0.9,
          expectedRevision: 6,
          idempotencyKey: `${journeyId}-source-link`,
        })
      )?.revision
    ).toBe(7)

    const privateExternalAsset = await createAsset(otherContext, {
      kind: "IMAGE",
      storageKey: `uploads/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 64,
      checksum: `private-${randomUUID()}`,
    })
    await expect(
      attachAssetToEvent(context, journeyId, {
        eventId: endId,
        assetId: privateExternalAsset.id,
        role: "GALLERY",
        expectedRevision: 7,
        idempotencyKey: `${journeyId}-forbidden-asset`,
      })
    ).rejects.toThrow()
    expect((await getJourney(context, journeyId))?.revision).toBe(7)

    const privateSourceAsset = await createAsset(otherContext, {
      kind: "FILE",
      storageKey: `sources/${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 128,
      checksum: `private-source-${randomUUID()}`,
    })
    const privatePack = await createSourcePack(otherContext, {
      title: "Other private guide",
      visibility: "PRIVATE",
    })
    const privateDocument = await createSourceDocument(otherContext, {
      sourcePackId: privatePack.id,
      assetId: privateSourceAsset.id,
      title: "Other guide",
    })
    const privateItem = await createSourceItem(otherContext, {
      sourceDocumentId: privateDocument.id,
      kind: "NOTE",
      title: "Private entrance",
      sourceOrder: 0,
      confidence: 0.8,
    })
    await expect(
      createSourceDocument(context, {
        sourcePackId: privatePack.id,
        assetId: privateSourceAsset.id,
        title: "Unauthorized copy",
      })
    ).rejects.toThrow("SourcePack not found")
    await expect(
      linkSourceItemToEvent(context, journeyId, {
        eventId: startId,
        sourceItemId: privateItem.id,
        role: "EVIDENCE",
        confidence: 0.8,
        approvedForJourneySharing: true,
        expectedRevision: 7,
        idempotencyKey: `${journeyId}-forbidden-private-source`,
      })
    ).rejects.toThrow("requires a shared pack")
    expect((await getJourney(context, journeyId))?.revision).toBe(7)

    const sharedPack = await createSourcePack(otherContext, {
      title: "Shared guide",
      visibility: "SHARED",
    })
    const sharedSourceAsset = await createAsset(otherContext, {
      kind: "FILE",
      storageKey: `sources/${randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 192,
      checksum: `shared-source-${randomUUID()}`,
    })
    const sharedDocument = await createSourceDocument(otherContext, {
      sourcePackId: sharedPack.id,
      assetId: sharedSourceAsset.id,
      title: "Shared guide",
    })
    const sharedItem = await createSourceItem(otherContext, {
      sourceDocumentId: sharedDocument.id,
      kind: "NOTE",
      title: "Shared entrance",
      sourceOrder: 0,
      confidence: 0.85,
    })
    await expect(
      linkSourceItemToEvent(context, journeyId, {
        eventId: startId,
        sourceItemId: sharedItem.id,
        role: "EVIDENCE",
        confidence: 0.85,
        expectedRevision: 7,
        idempotencyKey: `${journeyId}-unapproved-shared-source`,
      })
    ).rejects.toThrow("requires a shared pack")
    const shared = await linkSourceItemToEvent(context, journeyId, {
      eventId: startId,
      sourceItemId: sharedItem.id,
      role: "EVIDENCE",
      excerpt: "Use the east entrance before 09:00.",
      confidence: 0.85,
      approvedForJourneySharing: true,
      expectedRevision: 7,
      idempotencyKey: `${journeyId}-approved-shared-source`,
    })
    expect(shared?.revision).toBe(8)
    expect(shared?.eventSourceLinks.at(-1)).toMatchObject({
      sourceItemId: sharedItem.id,
      sourceDocumentChecksum: sharedSourceAsset.checksum,
      approvedForJourneySharing: true,
      excerpt: "Use the east entrance before 09:00.",
    })

    const deletedAsset = await createAsset(context, {
      kind: "IMAGE",
      storageKey: `uploads/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 64,
      checksum: `deleted-${randomUUID()}`,
    })
    expect(await deleteAsset(context, deletedAsset.id)).toBe(true)
    expect(await getAsset(context, deletedAsset.id)).toBeNull()
    expect(await getAsset(context, deletedAsset.id, true)).toMatchObject({
      id: deletedAsset.id,
      deletedAt: expect.any(String),
    })
    await expect(
      attachAssetToEvent(context, journeyId, {
        eventId: endId,
        assetId: deletedAsset.id,
        role: "GALLERY",
        expectedRevision: 8,
        idempotencyKey: `${journeyId}-deleted-asset`,
      })
    ).rejects.toThrow("active Asset not found")
    expect((await getJourney(context, journeyId))?.revision).toBe(8)

    const tampered = structuredClone((await getJourney(context, journeyId))!)
    tampered.revision += 1
    tampered.observations[0]!.body = "rewritten history"
    await expect(
      commitJourneyDomainGraph(
        context,
        journeyId,
        {
          graph: tampered,
          operation: "journey.add_observation",
          idempotencyKey: `${journeyId}-tamper-observation`,
          patch: [],
          inversePatch: [],
          actor: { kind: "USER", userId: ownerId },
        },
        8,
        "CONTENT"
      )
    ).rejects.toThrow("append-only")
    expect((await getJourney(context, journeyId))?.revision).toBe(8)

    const stale = await getWorkspaceDocument(
      context,
      workspaceId,
      new Date("2026-08-02T00:00:00.000Z")
    )
    expect(stale?.draftState).toBe("STALE")
    const expired = await getWorkspaceDocument(
      context,
      workspaceId,
      new Date("2026-10-01T00:00:00.000Z")
    )
    expect(expired?.session.status).toBe("EXPIRED")
    expect(expired?.accessState).toBe("EXPIRED")
    await expect(
      appendWorkspaceMessage(
        context,
        workspaceId,
        { role: "USER", content: "too late" },
        new Date("2026-10-01T00:00:01.000Z")
      )
    ).rejects.toThrow("not active")
    await expect(
      forkWorkspace(context, workspaceId, new Date("2026-10-01T00:00:01.000Z"))
    ).rejects.toThrow("Inactive Workspace")
  })

  it("adapts the existing Photo API boundary to owned IMAGE Assets", async () => {
    const filename = `${randomUUID()}.jpg`
    const photo = await createPhoto(context, {
      url: `/uploads/photos/${filename}`,
      lat: 30.26,
      lng: 120.16,
      mimeType: "image/jpeg",
      size: 32,
      checksum: `photo-${randomUUID()}`,
      originalName: "photo.jpg",
    })
    expect(photo).toMatchObject({
      ownerId,
      url: `/uploads/photos/${filename}`,
      lat: 30.26,
      lng: 120.16,
      caption: "",
    })
    expect(
      (await listPhotosForOwner(context, ownerId)).some(
        (candidate) => candidate.id === photo.id
      )
    ).toBe(true)
    expect(await deletePhoto(context, photo.id)).toMatchObject({
      deleted: true,
    })
    expect(
      await prisma.asset.findUnique({ where: { id: photo.id } })
    ).toMatchObject({
      storageKey: `/uploads/photos/${filename}`,
      deletedAt: expect.any(Date),
    })
    expect(
      (await listPhotosForOwner(context, ownerId)).some(
        (candidate) => candidate.id === photo.id
      )
    ).toBe(false)
  })

  it("does not call the Transit provider again on an idempotent persisted replay", async () => {
    const request = {
      transitEventId: transitId,
      origin: { name: "Start", lat: 30.25, lng: 120.15 },
      destination: { name: "End", lat: 30.25, lng: 120.2 },
      mode: "DRIVE" as const,
      transportMode: "CAR" as const,
      preference: "RECOMMENDED" as const,
      alternatives: 1,
    }
    const provider = {
      plan: vi.fn().mockResolvedValue({
        transitEventId: transitId,
        requestFingerprint: "service-fingerprint",
        plans: [
          {
            id: "provider-plan",
            provider: "mock" as const,
            rank: 0,
            label: "Recommended",
            strategy: "RECOMMENDED",
            distanceMeters: 1000,
            durationSeconds: 600,
            trafficBasis: "TYPICAL" as const,
            calculatedAt: "2026-08-01T13:00:00.000Z",
            requestFingerprint: "service-fingerprint",
            segments: [
              {
                id: "provider-segment",
                order: 0,
                mode: "DRIVE" as const,
                coordinateSystem: "GCJ02" as const,
                geometryKind: "ROAD_NETWORK" as const,
                positions: [
                  [120.15, 30.25],
                  [120.2, 30.25],
                ],
              },
            ],
          },
        ],
      }),
    }
    const service = new TransitPlanningService({
      provider,
      logUsage: async () => undefined,
    })
    const currentRevision = (await getJourney(context, journeyId))!.revision
    const options = {
      expectedRevision: currentRevision,
      idempotencyKey: `${journeyId}-service-plan`,
    }
    expect(
      (await service.planAndPersist(context, journeyId, request, options)).graph
        .revision
    ).toBe(currentRevision + 1)
    expect(
      (await service.planAndPersist(context, journeyId, request, options)).graph
        .revision
    ).toBe(currentRevision + 1)
    await expect(
      service.planAndPersist(
        context,
        journeyId,
        {
          ...request,
          origin: { ...request.origin, lat: request.origin.lat + 0.01 },
        },
        options
      )
    ).rejects.toThrow("idempotency key")
    expect(provider.plan).toHaveBeenCalledTimes(1)
  })

  it("maps public BD09LL place coordinates to the target BD09 database enum without loss", async () => {
    const placeId = `place-${randomUUID()}`
    const providerId = `provider-${randomUUID()}`
    await prisma.place.create({
      data: {
        id: placeId,
        name: "Coordinate fixture",
        normalizedName: "coordinate fixture",
        category: "SIGHT",
      },
    })
    await prisma.placeProviderMatch.create({
      data: {
        placeId,
        provider: "seed",
        providerId: `seed-${randomUUID()}`,
        confidence: 0.9,
        coordinateSystem: "BD09",
        lat: 39.915,
        lng: 116.404,
      },
    })

    const repository = new PlaceCatalogRepository()
    expect(
      (await repository.findById(placeId))?.coordinates.some(
        (coordinate) => coordinate.coordinateSystem === "BD09LL"
      )
    ).toBe(true)

    await repository.linkProviderMatch(placeId, {
      id: `result-${randomUUID()}`,
      placeId,
      name: "Coordinate fixture",
      normalizedName: "coordinate fixture",
      aliases: [],
      category: "SIGHT",
      coordinates: [
        {
          provider: "amap",
          coordinateSystem: "BD09LL",
          lat: 39.916,
          lng: 116.405,
          source: "provider_search",
        },
      ],
      bestCoordinate: {
        provider: "amap",
        coordinateSystem: "BD09LL",
        lat: 39.916,
        lng: 116.405,
        source: "provider_search",
      },
      sources: [{ provider: "amap", providerId }],
      confidence: 0.95,
      quality: "verified",
      canAddToJourney: true,
      needsUserConfirmation: false,
      reason: "test",
    })
    expect(
      (
        await prisma.placeProviderMatch.findUnique({
          where: {
            provider_providerId: { provider: "amap", providerId },
          },
        })
      )?.coordinateSystem
    ).toBe("BD09")
  })
})
