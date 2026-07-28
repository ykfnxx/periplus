import { NextRequest, NextResponse } from "next/server"
import { silkRoadRoute } from "@/lib/mock-routes"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query") || ""

  // Always return Silk Road data regardless of query (mock behavior)
  console.log(`Mock AI received query: "${query}"`)

  return NextResponse.json({
    success: true,
    data: {
      name: silkRoadRoute.name,
      description: silkRoadRoute.description,
      nodes: silkRoadRoute.nodes,
      edges: silkRoadRoute.edges,
      subPlans: silkRoadRoute.subPlans,
    },
  })
}
