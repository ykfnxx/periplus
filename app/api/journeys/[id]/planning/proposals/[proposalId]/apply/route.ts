import { NextRequest } from "next/server"
import { planningResponse } from "@/modules/planning/server/http"
import { applyPlanningProposal } from "@/modules/planning/server/service"
import { planningRuntime } from "@/modules/planning/server/pi-runtime"
export const runtime = "nodejs"
export const maxDuration = 130
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return planningResponse(async (context) => {
    const p = await params
    return applyPlanningProposal(
      context,
      p.id,
      p.proposalId,
      await request.json(),
      planningRuntime
    )
  })
}
