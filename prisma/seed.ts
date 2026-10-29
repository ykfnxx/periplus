import { PrismaClient } from "@prisma/client"
import { hashPassword } from "better-auth/crypto"
import { loadProjectEnv } from "@/config/env.server"
import { createJourney } from "@/modules/data/journeys/journey-repository"
import { blankEvent } from "@/modules/data/journeys/recording-reducer"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
loadProjectEnv()
const prisma = new PrismaClient()
async function main() {
  if (await prisma.user.count())
    throw new Error("Seed requires a fresh reset database")
  const password = await hashPassword("periplus123")
  for (const user of [
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
  ]) {
    await prisma.user.create({
      data: { ...user, emailVerified: true, banned: false },
    })
    await prisma.account.create({
      data: {
        id: `credential-${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password,
      },
    })
  }
  const now = new Date().toISOString(),
    source = { userId: "dev-user-1", name: "User One", image: null }
  const walk = {
    ...blankEvent("sample-lake", source, now),
    title: "西湖散步",
    body: "沿着湖边慢慢走。",
    category: "VISIT" as const,
    date: "2026-10-29",
    location: {
      name: "西湖",
      address: "杭州",
      coordinates: {
        lat: 30.246,
        lng: 120.146,
        coordinateSystem: "GCJ02" as const,
      },
    },
  }
  const note = {
    ...blankEvent("sample-note", source, now),
    body: "雨停后再去喝茶。",
  }
  const journey: JourneySnapshot = {
    id: "dev-user-1-sample-journey",
    ownerId: source.userId,
    role: "OWNER",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "杭州慢游",
    description: "一份保留完整与未填记录的示例游记",
    events: [walk, note],
    createdAt: now,
    updatedAt: now,
  }
  const context = { userId: source.userId, role: "user" as const }
  await createJourney(context, {
    journey,
    operation: "seed",
    idempotencyKey: "seed-journey",
    patch: [],
    inversePatch: [],
  })
  console.log("Seeded three users and one Journey")
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
