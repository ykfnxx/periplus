export const AGENT_RUN_STAGES = [
  "UNDERSTANDING",
  "VERIFYING_PLACES",
  "CHECKING_ROUTE",
  "COMMITTING",
] as const

export type AgentRunStage = (typeof AGENT_RUN_STAGES)[number]

const STAGE_LABELS: Record<AgentRunStage, string> = {
  UNDERSTANDING: "正在理解你的需求",
  VERIFYING_PLACES: "正在确认城市与地点",
  CHECKING_ROUTE: "正在检查路线是否可行",
  COMMITTING: "正在更新行程",
}

export function agentRunStageLabel(stage: AgentRunStage | null) {
  return stage ? STAGE_LABELS[stage] : "正在规划行程"
}

export function agentRunStageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const stage = (payload as Record<string, unknown>).stage
  return AGENT_RUN_STAGES.find((candidate) => candidate === stage) ?? null
}
