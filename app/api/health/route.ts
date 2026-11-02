import { NextResponse } from "next/server"
import { prisma } from "@/modules/data/db/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        status: "ready",
        version: process.env.PERIPLUS_RELEASE_SHA ?? "development",
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    console.error("Readiness database check failed")
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
