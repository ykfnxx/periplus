import type {
  CreateProposalRequest,
  PlanningApiError,
  PlanningApplyReceipt,
  PlanningProposalView,
  PlanningStarted,
  ProposalTurnRequest,
} from "../contracts"

export class PlanningRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: PlanningApiError["code"] | undefined
  ) {
    super(message)
    this.name = "PlanningRequestError"
  }
}

async function request<T>(
  journeyId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(
    `/api/journeys/${encodeURIComponent(journeyId)}/planning/proposals${path}`,
    { cache: "no-store", ...init }
  )
  if (response.ok) return response.json()
  const body = await response.json().catch(() => null)
  throw new PlanningRequestError(
    body?.error || "规划请求失败，请重试。",
    response.status,
    body?.code
  )
}
const post = (body?: object): RequestInit => ({
  method: "POST",
  ...(body
    ? {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    : {}),
})
const path = (id: string) => `/${encodeURIComponent(id)}`

export const planningApi = {
  create: (journeyId: string, input: CreateProposalRequest) =>
    request<PlanningStarted>(journeyId, "", post(input)),
  get: (journeyId: string, id: string, signal?: AbortSignal) =>
    request<PlanningProposalView>(journeyId, path(id), { signal }),
  turn: (journeyId: string, id: string, input: ProposalTurnRequest) =>
    request<Pick<PlanningStarted, "runId">>(
      journeyId,
      `${path(id)}/turns`,
      post(input)
    ),
  cancel: (journeyId: string, id: string, runId: string) =>
    request<unknown>(
      journeyId,
      `${path(id)}/runs/${encodeURIComponent(runId)}/cancel`,
      post()
    ),
  discard: (journeyId: string, id: string, version: number) =>
    request<unknown>(journeyId, `${path(id)}/discard`, post({ version })),
  apply: (journeyId: string, id: string, version: number) =>
    request<PlanningApplyReceipt>(
      journeyId,
      `${path(id)}/apply`,
      post({ version })
    ),
}
export type PlanningApi = typeof planningApi
