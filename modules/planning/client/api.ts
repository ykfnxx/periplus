import type {
  CreateProposalRequest,
  PlanningApiError,
  PlanningApplyReceipt,
  PlanningProposalView,
  PlanningStarted,
  ProposalTurnRequest,
} from "../contracts"

const errorLabels: Record<PlanningApiError["code"], string> = {
  INVALID_INPUT: "请求内容未通过校验，请检查输入后重试。",
  NOT_FOUND: "这份提案不存在，或你已无法访问。",
  FORBIDDEN: "当前账号没有操作权限，请检查登录状态和旅程权限。",
  IDEMPOTENCY_CONFLICT: "上次请求与当前内容不一致，请重新读取规划。",
  RUN_ACTIVE: "本轮仍在生成，请等待完成或取消本轮。",
  PROPOSAL_VERSION_CONFLICT: "预览已有新版本，请重新核对并确认。",
  PROPOSAL_CLOSED: "这份提案已经结束，请查看当前结果。",
  REVISION_CONFLICT: "旅程已有其他修改，请基于最新旅程重新预演。",
  PREVIEW_REQUIRED: "待应用内容已变化，需要重新预演并确认。",
  EMPTY_DIFF: "当前没有可应用的事件变更。",
  RUNTIME_UNAVAILABLE: "规划服务暂时不可用，请稍后重试。",
  RUN_FAILED: "本轮规划未完成，上一版预览保留。",
}

export function planningErrorText(error: PlanningApiError) {
  return errorLabels[error.code] || error.error
}

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
  const body: PlanningApiError | null = await response.json().catch(() => null)
  throw new PlanningRequestError(
    body
      ? planningErrorText(body)
      : `规划请求失败（HTTP ${response.status}），请重试。`,
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
