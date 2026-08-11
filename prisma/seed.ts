import { PrismaClient } from "@prisma/client"
import { hashPassword } from "better-auth/crypto"
import { loadProjectEnv } from "@/config/env.server"
import {
  targetJourneyGraphSnapshotSchema,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"

loadProjectEnv()

const prisma = new PrismaClient()

const NOW = "2026-08-02T00:00:00.000Z"
const START = "2026-08-02T01:00:00.000Z"
const MID = "2026-08-02T03:00:00.000Z"
const ARRIVE = "2026-08-02T03:30:00.000Z"
const LUNCH = "2026-08-02T05:30:00.000Z"
const END = "2026-08-02T06:30:00.000Z"

const ids = {
  owner: "dev-user-1",
  journey: "dev-user-1-sample-journey",
  journeyRevision: "dev-user-1-sample-journey-r1",
  section: "dev-user-1-sample-journey-hangzhou",
  start: "dev-user-1-sample-journey-west-lake",
  transit: "dev-user-1-sample-journey-transit",
  end: "dev-user-1-sample-journey-lingyin",
  meal: "dev-user-1-sample-journey-meal",
  link1: "dev-user-1-sample-journey-link-1",
  link2: "dev-user-1-sample-journey-link-2",
  link3: "dev-user-1-sample-journey-link-3",
  planningRun: "dev-user-1-sample-transit-run",
  transitPlan: "dev-user-1-sample-transit-plan",
  transitSegment: "dev-user-1-sample-transit-segment",
  asset: "dev-user-1-sample-asset",
  assetLink: "dev-user-1-sample-asset-link",
  observation: "dev-user-1-sample-observation",
  sourceAsset: "dev-user-1-source-asset",
  sourcePack: "dev-user-1-source-pack",
  sourceDocument: "dev-user-1-source-document",
  sourceItem: "dev-user-1-source-item",
  sourceLink: "dev-user-1-source-link",
  workspace: "dev-user-1-workspace",
  workspaceRevision: "dev-user-1-workspace-r1",
  agentRun: "dev-user-1-agent-run",
  message: "dev-user-1-workspace-message",
  suggestion: "dev-user-1-workspace-suggestion",
  placeWestLake: "place-west-lake",
  placeLingyin: "place-lingyin",
} as const

const devUsers = [
  {
    id: "dev-admin",
    email: "admin@periplus.local",
    name: "Periplus Admin",
    role: "admin",
  },
  {
    id: ids.owner,
    email: "user1@periplus.local",
    name: "User One",
    role: "user",
  },
  {
    id: "dev-user-2",
    email: "user2@periplus.local",
    name: "User Two",
    role: "user",
  },
] as const

function eventIdentity(id: string, parentSectionEventId: string | null) {
  return {
    id,
    journeyId: ids.journey,
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    introducedRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function buildJourneyGraph(): TargetJourneyGraphSnapshot {
  const graph = {
    id: ids.journey,
    ownerId: ids.owner,
    revision: 1,
    status: "DRAFT" as const,
    visibility: "PRIVATE" as const,
    title: "杭州一日",
    description: "P1 deterministic schema fixture",
    events: [
      {
        ...eventIdentity(ids.section, null),
        type: "SECTION" as const,
        title: "杭州",
        detail: {
          kind: "CITY" as const,
          timeZone: "Asia/Shanghai",
          placeId: ids.placeWestLake,
          lat: 30.246,
          lng: 120.146,
          coordinateSystem: "GCJ02" as const,
        },
      },
      {
        ...eventIdentity(ids.start, ids.section),
        type: "VISIT" as const,
        executionStatus: "PLANNED" as const,
        title: "西湖",
        plannedStartAt: START,
        plannedEndAt: MID,
        detail: {
          plannedPlaceId: ids.placeWestLake,
          plannedLat: 30.246,
          plannedLng: 120.146,
          coordinateSystem: "GCJ02" as const,
          plannedDurationMinutes: 120,
        },
      },
      {
        ...eventIdentity(ids.transit, ids.section),
        type: "TRANSIT" as const,
        executionStatus: "PLANNED" as const,
        title: "前往灵隐寺",
        plannedStartAt: MID,
        plannedEndAt: ARRIVE,
        detail: {
          plannedFromEventId: ids.start,
          plannedToEventId: ids.end,
          transportMode: "TAXI" as const,
          requestMode: "DRIVE" as const,
          preference: "RECOMMENDED" as const,
          plannedDurationMinutes: 30,
          activePlanningRunId: ids.planningRun,
          selectedPlanId: ids.transitPlan,
          routeState: "READY" as const,
        },
      },
      {
        ...eventIdentity(ids.end, ids.section),
        type: "VISIT" as const,
        executionStatus: "PLANNED" as const,
        title: "灵隐寺",
        plannedStartAt: ARRIVE,
        plannedEndAt: LUNCH,
        detail: {
          plannedPlaceId: ids.placeLingyin,
          plannedLat: 30.24,
          plannedLng: 120.102,
          coordinateSystem: "GCJ02" as const,
          plannedDurationMinutes: 120,
        },
      },
      {
        ...eventIdentity(ids.meal, ids.section),
        type: "MEAL" as const,
        executionStatus: "PLANNED" as const,
        title: "午餐",
        plannedStartAt: LUNCH,
        plannedEndAt: END,
        detail: {
          plannedLat: 30.241,
          plannedLng: 120.104,
          coordinateSystem: "GCJ02" as const,
          plannedDurationMinutes: 60,
          cuisine: "杭帮菜",
        },
      },
    ],
    links: [
      {
        id: ids.link1,
        journeyId: ids.journey,
        fromEventId: ids.start,
        toEventId: ids.transit,
        kind: "MAIN" as const,
        rank: 1024,
        introducedRevision: 1,
      },
      {
        id: ids.link2,
        journeyId: ids.journey,
        fromEventId: ids.transit,
        toEventId: ids.end,
        kind: "MAIN" as const,
        rank: 2048,
        introducedRevision: 1,
      },
      {
        id: ids.link3,
        journeyId: ids.journey,
        fromEventId: ids.end,
        toEventId: ids.meal,
        kind: "MAIN" as const,
        rank: 3072,
        introducedRevision: 1,
      },
    ],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [
      {
        id: ids.planningRun,
        transitEventId: ids.transit,
        requestFingerprint: "seed-transit-request-v1",
        provider: "seed",
        status: "READY" as const,
        calculatedAt: NOW,
        plans: [
          {
            id: ids.transitPlan,
            planningRunId: ids.planningRun,
            transitEventId: ids.transit,
            provider: "seed",
            rank: 0,
            label: "推荐",
            strategy: "RECOMMENDED",
            distanceMeters: 8200,
            durationSeconds: 1800,
            fareAmount: 32,
            trafficBasis: "TYPICAL" as const,
            calculatedAt: NOW,
            segments: [
              {
                id: ids.transitSegment,
                order: 0,
                mode: "TAXI" as const,
                fromName: "西湖",
                toName: "灵隐寺",
                distanceMeters: 8200,
                durationSeconds: 1800,
                fareAmount: 32,
                coordinateSystem: "WGS84" as const,
                geometryKind: "ROAD_NETWORK" as const,
                positions: [
                  [120.132, 30.244],
                  [120.102, 30.24],
                ] as [number, number][],
              },
            ],
          },
        ],
      },
    ],
    eventAssetLinks: [
      {
        id: ids.assetLink,
        journeyId: ids.journey,
        eventId: ids.start,
        assetId: ids.asset,
        assetChecksum: "seed-photo-checksum",
        role: "GALLERY" as const,
        rank: 0,
        caption: "清晨西湖",
        visibility: "JOURNEY" as const,
        introducedRevision: 1,
        createdAt: NOW,
      },
    ],
    observations: [
      {
        id: ids.observation,
        eventId: ids.start,
        kind: "NOTE" as const,
        phase: "ACTUAL" as const,
        body: "清晨人少",
        observedAt: NOW,
        actor: { kind: "USER" as const, userId: ids.owner },
        visibility: "JOURNEY" as const,
        createdAt: NOW,
      },
    ],
    eventSourceLinks: [
      {
        id: ids.sourceLink,
        journeyId: ids.journey,
        eventId: ids.end,
        sourceItemId: ids.sourceItem,
        sourceDocumentId: ids.sourceDocument,
        sourceDocumentChecksum: "seed-source-checksum",
        role: "INSPIRATION" as const,
        excerpt: "清晨入寺更安静。",
        page: "12",
        confidence: 0.9,
        rank: 0,
        approvedForJourneySharing: true,
        introducedRevision: 1,
        createdAt: NOW,
      },
    ],
  }

  graph.events.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  )

  return targetJourneyGraphSnapshotSchema.parse(graph)
}

async function seedUsers(passwordHash: string) {
  for (const user of devUsers) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: true,
        banned: false,
        createdAt: new Date(NOW),
      },
    })
    await prisma.account.create({
      data: {
        id: `credential-${user.id}`,
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
        createdAt: new Date(NOW),
      },
    })
  }
}

