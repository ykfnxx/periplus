import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"

export class JourneyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "JourneyApiError"
  }
}

async function parseJourneyResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "行程请求失败"
    throw new JourneyApiError(message, response.status)
  }
  return body as T
}

export async function listJourneys() {
  const response = await fetch("/api/journeys", { cache: "no-store" })
  return parseJourneyResponse<TargetJourneyGraphSnapshot[]>(response)
}

export async function getJourney(id: string) {
  const response = await fetch(`/api/journeys/${id}`, { cache: "no-store" })
  return parseJourneyResponse<TargetJourneyGraphSnapshot>(response)
}
