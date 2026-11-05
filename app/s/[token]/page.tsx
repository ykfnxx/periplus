import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicShare } from "@/modules/data/sharing/share-service"
import { periplusServerConfig } from "@/config/periplus.server"
import SharedJourneyDocument from "@/modules/travelogue/sharing/SharedJourneyDocument"
export const dynamic = "force-dynamic"
const load = cache(getPublicShare)
type Params = { params: Promise<{ token: string }> }
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const share = await load((await params).token)
  if (!share)
    return {
      title: "这篇游记暂不可访问",
      robots: { index: false, follow: false },
    }
  const photo = share.document.events.flatMap((event) => event.photos)[0]
  return {
    title: `${share.document.title} · Periplus`,
    description: share.document.description.slice(0, 180),
    robots: { index: false, follow: false },
    openGraph: {
      title: share.document.title,
      description: share.document.description.slice(0, 180),
      ...(photo
        ? {
            images: [
              new URL(
                share.photoUrls[photo.assetId],
                periplusServerConfig.app.baseUrl
              ).toString(),
            ],
          }
        : {}),
    },
  }
}
export default async function SharedPage({ params }: Params) {
  const share = await load((await params).token)
  if (!share) notFound()
  return (
    <main className="share-page">
      <SharedJourneyDocument
        document={share.document}
        photoUrls={share.photoUrls}
      />
    </main>
  )
}
