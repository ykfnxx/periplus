import { RecordingApiError, type RecordingApi } from "../ports"
export function createInvitationActions(
  token: string,
  api: Pick<RecordingApi, "invitation" | "acceptInvitation">
) {
  return {
    async load() {
      try {
        return await api.invitation(token)
      } catch (cause) {
        throw new Error(
          cause instanceof RecordingApiError && cause.status === 404
            ? "邀请已过期或被撤销，请联系作者获取新链接。"
            : "邀请暂时无法读取，请重试。"
        )
      }
    },
    async accept() {
      try {
        return {
          kind: "joined" as const,
          ...(await api.acceptInvitation(token)),
        }
      } catch (cause) {
        if (cause instanceof RecordingApiError && cause.status === 401)
          return { kind: "login" as const }
        throw new Error(
          cause instanceof RecordingApiError && cause.status === 404
            ? "邀请已过期或被撤销，请联系作者获取新链接。"
            : "加入失败，请重试。"
        )
      }
    },
  }
}
