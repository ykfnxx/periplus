import { createStore } from "zustand/vanilla"
import type {
  JourneyMember,
  JourneyInvitation,
  JourneyInvitationCreated,
} from "@/modules/data-model/contracts/collaboration"
import type { RecordingApi } from "../ports"
export function createMembersSession(
  journeyId: string,
  owner: boolean,
  api: Pick<
    RecordingApi,
    "members" | "invitations" | "invite" | "revokeInvitation"
  >
) {
  const state = createStore(() => ({
    members: null as JourneyMember[] | null,
    invitations: [] as JourneyInvitation[],
    created: null as JourneyInvitationCreated | null,
    loading: true,
    busy: false,
    error: null as string | null,
    nowMs: 0,
  }))
  let generation = 0
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    dispose() {
      generation++
    },
    async load() {
      const request = ++generation
      state.setState({ loading: true, error: null })
      try {
        const [result, links] = await Promise.all([
          api.members(journeyId),
          owner
            ? api.invitations(journeyId)
            : Promise.resolve({ invitations: [] }),
        ])
        if (request === generation)
          state.setState({
            members: result.members,
            invitations: links.invitations,
            nowMs: Date.now(),
          })
      } catch (cause) {
        if (request === generation)
          state.setState({
            error:
              cause instanceof Error
                ? cause.message
                : "同行者读取失败，请重试。",
          })
      } finally {
        if (request === generation) state.setState({ loading: false })
      }
    },
    async create() {
      state.setState({ busy: true, error: null })
      try {
        const created = state.getState().created
        if (created) return created
        const result = await api.invite(journeyId)
        state.setState(({ invitations }) => ({
          created: result,
          invitations: [result.invitation, ...invitations],
        }))
        return result
      } catch (cause) {
        state.setState({
          error:
            cause instanceof Error ? cause.message : "邀请创建失败，请重试。",
        })
      } finally {
        state.setState({ busy: false })
      }
    },
    async revoke(id: string) {
      state.setState({ busy: true, error: null })
      try {
        await api.revokeInvitation(journeyId, id)
        state.setState(({ invitations, created }) => ({
          invitations: invitations.map((item) =>
            item.id === id
              ? { ...item, revokedAt: new Date().toISOString() }
              : item
          ),
          created: created?.invitation.id === id ? null : created,
        }))
        return true
      } catch (cause) {
        state.setState({
          error: cause instanceof Error ? cause.message : "撤销失败，请重试。",
        })
        return false
      } finally {
        state.setState({ busy: false })
      }
    },
  }
}
