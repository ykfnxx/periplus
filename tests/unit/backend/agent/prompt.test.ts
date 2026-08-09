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
  it("separates history and latest request in the versioned Auto protocol", () => {
    const prompt = buildPrompt([
      message("user", "规划新疆路线"),
      message("assistant", "可以，第一版已规划。"),
      message("user", "把喀纳斯提前"),
      message("assistant", ""),
    ])

    expect(prompt).toContain('<PERIPLUS_AUTO_PROTOCOL version="2">')
    expect(prompt).toContain("[CONVERSATION_HISTORY]")
    expect(prompt).toContain("[LATEST_USER_REQUEST]")
    expect(prompt).toContain("用户：\n规划新疆路线")
    expect(prompt).toContain("Agent：\n可以，第一版已规划。")
    expect(prompt).toContain("用户：\n把喀纳斯提前")
    expect(prompt.indexOf("把喀纳斯提前")).toBeGreaterThan(
      prompt.indexOf("[LATEST_USER_REQUEST]")
    )
    expect(prompt.slice(prompt.indexOf("[LATEST_USER_REQUEST]"))).not.toContain(
      "Agent："
    )
    expect(prompt).toContain("Root Scope：CITY 与跨城 TRANSIT")
    expect(prompt).toContain("periplus.hotel.search")
    expect(prompt).toContain("periplus.draft.add_place_card")
    expect(prompt).toContain("periplus.draft.validate")
    expect(prompt).toContain("periplus.draft.prepare_transit")
    expect(prompt).toContain("periplus.draft.commit")
    expect(prompt).toContain("periplus.journey.validate_current")
    expect(prompt).toContain("最多 5 次")
    expect(prompt).not.toContain("validate_draft")
    expect(prompt).not.toContain("command DSL。\n\n完整对话")
  })

  it("keeps validation execution out of suggest mode", () => {
    const prompt = buildPrompt([message("user", "给出路线建议")], "suggest")

    expect(prompt).toContain('<PERIPLUS_SUGGEST_PROTOCOL version="2">')
    expect(prompt).toContain("[WORKSPACE_SNAPSHOT]")
    expect(prompt).not.toContain("STAGE 05 OPEN_DRAFT")
    expect(prompt).not.toContain("periplus.draft.commit")
  })
})
