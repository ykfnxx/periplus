import { NextRequest } from "next/server"
import {
  planningResponse,
  schedulePlanningRun,
} from "@/modules/planning/server/http"
import { startPlanningTurn } from "@/modules/planning/server/service"
import { planningRuntime } from "@/modules/planning/server/pi-runtime"
export const runtime = "nodejs"
export const maxDuration = 130
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return planningResponse(async (context) => {
    const p = await params
    const started = await startPlanningTurn(
      context,
      p.id,
      p.proposalId,
      await request.json()
    )
    schedulePlanningRun(context, p.id, started, planningRuntime)
    return started
  }, 202)
}
