import { describe, expect, it } from "vitest"
import { buildPrompt } from "@/backend/agent/prompt"

describe("buildPrompt", () => {
  it("defines the Auto protocol without duplicating persisted conversation", () => {
    const prompt = buildPrompt()

    expect(prompt).toContain('<PERIPLUS_AUTO_PROTOCOL version="2">')
    expect(prompt).not.toContain("[CONVERSATION_HISTORY]")
    expect(prompt).not.toContain("[LATEST_USER_REQUEST]")
    expect(prompt).toContain("Root Scope：CITY 与跨城 TRANSIT")
    expect(prompt).toContain("periplus__hotel__search")
    expect(prompt).toContain("WebSearch")
    expect(prompt).toContain("web_search")
    expect(prompt).toContain("periplus__place__fallback")
    expect(prompt).toContain("fallbackAllowed=true")
    expect(prompt).toContain("UNVERIFIED")
    expect(prompt).toContain("禁止调用文件读取")
    expect(prompt).toContain("periplus__draft__add_place_card")
    expect(prompt).toContain("periplus__draft__validate")
    expect(prompt).toContain("periplus__draft__prepare_transit")
    expect(prompt).toContain("periplus__draft__commit")
    expect(prompt).toContain("periplus__journey__validate_current")
    expect(prompt).not.toMatch(/periplus\.[a-z_]+/)
    expect(prompt).toContain("最多 5 次")
    expect(prompt).not.toContain("validate_draft")
    expect(prompt).not.toContain("requireExact")
    expect(prompt).not.toContain("command DSL。\n\n完整对话")
  })

  it("keeps validation execution out of suggest mode", () => {
    const prompt = buildPrompt("suggest")

    expect(prompt).toContain('<PERIPLUS_SUGGEST_PROTOCOL version="2">')
    expect(prompt).toContain("[WORKSPACE_SNAPSHOT]")
    expect(prompt).not.toContain("STAGE 05 OPEN_DRAFT")
    expect(prompt).not.toContain("periplus__draft__commit")
  })
})
