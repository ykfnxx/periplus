import { hashPassword } from "better-auth/crypto"
import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const { prisma } = await import("@/modules/data/db/prisma")

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

async function upsertSampleRoute(ownerId: string, name: string) {
  const existing = await prisma.route.findFirst({
    where: { ownerId, name },
  })
  if (existing) return

  await prisma.route.create({
    data: {
      ownerId,
      name,
      description: "开发环境样例路线",
      nodes: {
        create: [
          {
            id: `${ownerId}-${name}-start`,
            name: "起点",
            lat: 30.246,
            lng: 120.146,
            order: 0,
            category: "PLACE",
            durationMinutes: 60,
          },
          {
            id: `${ownerId}-${name}-end`,
            name: "终点",
            lat: 30.24,
            lng: 120.171,
            order: 1,
            category: "PLACE",
            durationMinutes: 120,
          },
        ],
      },
      edges: {
        create: [
          {
            fromNodeId: `${ownerId}-${name}-start`,
            toNodeId: `${ownerId}-${name}-end`,
            status: "INCOMPLETE",
          },
        ],
      },
    },
  })
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

  await upsertSampleRoute("dev-user-1", "User One 样例路线")
  await upsertSampleRoute("dev-user-2", "User Two 样例路线")

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
