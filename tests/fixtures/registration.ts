import { issueInviteCodes } from "@/modules/auth/server/invite-codes"

export async function registrationCode() {
  const [invite] = await issueInviteCodes(
    { count: 1, maxUses: 1, note: "Test registration" },
    null
  )
  return invite!.code
}
