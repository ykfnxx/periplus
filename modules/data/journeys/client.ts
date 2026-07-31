import type {
  CreateJourneyInput,
  JourneyDto,
  UpdateJourneyInput,
} from "@/types/journey"
import type {
  TransitPlanBundle,
  TransitPlanFailure,
  TransitPlanRequest,
} from "@/lib/journeys/planning"

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

export async function listJourneys(): Promise<JourneyDto[]> {
  const response = await fetch("/api/journeys", { cache: "no-store" })
  return parseJourneyResponse<JourneyDto[]>(response)
}

export async function getJourney(id: string): Promise<JourneyDto> {
  const response = await fetch(`/api/journeys/${id}`, { cache: "no-store" })
  return parseJourneyResponse<JourneyDto>(response)
}

export async function createJourney(input: CreateJourneyInput) {
  const response = await fetch("/api/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return parseJourneyResponse<JourneyDto>(response)
}

export async function updateJourney(
  id: string,
  input: UpdateJourneyInput,
  expectedRevision: number
) {
  const response = await fetch(`/api/journeys/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": String(expectedRevision),
    },
    body: JSON.stringify(input),
  })
  return parseJourneyResponse<JourneyDto>(response)
}

export async function resolveTransitPlans(requests: TransitPlanRequest[]) {
  const response = await fetch("/api/transit/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  })
  return parseJourneyResponse<{
    bundles: TransitPlanBundle[]
    failures: TransitPlanFailure[]
  }>(response)
}
