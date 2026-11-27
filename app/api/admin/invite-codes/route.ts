import { requireAdmin } from "@/modules/auth/server/context"
import { authErrorResponse } from "@/modules/auth/server/http-errors"
import {
  issueInviteCodes,
  issueOptions,
} from "@/modules/auth/server/invite-codes"
import { prisma } from "@/modules/data/db/prisma"

export async function GET() {
  try {
    await requireAdmin()
    const codes = await prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        redeemedBy: { select: { id: true, name: true, email: true } },
      },
    })
    return Response.json(
      codes.map((code) => ({
        ...code,
        remainingUses: code.maxUses - code.usedCount,
      }))
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAdmin()
    const body = await request.json().catch(() => null)
    const options = issueOptions.safeParse(body)
    if (!options.success)
      return Response.json({ error: options.error.message }, { status: 400 })
    return Response.json(await issueInviteCodes(options.data, userId), {
      status: 201,
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
