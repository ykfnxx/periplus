import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import LoginForm from "@/modules/auth/ui/LoginForm"
import FilePreview from "@/modules/travelogue/ui/photos/FilePreview"
import ReceiptImport from "@/modules/travelogue/ui/receipts/ReceiptImport"
import GrantList from "@/modules/agent/ui/GrantList"

afterEach(() => vi.restoreAllMocks())
it("renders and submits a login form without importing authentication or server configuration", () => {
  const submit = vi.fn((event) => event.preventDefault())
  render(
    <LoginForm
      email="preview@example.test"
      password="preview-password"
      error="邮箱或密码不正确"
      isSubmitting={false}
      setEmail={vi.fn()}
      setPassword={vi.fn()}
      handleSubmit={submit}
      onSwitchToRegister={vi.fn()}
    />
  )
  expect(screen.getByRole("alert")).toHaveTextContent("邮箱或密码不正确")
  fireEvent.click(screen.getByRole("button", { name: "登录" }))
  expect(submit).toHaveBeenCalledOnce()
})
it("owns object URLs only for the lifetime of the rendered file", () => {
  const create = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:first")
    .mockReturnValueOnce("blob:second")
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const first = new File(["a"], "a.jpg")
  const second = new File(["b"], "b.jpg")
  const view = render(<FilePreview file={first} />)
  view.rerender(<FilePreview file={first} className="opacity-60" />)
  expect(create).toHaveBeenCalledOnce()
  view.rerender(<FilePreview file={second} />)
  expect(revoke).toHaveBeenCalledWith("blob:first")
  view.unmount()
  expect(revoke).toHaveBeenCalledWith("blob:second")
})
it("shows receipt recovery and edits supplied data without a network service", () => {
  const change = vi.fn()
  render(
    <ReceiptImport
      file={null}
      review={{
        assetId: "receipt",
        values: {
          merchant: "湖畔餐馆",
          date: "",
          currency: "CNY",
          total: "128.00",
          items: [],
        },
      }}
      busy={null}
      error="识别失败，可以手动填写。"
      events={[]}
      onChoose={vi.fn()}
      onChange={change}
      onRecognize={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />
  )
  expect(screen.getByRole("alert")).toHaveTextContent("手动填写")
  fireEvent.change(screen.getByDisplayValue("湖畔餐馆"), {
    target: { value: "更正商家" },
  })
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({ merchant: "更正商家" })
  )
})
it("delegates grant revocation without fetching from the component", () => {
  const revoke = vi.fn()
  render(
    <GrantList
      grants={[
        {
          id: "g1",
          clientName: "Client",
          userName: "Owner",
          scopes: ["journey:read"],
          expiresAt: "2030-01-01T00:00:00Z",
          revokedAt: null,
          lastUsedAt: null,
        },
      ]}
      now={0}
      resource="example"
      busy={null}
      error={null}
      revoke={revoke}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "撤销" }))
  expect(revoke).toHaveBeenCalledWith("g1")
})
