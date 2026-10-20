import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import LandingGate from "@/modules/auth/ui/LandingGate"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock("@/modules/auth/client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}))

describe("LandingGate", () => {
  it("keeps login and registration inside the landing page", async () => {
    render(<LandingGate />)

    fireEvent.click(screen.getByRole("button", { name: "登录" }))
    expect(await screen.findByLabelText("邮箱")).toBeInTheDocument()
    expect(screen.getByLabelText("密码")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "注册" }))
    expect(await screen.findByLabelText("名称")).toBeInTheDocument()
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument()
  })
})
