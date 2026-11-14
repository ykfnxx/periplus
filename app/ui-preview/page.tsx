import { notFound } from "next/navigation"
export default async function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  const { default: Gallery } = await import("./gallery")
  return <Gallery />
}
