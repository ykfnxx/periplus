import { headers } from "next/headers"
import { auth } from "@/modules/auth/server/auth"

export type UserRole = "user" | "admin"

export interface AuthContext {
  userId: string
  role: UserRole
}

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message)
    this.name = "AuthRequiredError"
  }
}

export class PermissionDeniedError extends Error {
  constructor(message = "Permission denied") {
    super(message)
    this.name = "PermissionDeniedError"
  }
}

let testAuthContext: AuthContext | null | undefined

function normalizeRole(role: unknown): UserRole {
  return role === "admin" ? "admin" : "user"
}

export function isAdmin(context: AuthContext): boolean {
  return context.role === "admin"
}

export function setTestAuthContext(context: AuthContext | null | undefined) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setTestAuthContext is only available in tests")
  }
  testAuthContext = context
}

export async function getCurrentUser(): Promise<AuthContext | null> {
  if (process.env.NODE_ENV === "test" && testAuthContext !== undefined) {
    return testAuthContext
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user?.id) return null

  return {
    userId: session.user.id,
    role: normalizeRole(session.user.role),
  }
}

export async function requireCurrentUser(): Promise<AuthContext> {
  const context = await getCurrentUser()
  if (!context) throw new AuthRequiredError()
  return context
}

export async function requireAdmin(): Promise<AuthContext> {
  const context = await requireCurrentUser()
  if (!isAdmin(context)) throw new PermissionDeniedError()
  return context
}