async function seedJourney(graph: TargetJourneyGraphSnapshot) {
  await prisma.place.createMany({
    data: [
      {
        id: ids.placeWestLake,
        name: "西湖",
        normalizedName: "西湖",
        category: "SIGHT",
        latGcj02: 30.246,
        lngGcj02: 120.146,
        city: "杭州",
        sourceQuality: "VERIFIED",
        createdAt: new Date(NOW),
      },
      {
        id: ids.placeLingyin,
        name: "灵隐寺",
        normalizedName: "灵隐寺",
        category: "CULTURE",
        latGcj02: 30.24,
        lngGcj02: 120.102,
        city: "杭州",
        sourceQuality: "VERIFIED",
        createdAt: new Date(NOW),
      },
    ],
  })

  await prisma.journey.create({
    data: {
      id: ids.journey,
      ownerId: ids.owner,
      revision: 1,
      status: "DRAFT",
      visibility: "PRIVATE",
      title: graph.title,
      description: graph.description,
      createdAt: new Date(NOW),
    },
  })

  await prisma.journeyRevision.create({
    data: {
      id: ids.journeyRevision,
      journeyId: ids.journey,
      revision: 1,
      operation: "seed",
      snapshotJson: JSON.stringify(graph),
      patchJson: "[]",
      inversePatchJson: "[]",
      actorKind: "SYSTEM",
      idempotencyKey: "seed-journey-r1",
      createdAt: new Date(NOW),
    },
  })

  for (const event of graph.events) {
    await prisma.journeyEvent.create({
      data: {
        id: event.id,
        journeyId: event.journeyId,
        parentSectionEventId: event.parentSectionEventId,
        type: event.type,
        executionStatus:
          "executionStatus" in event ? event.executionStatus : undefined,
        placementStatus: event.placementStatus,
        origin: event.origin,
        title: event.title,
        description: event.description,
        plannedStartAt:
          "plannedStartAt" in event && event.plannedStartAt
            ? new Date(event.plannedStartAt)
            : undefined,
        plannedEndAt:
          "plannedEndAt" in event && event.plannedEndAt
            ? new Date(event.plannedEndAt)
            : undefined,
        introducedRevision: event.introducedRevision,
        createdAt: new Date(event.createdAt),
        updatedAt: new Date(event.updatedAt),
      },
    })
  }

  for (const event of graph.events) {
    switch (event.type) {
      case "SECTION":
        await prisma.sectionEventDetail.create({
          data: {
            eventId: event.id,
            kind: event.detail.kind,
            timezone: event.detail.timeZone,
            placeId: event.detail.placeId,
            lat: event.detail.lat,
            lng: event.detail.lng,
            coordinateSystem: event.detail.coordinateSystem,
          },
        })
        break
      case "VISIT":
        await prisma.visitEventDetail.create({
          data: { eventId: event.id, ...event.detail },
        })
        break
      case "TRANSIT":
        await prisma.transitEventDetail.create({
          data: {
            eventId: event.id,
            plannedFromEventId: event.detail.plannedFromEventId,
            plannedToEventId: event.detail.plannedToEventId,
            transportMode: event.detail.transportMode,
            requestMode: event.detail.requestMode,
            preference: event.detail.preference,
            plannedDurationMinutes: event.detail.plannedDurationMinutes,
            routeState: "EMPTY",
          },
        })
        break
      case "MEAL":
        await prisma.mealEventDetail.create({
          data: { eventId: event.id, ...event.detail },
        })
        break
      default:
        throw new Error(`seed does not support ${event.type}`)
    }
  }

  await prisma.journeyEventLink.createMany({
    data: graph.links.map((link) => ({
      ...link,
      createdAt: new Date(NOW),
    })),
  })

  const run = graph.transitPlanningRuns[0]!
  const plan = run.plans[0]!
  await prisma.transitPlanningRun.create({
    data: {
      id: run.id,
      transitEventId: run.transitEventId,
      requestFingerprint: run.requestFingerprint,
      provider: run.provider,
      status: "PLANNING",
      calculatedAt: new Date(run.calculatedAt),
      createdAt: new Date(NOW),
    },
  })
  await prisma.transitPlan.create({
    data: {
      id: plan.id,
      planningRunId: plan.planningRunId,
      transitEventId: plan.transitEventId,
      provider: plan.provider,
      rank: plan.rank,
      label: plan.label,
      strategy: plan.strategy,
      distanceMeters: plan.distanceMeters,
      durationSeconds: plan.durationSeconds,
      fareAmount: plan.fareAmount,
      trafficBasis: plan.trafficBasis,
      calculatedAt: new Date(plan.calculatedAt),
      createdAt: new Date(NOW),
    },
  })
  await prisma.transitSegment.createMany({
    data: plan.segments.map((segment) => ({
      id: segment.id,
      transitPlanId: plan.id,
      order: segment.order,
      mode: segment.mode,
      fromName: segment.fromName,
      toName: segment.toName,
      lineName: segment.lineName,
      distanceMeters: segment.distanceMeters,
      durationSeconds: segment.durationSeconds,
      fareAmount: segment.fareAmount,
      coordinateSystem: segment.coordinateSystem,
      geometryKind: segment.geometryKind,
      positionsJson: JSON.stringify(segment.positions),
    })),
  })
  await prisma.transitPlanningRun.update({
    where: { id: run.id },
    data: { status: "READY" },
  })
  await prisma.transitEventDetail.update({
    where: { eventId: ids.transit },
    data: {
      routeState: "READY",
      activePlanningRunId: run.id,
      selectedPlanId: plan.id,
    },
  })
}

