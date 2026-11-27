import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import InkLanding from "@/modules/auth/ui/InkLanding"
it("links to standalone auth pages and lets readers explore the sample journey", () => {
  render(<InkLanding />)
  expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
    "href",
    "/login"
  )
  expect(screen.getByRole("link", { name: "受邀注册" })).toHaveAttribute(
    "href",
    "/register"
  )
  fireEvent.click(screen.getByRole("button", { name: "龙井山房" }))
  expect(screen.getByRole("heading", { name: "龙井山房一盏茶" })).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "公开长文分享" }))
  expect(screen.getByRole("heading", { name: "江南春雨四日" })).toBeVisible()
})
