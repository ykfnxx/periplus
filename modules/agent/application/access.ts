import { createStore } from "zustand/vanilla"
import type { AgentAccessApi } from "../ports"
import type { AgentGrant } from "../contracts"
export function createGrantSession(
  journeyId: string,
  grants: AgentGrant[],
  api: AgentAccessApi
) {
  const state = createStore(() => ({
    grants,
    busy: null as string | null,
    error: null as string | null,
  }))
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    async revoke(id: string) {
      state.setState({ busy: id, error: null })
      try {
        await api.revoke(journeyId, id)
        state.setState(({ grants }) => ({
          grants: grants.map((grant) =>
            grant.id === id
              ? { ...grant, revokedAt: new Date().toISOString() }
              : grant
          ),
        }))
      } catch (cause) {
        state.setState({
          error: cause instanceof Error ? cause.message : "撤销失败，请重试。",
        })
      } finally {
        state.setState({ busy: null })
      }
    },
  }
}