async function seedContent(graph: TargetJourneyGraphSnapshot) {
  await prisma.asset.createMany({
    data: [
      {
        id: ids.asset,
        ownerId: ids.owner,
        kind: "IMAGE",
        visibility: "JOURNEY",
        storageKey: "seed/journey/west-lake.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        checksum: "seed-photo-checksum",
        createdAt: new Date(NOW),
      },
      {
        id: ids.sourceAsset,
        ownerId: ids.owner,
        kind: "FILE",
        visibility: "PRIVATE",
        storageKey: "seed/sources/hangzhou-guide.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        checksum: "seed-source-checksum",
        createdAt: new Date(NOW),
      },
    ],
  })

  const assetLink = graph.eventAssetLinks[0]!
  await prisma.eventAssetLink.create({
    data: {
      ...assetLink,
      createdAt: new Date(assetLink.createdAt),
    },
  })

  const observation = graph.observations[0]!
  await prisma.eventObservation.create({
    data: {
      id: observation.id,
      eventId: observation.eventId,
      kind: observation.kind,
      phase: observation.phase,
      body: observation.body,
      observedAt: new Date(observation.observedAt),
      actorKind: observation.actor.kind,
      actorUserId:
        observation.actor.kind === "USER" ? observation.actor.userId : null,
      visibility: observation.visibility,
      createdAt: new Date(observation.createdAt),
    },
  })

  await prisma.sourcePack.create({
    data: {
      id: ids.sourcePack,
      ownerId: ids.owner,
      title: "杭州资料包",
      visibility: "PRIVATE",
      status: "READY",
      createdAt: new Date(NOW),
    },
  })
  await prisma.sourceDocument.create({
    data: {
      id: ids.sourceDocument,
      sourcePackId: ids.sourcePack,
      assetId: ids.sourceAsset,
      checksum: "seed-source-checksum",
      title: "杭州指南",
      pageCount: 24,
      processingStatus: "READY",
      createdAt: new Date(NOW),
    },
  })
  await prisma.sourceItem.create({
    data: {
      id: ids.sourceItem,
      sourceDocumentId: ids.sourceDocument,
      kind: "PLACE",
      title: "灵隐寺",
      body: "清晨适合参访",
      sourceOrder: 0,
      page: "12",
      confidence: 0.9,
      resolutionState: "CONFIRMED",
      resolvedPlaceId: ids.placeLingyin,
      createdAt: new Date(NOW),
    },
  })

  const sourceLink = graph.eventSourceLinks[0]!
  await prisma.eventSourceLink.create({
    data: {
      ...sourceLink,
      createdAt: new Date(sourceLink.createdAt),
    },
  })
}

