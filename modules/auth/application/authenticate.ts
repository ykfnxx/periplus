import type { AuthApi } from "../ports"

export async function authenticate(
  api: AuthApi,
  input:
    | { mode: "login"; email: string; password: string }
    | { mode: "register"; name: string; email: string; password: string }
) {
  const result =
    input.mode === "login"
      ? await api.login({
          email: input.email,
          password: input.password,
          rememberMe: true,
        })
      : await api.register({
          name: input.name,
          email: input.email,
          password: input.password,
        })
  if (result.error)
    throw new Error(
      result.error.message || (input.mode === "login" ? "登录失败" : "注册失败")
    )
  return { redirecting: result.data?.redirect === true }
}
