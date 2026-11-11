import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { getRecordingJourney } from "@/modules/data/journeys/recording-service"
import { PermissionDeniedError } from "@/modules/auth/server/context"
import { requireApplicationOrigin } from "@/modules/agent/server/authorization"
import { AgentAuthorizationError } from "@/modules/agent/contracts"
import { prisma } from "@/modules/data/db/prisma"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  try {
    requireApplicationOrigin(request)
  } catch (error) {
    if (error instanceof AgentAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status })
    throw error
  }
  return recordingResponse(async (context) => {
    const { id, grantId } = await params
    const journey = await getRecordingJourney(context, id)
    const grant = await prisma.agentGrant.findUnique({ where: { id: grantId } })
    if (
      !grant ||
      grant.journeyId !== id ||
      (grant.userId !== context.userId && journey.ownerId !== context.userId)
    ) {
      throw new PermissionDeniedError("不能撤销此授权")
    }
    await prisma.agentGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    })
    return { revoked: true }
  })
}
