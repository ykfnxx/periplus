import { normalizeInviteCode } from "../model/invite-code"
import type { AuthApi } from "../ports"

export async function authenticate(
  api: AuthApi,
  input:
    | { mode: "login"; email: string; password: string }
    | {
        mode: "register"
        name: string
        email: string
        password: string
        inviteCode?: string
        journeyInvitationToken?: string
      }
) {
  const inviteCode =
    input.mode === "register" ? normalizeInviteCode(input.inviteCode ?? "") : ""
  if (input.mode === "register" && !input.journeyInvitationToken) {
    if (!inviteCode) throw new Error("请填写邀请码。")
    if (!/^PERI-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inviteCode))
      throw new Error("邀请码格式不正确，请核对后重试。")
  }
  const result =
    input.mode === "login"
      ? await api.login({
          email: input.email,
          password: input.password,
          rememberMe: true,
        })
      : await api.register({
          name: input.name,
          inviteCode,
          journeyInvitationToken: input.journeyInvitationToken,
          email: input.email,
          password: input.password,
        })
  if (result.error)
    throw new Error(
      result.error.message || (input.mode === "login" ? "登录失败" : "注册失败")
    )
  return { redirecting: result.data?.redirect === true }
}
