import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import LoginForm from "@/modules/auth/ui/LoginForm"
const { signIn, replace } = vi.hoisted(() => ({
  signIn: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("@/modules/auth/client", () => ({
  authClient: { signIn: { email: signIn } },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it.each([true, false])(
  "respects provider navigation while preserving ordinary login (redirect: %s)",
  async (redirect) => {
    const authenticated = vi.fn()
    signIn.mockResolvedValue({
      data: { redirect, url: redirect ? "/agent/authorize" : undefined },
      error: null,
    })
    render(
      <LoginForm onSwitchToRegister={vi.fn()} onAuthenticated={authenticated} />
    )
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "login@example.test" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "validation-password" },
    })
    fireEvent.click(screen.getByRole("button", { name: /^登录$/ }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^登录$/ })).not.toBeDisabled()
    )
    expect(authenticated).toHaveBeenCalledTimes(redirect ? 0 : 1)
    expect(replace).not.toHaveBeenCalled()
  }
)
