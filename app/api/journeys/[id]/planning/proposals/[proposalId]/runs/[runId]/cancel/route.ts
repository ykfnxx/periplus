import { NextRequest } from "next/server"
import { planningResponse } from "@/modules/planning/server/http"
import { cancelPlanningRun } from "@/modules/planning/server/service"
export const runtime = "nodejs"
export const maxDuration = 130
export function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; proposalId: string; runId: string }> }
) {
  return planningResponse(async (context) => {
    const p = await params
    return cancelPlanningRun(context, p.id, p.proposalId, p.runId)
  })
}
