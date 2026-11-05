import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import {
  getCurrentUser,
  PermissionDeniedError,
} from "@/modules/auth/server/context"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"
import {
  getShareStatus,
  getSharePreview,
} from "@/modules/data/sharing/share-service"
import ShareManager from "@/modules/travelogue/sharing/ShareManager"
export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "分享旅程 · Periplus",
  robots: { index: false, follow: false },
}
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ event?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params
  try {
    const status = await getShareStatus(user, id)
    const preview = await getSharePreview(user, id, status.includeCosts)
    const { event } = await searchParams
    const returnHref = `/journeys/${encodeURIComponent(id)}${event ? `?event=${encodeURIComponent(event)}` : ""}`
    return (
      <ShareManager
        journeyId={id}
        initialStatus={status}
        initialPreview={preview}
        returnHref={returnHref}
      />
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof RecordingNotFoundError
    )
      notFound()
    throw error
  }
}
