import { createHash } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import { normalizePlaceName } from "../normalize"

export const MCT_5A_SOURCE_URL =
  "https://sjfw.mct.gov.cn/site/dataservice/rural?type=10"

export interface Mct5ARecord {
  province: string
  city?: string
  name: string
  years: number[]
  latGcj02?: number
  lngGcj02?: number
  latWgs84?: number
  lngWgs84?: number
  aliases?: string[]
  sourceUrl?: string
  rawText?: string
}

export interface Mct5AImportSummary {
  imported: number
  sourceUrl: string
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .trim()
}

function inferCity(name: string, province: string) {
  if (["北京", "天津", "上海", "重庆"].includes(province)) {
    return `${province}市`
  }

  const city = name.match(/^(.{1,16}?市)/)
  if (city?.[1]) return city[1]

  const direct = name.match(/^(.{1,16}?(?:自治州|地区|盟|州))/)
  if (direct?.[1]) return direct[1]

  const withProvinceCity = name.match(/(?:省|自治区)(.{1,16}?市)/)
  if (withProvinceCity?.[1]) return withProvinceCity[1]

  const withProvince = name.match(
    /(?:省|自治区)(.{1,16}?(?:自治州|地区|盟|州))/
  )
  return withProvince?.[1]
}

function parseEntry(rawText: string, province: string, sourceUrl: string) {
  const text = decodeHtml(rawText)
  const match = text.match(/^(.+?)(\d{4}(?:\/\d{4})*)年$/)
  if (!match) return null

  const name = match[1].trim()
  const years = match[2]
    .split("/")
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year))

  return {
    province,
    city: inferCity(name, province),
    name,
    years,
    sourceUrl,
    rawText: text,
  } satisfies Mct5ARecord
}

export function parseMct5AHtml(
  html: string,
  sourceUrl = MCT_5A_SOURCE_URL
): Mct5ARecord[] {
  const start = html.indexOf('id="province"')
  const content = start >= 0 ? html.slice(start) : html
  const tokenPattern =
    /<div class="tit"[^>]*>([\s\S]*?)<\/div>|<a href="JavaScript:;"[^>]*>([\s\S]*?)<\/a>/g
  const records: Mct5ARecord[] = []
  let province: string | null = null

  for (const match of content.matchAll(tokenPattern)) {
    if (match[1]) {
      province = decodeHtml(match[1])
      continue
    }

    if (!province || !match[2]) continue
    const record = parseEntry(match[2], province, sourceUrl)
    if (record) records.push(record)
  }

  return records
}

export function mct5AProviderId(
  record: Pick<Mct5ARecord, "province" | "name">
) {
  const hash = createHash("sha1")
    .update(`${record.province}:${record.name}`)
    .digest("hex")
    .slice(0, 12)
  return `mct-5a-${hash}`
}

function uniqueAliases(record: Mct5ARecord) {
  return Array.from(
    new Map(
      (record.aliases ?? [])
        .map((alias) => alias.trim())
        .filter(Boolean)
        .map((alias) => [normalizePlaceName(alias), alias])
    ).values()
  ).filter(
    (alias) => normalizePlaceName(alias) !== normalizePlaceName(record.name)
  )
}

export async function importMct5ARecords(
  prisma: PrismaClient,
  records: Mct5ARecord[],
  sourceUrl = MCT_5A_SOURCE_URL
): Promise<Mct5AImportSummary> {
  let imported = 0

  for (const record of records) {
    const providerId = mct5AProviderId(record)
    const placeId = `place-${providerId}`
    const normalizedName = normalizePlaceName(record.name)
    const aliases = uniqueAliases(record)

    await prisma.place.upsert({
      where: { id: placeId },
      update: {
        name: record.name,
        normalizedName,
        category: "SIGHT",
        latGcj02: record.latGcj02,
        lngGcj02: record.lngGcj02,
        latWgs84: record.latWgs84,
        lngWgs84: record.lngWgs84,
        countryCode: "CN",
        province: record.province,
        city: record.city,
        description: `国家5A级旅游景区，获评年份：${record.years.join("/")}`,
        sourceQuality: "VERIFIED",
      },
      create: {
        id: placeId,
        name: record.name,
        normalizedName,
        category: "SIGHT",
        latGcj02: record.latGcj02,
        lngGcj02: record.lngGcj02,
        latWgs84: record.latWgs84,
        lngWgs84: record.lngWgs84,
        countryCode: "CN",
        province: record.province,
        city: record.city,
        description: `国家5A级旅游景区，获评年份：${record.years.join("/")}`,
        sourceQuality: "VERIFIED",
      },
    })

    for (const alias of aliases) {
      await prisma.placeAlias.upsert({
        where: {
          placeId_normalizedName: {
            placeId,
            normalizedName: normalizePlaceName(alias),
          },
        },
        update: { name: alias },
        create: {
          placeId,
          name: alias,
          normalizedName: normalizePlaceName(alias),
          locale: "zh-CN",
        },
      })
    }

    await prisma.placeSource.upsert({
      where: {
        provider_providerId: {
          provider: "mct",
          providerId,
        },
      },
      update: {
        placeId,
        license: "MCT public data service",
        rawName: record.name,
        rawCategory: "国家5A级旅游景区",
        rawPayload: JSON.stringify({
          province: record.province,
          city: record.city,
          years: record.years,
          sourceUrl: record.sourceUrl ?? sourceUrl,
          rawText: record.rawText,
        }),
        fetchedAt: new Date(),
      },
      create: {
        placeId,
        provider: "mct",
        providerId,
        license: "MCT public data service",
        rawName: record.name,
        rawCategory: "国家5A级旅游景区",
        rawPayload: JSON.stringify({
          province: record.province,
          city: record.city,
          years: record.years,
          sourceUrl: record.sourceUrl ?? sourceUrl,
          rawText: record.rawText,
        }),
      },
    })

    imported += 1
  }

  return { imported, sourceUrl }
}
