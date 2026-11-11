import { NextRequest } from "next/server"
import { planningResponse } from "@/modules/planning/server/http"
import { discardPlanningProposal } from "@/modules/planning/server/service"
export const runtime = "nodejs"
export const maxDuration = 130
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return planningResponse(async (context) => {
    const p = await params
    return discardPlanningProposal(
      context,
      p.id,
      p.proposalId,
      await request.json()
    )
  })
}
