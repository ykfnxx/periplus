import { hashPassword } from "better-auth/crypto"
import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const { prisma } = await import("@/modules/data/db/prisma")
const { createJourney } =
  await import("@/modules/data/journeys/journey-repository")

const password = "periplus123"

const devUsers = [
  {
    id: "dev-admin",
    email: "admin@periplus.local",
    name: "Periplus Admin",
    role: "admin",
  },
  {
    id: "dev-user-1",
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

async function upsertCredentialAccount(userId: string, passwordHash: string) {
  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: userId,
      },
    },
    update: {
      password: passwordHash,
    },
    create: {
      id: `credential-${userId}`,
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    },
  })
}

async function replaceSampleJourney(ownerId: string, title: string) {
  const journeyId = `${ownerId}-sample-journey`
  await prisma.journey.deleteMany({ where: { id: journeyId } })

  const sectionId = `${journeyId}-hangzhou`
  const startId = `${journeyId}-west-lake`
  const transitId = `${journeyId}-transit`
  const endId = `${journeyId}-lingyin`
  await createJourney(
    { userId: ownerId, role: "user" },
    {
      id: journeyId,
      title,
      description: "开发环境 JourneyEvent 样例行程",
      status: "DRAFT",
      events: [
        {
          id: sectionId,
          type: "SECTION",
          origin: "ORIGINAL",
          title: "杭州一日",
          detail: {
            kind: "DAY",
            lat: 30.246,
            lng: 120.146,
            coordinateSystem: "GCJ02",
          },
        },
        {
          id: startId,
          parentEventId: sectionId,
          type: "VISIT",
          executionStatus: "PLANNED",
          origin: "ORIGINAL",
          title: "西湖",
          plannedStartAt: "2026-08-02T01:00:00.000Z",
          plannedEndAt: "2026-08-02T03:00:00.000Z",
          detail: {
            plannedLat: 30.246,
            plannedLng: 120.146,
            coordinateSystem: "GCJ02",
            plannedDurationMinutes: 120,
          },
        },
        {
          id: transitId,
          parentEventId: sectionId,
          type: "TRANSIT",
          executionStatus: "PLANNED",
          origin: "ORIGINAL",
          title: "前往灵隐寺",
          plannedStartAt: "2026-08-02T03:00:00.000Z",
          plannedEndAt: "2026-08-02T03:30:00.000Z",
          detail: {
            plannedFromEventId: startId,
            plannedToEventId: endId,
            transportMode: "TAXI",
            requestMode: "DRIVE",
            preference: "RECOMMENDED",
            plannedDurationMinutes: 30,
            planningStatus: "EMPTY",
          },
        },
        {
          id: endId,
          parentEventId: sectionId,
          type: "VISIT",
          executionStatus: "PLANNED",
          origin: "ORIGINAL",
          title: "灵隐寺",
          plannedStartAt: "2026-08-02T03:30:00.000Z",
          plannedEndAt: "2026-08-02T05:30:00.000Z",
          detail: {
            plannedLat: 30.24,
            plannedLng: 120.102,
            coordinateSystem: "GCJ02",
            plannedDurationMinutes: 120,
          },
        },
      ],
      links: [
        {
          id: `${journeyId}-link-1`,
          fromEventId: startId,
          toEventId: transitId,
          kind: "MAIN",
        },
        {
          id: `${journeyId}-link-2`,
          fromEventId: transitId,
          toEventId: endId,
          kind: "MAIN",
        },
      ],
    }
  )
}

async function main() {
  const passwordHash = await hashPassword(password)

  for (const user of devUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        role: user.role,
        banned: false,
        banReason: null,
        banExpires: null,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: true,
        banned: false,
      },
    })
    await upsertCredentialAccount(user.id, passwordHash)
  }

  await replaceSampleJourney("dev-user-1", "User One 样例行程")
  await replaceSampleJourney("dev-user-2", "User Two 样例行程")

  console.log("Seeded Periplus dev accounts:")
  for (const user of devUsers) {
    console.log(`- ${user.email} / ${password}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
