import { randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { prisma } from "@/lib/prisma"

export type AdminUserRole = "user" | "admin"

export interface AdminUserInput {
  email: string
  name: string
  password: string
  role?: AdminUserRole
}

export function normalizeAdminRole(role: unknown): AdminUserRole {
  return role === "admin" ? "admin" : "user"
}

export function adminUserSelect() {
  return {
    id: true,
    email: true,
    name: true,
    role: true,
    banned: true,
    banReason: true,
    banExpires: true,
    createdAt: true,
    updatedAt: true,
  } as const
}

export async function setCredentialPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password)
  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: userId,
      },
    },
    update: { password: passwordHash },
    create: {
      id: `credential-${userId}`,
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    },
  })
}

export async function createAdminUser(input: AdminUserInput) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      emailVerified: true,
      role: input.role ?? "user",
      banned: false,
    },
    select: adminUserSelect(),
  })

  await setCredentialPassword(user.id, input.password)
  return user
}
