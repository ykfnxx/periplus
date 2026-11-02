import { z } from "zod"
import type { EventWeather } from "@/modules/data-model/contracts"
import { periplusServerConfig } from "@/config/periplus.server"
import { localWeatherTime, type WeatherInput } from "./weather-input"

const archiveSchema = z.object({
  hourly: z.object({
    time: z.array(z.number().finite()),
    temperature_2m: z.array(z.number().finite().nullable()),
    weather_code: z.array(z.number().int().min(0).max(99).nullable()),
  }),
})
const dateString = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export async function fetchEventWeather(
  input: WeatherInput,
  now = Date.now()
): Promise<EventWeather | null> {
  const today = localWeatherTime(now, input.timeZone).slice(0, 10)
  if (input.instant === null ? input.date >= today : input.instant > now)
    return null
  const day = Date.parse(`${input.date}T00:00:00Z`)
  const hour =
    input.instant === null
      ? null
      : Math.floor(input.instant / 3_600_000) * 3_600_000
  const url = new URL(periplusServerConfig.weather.archiveUrl)
  url.searchParams.set("latitude", String(input.latitude))
  url.searchParams.set("longitude", String(input.longitude))
  // Provider timezone boundaries ignore historical DST. Filter UTC hours with
  // the event's IANA zone instead of accepting an incorrectly bounded day.
  url.searchParams.set("start_date", dateString(hour ?? day - 86_400_000))
  url.searchParams.set("end_date", dateString(hour ?? day + 86_400_000))
  url.searchParams.set("hourly", "temperature_2m,weather_code")
  url.searchParams.set("timezone", "GMT")
  url.searchParams.set("timeformat", "unixtime")
  url.searchParams.set("temperature_unit", "celsius")
  if (periplusServerConfig.weather.apiKey)
    url.searchParams.set("apikey", periplusServerConfig.weather.apiKey)
  let response: Response
  let body: unknown
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(periplusServerConfig.weather.timeoutMs),
    })
    if (!response.ok) return null
    body = await response.json()
  } catch {
    // External availability never changes the success of a content save.
    return null
  }
  const parsed = archiveSchema.safeParse(body)
  if (!parsed.success) return null
  const {
    time,
    temperature_2m: temperatures,
    weather_code: codes,
  } = parsed.data.hourly
  if (
    time.length !== temperatures.length ||
    time.length !== codes.length ||
    time.some((value, index) => index > 0 && value - time[index - 1] !== 3600)
  )
    return null
  const selected = time
    .map((seconds, index) => ({
      instant: seconds * 1000,
      temperature: temperatures[index],
      code: codes[index],
    }))
    .filter((row) =>
      hour === null
        ? localWeatherTime(row.instant, input.timeZone).slice(0, 10) ===
          input.date
        : row.instant === hour
    )
  if (
    !selected.length ||
    selected.some((row) => row.temperature == null || row.code == null)
  )
    return null
  const base = {
    provider: "open-meteo" as const,
    fetchedAt: new Date().toISOString(),
  }
  if (hour !== null)
    return {
      ...base,
      precision: "HOURLY",
      matchedAt: new Date(hour).toISOString(),
      temperatureC: selected[0].temperature!,
      weatherCode: selected[0].code!,
    }
  // Require both adjacent local days so a truncated archive cannot masquerade
  // as a complete daily range; DST days may contain 23 or 25 hourly values.
  const first = time[0] * 1000,
    last = time[time.length - 1] * 1000
  if (
    localWeatherTime(first, input.timeZone).slice(0, 10) >= input.date ||
    localWeatherTime(last, input.timeZone).slice(0, 10) <= input.date
  )
    return null
  return {
    ...base,
    precision: "DAILY",
    weatherCode: Math.max(...selected.map((row) => row.code!)),
    temperatureMinC: Math.min(...selected.map((row) => row.temperature!)),
    temperatureMaxC: Math.max(...selected.map((row) => row.temperature!)),
  }
}
