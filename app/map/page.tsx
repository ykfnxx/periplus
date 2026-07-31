import { redirect } from "next/navigation"

interface MapPageProps {
  searchParams: Promise<{ journey?: string }>
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const { journey } = await searchParams
  redirect(
    journey ? `/workspace?journey=${encodeURIComponent(journey)}` : "/workspace"
  )
}
