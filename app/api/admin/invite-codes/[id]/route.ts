import { requireAdmin } from "@/modules/auth/server/context"
import { authErrorResponse } from "@/modules/auth/server/http-errors"
import { prisma } from "@/modules/data/db/prisma"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const result = await prisma.inviteCode.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (
      !result.count &&
      !(await prisma.inviteCode.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      return Response.json({ error: "邀请码不存在" }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
