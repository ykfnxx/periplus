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
    runId: role === 'assistant' ? 'run-1' : null,
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
  })
})
