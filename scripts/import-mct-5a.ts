import { readFile } from "node:fs/promises"
import { loadProjectEnv } from "@/config/env.server"
import {
  importMct5ARecords,
  MCT_5A_SOURCE_URL,
  parseMct5AHtml,
  type Mct5ARecord,
} from "@/lib/places/importers/mct-5a"

loadProjectEnv()

const { prisma } = await import("@/lib/prisma")

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function argValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function readMockRecords() {
  const fixtureUrl = new URL("../data/mct-5a.mock.json", import.meta.url)
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as Mct5ARecord[]
}

async function fetchOfficialRecords(sourceUrl: string) {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch MCT 5A source: ${response.status}`)
  }
  return parseMct5AHtml(await response.text(), sourceUrl)
}

async function main() {
  const useMock = hasFlag("--mock")
  const dryRun = hasFlag("--dry-run")
  const sourceUrl =
    argValue("--source") ??
    process.env.PERIPLUS_MCT_5A_SOURCE_URL ??
    MCT_5A_SOURCE_URL
  const limit = argValue("--limit")
  const limitCount = limit ? Number(limit) : undefined
  if (limit && (!Number.isInteger(limitCount) || limitCount! < 1)) {
    throw new Error("--limit must be a positive integer")
  }

  const loaded = useMock
    ? await readMockRecords()
    : await fetchOfficialRecords(sourceUrl)
  const records = limitCount ? loaded.slice(0, limitCount) : loaded

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          source: useMock ? "mock" : sourceUrl,
          count: records.length,
          sample: records.slice(0, 5),
        },
        null,
        2
      )
    )
    return
  }

  const summary = await importMct5ARecords(prisma, records, sourceUrl)
  console.log(
    `Imported ${summary.imported} MCT 5A scenic places from ${
      useMock ? "mock fixture" : summary.sourceUrl
    }`
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
