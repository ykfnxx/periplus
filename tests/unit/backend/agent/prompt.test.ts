import { describe, expect, it } from "vitest"
import { buildPrompt } from "@/backend/agent/prompt"

describe("buildPrompt", () => {
  it("defines the AUTO-only protocol around the effective context and hidden trust fields", () => {
    const prompt = buildPrompt()

    expect(prompt).toContain('<PERIPLUS_AUTO_PROTOCOL version="3">')
    expect(prompt).not.toContain("[CONVERSATION_HISTORY]")
    expect(prompt).not.toContain("[LATEST_USER_REQUEST]")
    expect(prompt).toContain("[STAGE_01 READ_EFFECTIVE_CONTEXT]")
    expect(prompt).toContain("[STAGE_02 PLAN_CARD_CHAIN]")
    expect(prompt).toContain("Root 是 CITY 与跨城 TRANSIT")
    expect(prompt).toContain("periplus__hotel__search")
    expect(prompt).toContain("web_search")
    expect(prompt).toContain("periplus__placeEvent__add")
    expect(prompt).toContain("periplus__draft__validate")
    expect(prompt).toContain("periplus__draft__prepare_transit")
    expect(prompt).toContain("periplus__draft__commit")
    expect(prompt).not.toMatch(/periplus\.[a-z_]+/)
    expect(prompt).toContain("最多 5 次")
    expect(prompt).toContain("draftId 不可见")
    expect(prompt).toContain("不得中途向用户追问")
    expect(prompt).not.toContain("periplus__place__fallback")
    expect(prompt).not.toContain("periplus__journey__validate_current")
    expect(prompt).not.toContain("SUGGEST")
  })
})
