import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const [
  { PlaceCatalogRepository },
  { createPlaceIntelligenceService },
  { prisma },
] = await Promise.all([
  import("@/modules/data/places/place-catalog-repository"),
  import("@/modules/data/places/place-service"),
  import("@/modules/data/db/prisma"),
])

function argValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function positiveInteger(name: string, fallback?: number) {
  const value = argValue(name)
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

async function main() {
  const limit = positiveInteger("--limit")
  const delayMs = positiveInteger("--delay-ms", 250)!
  const repository = new PlaceCatalogRepository()
  const service = createPlaceIntelligenceService()
  const targets = await repository.listProviderEnrichmentTargets("amap", limit)
  const counts = { AUTO_APPROVED: 0, PENDING_REVIEW: 0, NO_MATCH: 0 }
  let consecutiveProviderErrors = 0

  for (const [index, target] of targets.entries()) {
    const result = await service.enrichPlace({
      placeId: target.placeId,
      provider: "amap",
      fields: ["coordinates", "provider_match"],
    })
    counts[result.matchStatus] += 1
    const providerErrors = result.warnings.filter(
      (warning) =>
        warning.provider === "amap" &&
        (warning.code === "provider_error" || warning.code === "quota_exceeded")
    )
    consecutiveProviderErrors = providerErrors.length
      ? consecutiveProviderErrors + 1
      : 0
    console.log(
      `[${index + 1}/${targets.length}] ${target.name}: ${result.matchStatus} (${result.reason})`
    )
    for (const warning of result.warnings) {
      console.warn(`  ${warning.provider}/${warning.code}: ${warning.message}`)
    }
    if (consecutiveProviderErrors >= 3) {
      throw new Error(
        "高德连续 3 次返回 provider 错误，批处理已熔断，请检查 Web Service Key、IP 白名单或配额"
      )
    }
    if (index < targets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  console.log(JSON.stringify({ total: targets.length, ...counts }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