async function seedWorkspace(graph: TargetJourneyGraphSnapshot) {
  const graphJson = JSON.stringify(graph)
  await prisma.workspaceSession.create({
    data: {
      id: ids.workspace,
      ownerId: ids.owner,
      sourceJourneyId: ids.journey,
      baseJourneyRevision: 1,
      headWorkspaceRevision: 0,
      status: "ACTIVE",
      title: graph.title,
      headGraphJson: graphJson,
      lastAccessAt: new Date(NOW),
      createdAt: new Date(NOW),
    },
  })
  await prisma.workspaceRevision.create({
    data: {
      id: ids.workspaceRevision,
      workspaceId: ids.workspace,
      revision: 1,
      commandName: "WORKSPACE_REFRESH",
      beforeGraphJson: graphJson,
      afterGraphJson: graphJson,
      patchJson: "[]",
      inversePatchJson: "[]",
      actorKind: "USER",
      actorUserId: ids.owner,
      idempotencyKey: "seed-workspace-r1",
      createdAt: new Date(NOW),
    },
  })
  await prisma.workspaceSession.update({
    where: { id: ids.workspace },
    data: { headWorkspaceRevision: 1 },
  })
  await prisma.workspaceAgentRun.create({
    data: {
      id: ids.agentRun,
      workspaceId: ids.workspace,
      status: "SUCCEEDED",
      startedAt: new Date(NOW),
      completedAt: new Date(NOW),
      createdAt: new Date(NOW),
    },
  })
  await prisma.workspaceMessage.create({
    data: {
      id: ids.message,
      workspaceId: ids.workspace,
      role: "ASSISTANT",
      content: "已载入杭州一日行程。",
      agentRunId: ids.agentRun,
      createdAt: new Date(NOW),
    },
  })
  await prisma.workspaceSuggestion.create({
    data: {
      id: ids.suggestion,
      workspaceId: ids.workspace,
      title: "保留午餐缓冲",
      summary: "灵隐寺之后预留一小时午餐。",
      commandPayloadsJson: "[]",
      basedOnWorkspaceRevision: 1,
      status: "PENDING",
      createdAt: new Date(NOW),
    },
  })
  await prisma.providerUsageLog.create({
    data: {
      id: "dev-user-1-provider-usage",
      provider: "seed",
      purpose: "TRANSIT_PLAN",
      status: "SUCCEEDED",
      userId: ids.owner,
      workspaceId: ids.workspace,
      agentRunId: ids.agentRun,
      requestId: "seed-request-1",
      createdAt: new Date(NOW),
    },
  })
}

async function main() {
  const existingUsers = await prisma.user.count()
  if (existingUsers > 0) {
    throw new Error("Seed requires a fresh reset database")
  }

  const passwordHash = await hashPassword("periplus123")
  const graph = buildJourneyGraph()

  await seedUsers(passwordHash)
  await seedJourney(graph)
  await seedContent(graph)
  await seedWorkspace(graph)

  console.log(
    `Seeded ${devUsers.length} users, Journey ${ids.journey}, and Workspace ${ids.workspace}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
