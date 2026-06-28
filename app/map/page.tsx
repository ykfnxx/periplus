import { redirect } from "next/navigation"

interface MapPageProps {
  searchParams: Promise<{ route?: string }>
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const { route } = await searchParams
  redirect(route ? `/?route=${encodeURIComponent(route)}` : "/")
}
