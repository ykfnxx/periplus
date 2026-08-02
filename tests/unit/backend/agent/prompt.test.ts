import { describe, expect, it } from "vitest"
import { buildPrompt } from "@/backend/agent/prompt"
import type { AgentConversationMessage } from "@/backend/types"

function message(
  role: AgentConversationMessage["role"],
  content: string
): AgentConversationMessage {
  return {
    id: `message-${role}-${content}`,
    role,
    content,
    runId: role === "assistant" ? "run-1" : null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  }
}

describe("buildPrompt", () => {
  it("includes the complete conversation before the latest user request", () => {
    const prompt = buildPrompt([
      message("user", "规划新疆路线"),
      message("assistant", "可以，第一版已规划。"),
      message("user", "把喀纳斯提前"),
    ])

    expect(prompt).toContain("完整对话：")
    expect(prompt).toContain("用户：\n规划新疆路线")
    expect(prompt).toContain("Agent：\n可以，第一版已规划。")
    expect(prompt).toContain("用户：\n把喀纳斯提前")
    expect(prompt).toContain("只执行最后一条用户需求")
    expect(prompt).toContain("Root Scope 必须由 CITY 与跨城 TRANSIT 交替组成")
    expect(prompt).toContain("不得创建 DAY Section")
    expect(prompt).toContain("当前版本不得主动创建 STAY")
    expect(prompt).toContain("periplus.workspace.validate_plan")
  })

  it("keeps validation execution out of suggest mode", () => {
    const prompt = buildPrompt([message("user", "给出路线建议")], "suggest")

    expect(prompt).toContain("不得创建 DAY Section")
    expect(prompt).not.toContain("完成全部修改后必须调用")
  })
})
