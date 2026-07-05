import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import SettingsPanel from "@/components/map/SettingsPanel"
import { authClient } from "@/lib/auth-client"

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
  },
}))

describe("SettingsPanel", () => {
  it("signs out and returns to landing page", async () => {
    const replace = vi.fn()
    const refresh = vi.fn()
    ;(useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      replace,
      refresh,
    })
    ;(
      authClient.signOut as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ error: null })

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }))

    expect(screen.getByRole("button", { name: "退出中..." })).toBeDisabled()
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled())
    expect(replace).toHaveBeenCalledWith("/")
    expect(refresh).toHaveBeenCalled()
  })
})
