import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const [{ PlaceCatalogRepository }, { prisma }] = await Promise.all([
  import("@/modules/data/places/place-catalog-repository"),
  import("@/modules/data/db/prisma"),
])

function argValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const approveId = argValue("--approve")
  const rejectId = argValue("--reject")
  if (approveId && rejectId) throw new Error("只能选择 --approve 或 --reject")

  const repository = new PlaceCatalogRepository()
  if (approveId || rejectId) {
    const result = await repository.reviewMatchCandidate(
      approveId ?? rejectId!,
      Boolean(approveId)
    )
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const reviews = await repository.listMatchReviews()
  console.log(
    JSON.stringify(
      reviews.map((review) => ({
        id: review.id,
        provider: review.provider,
        providerId: review.providerId,
        name: review.name,
        confidence: review.confidence,
        status: review.status,
      })),
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
