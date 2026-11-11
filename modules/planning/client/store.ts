import { createStore } from "zustand/vanilla"
import { operationId } from "@/modules/travelogue/data/operation-id"
import type {
  CreateProposalRequest,
  PlanningApplyReceipt,
  PlanningProposalView,
  ProposalTurnRequest,
} from "../contracts"
import { planningApi, PlanningRequestError, type PlanningApi } from "./api"

type Pending =
  | { kind: "create"; input: CreateProposalRequest }
  | { kind: "turn"; proposalId: string; input: ProposalTurnRequest }
  | { kind: "cancel"; proposalId: string; runId: string }
  | { kind: "discard" | "apply"; proposalId: string; version: number }

interface PlanningState {
  proposalId: string | null
  proposal: PlanningProposalView | null
  receipt: PlanningApplyReceipt | null
  loading: boolean
  busy: boolean
  readFailed: boolean
  error: string | null
  needsRebase: boolean
  pending: Pending | null
  sent: { id: string; message: string }[]
  load: () => Promise<void>
  send: (message: string, choiceRef?: string) => Promise<boolean>
  rebase: () => Promise<boolean>
  cancel: () => Promise<boolean>
  discard: (version: number) => Promise<boolean>
  apply: (version: number) => Promise<boolean>
  retry: () => Promise<boolean>
  dispose: () => void
}

export function createPlanningStore(
  journeyId: string,
  initialId: string | null,
  api: PlanningApi = planningApi
) {
  let readController: AbortController | null = null
  const store = createStore<PlanningState>((set, get) => ({
    proposalId: initialId,
    proposal: null,
    receipt: null,
    loading: Boolean(initialId),
    busy: false,
    readFailed: false,
    error: null,
    needsRebase: false,
    pending: null,
    sent: [],
    load: () => load(),
    dispose: () => readController?.abort(),
    send: (message, choiceRef) => {
      const { proposal, proposalId } = get()
      if (!proposalId)
        return perform({
          kind: "create",
          input: { requestId: operationId(), message },
        })
      if (!proposal) return Promise.resolve(false)
      return perform({
        kind: "turn",
        proposalId,
        input: {
          requestId: operationId(),
          parentVersion: proposal.latestVersion,
          message,
          ...(proposal.question
            ? { replyToRunId: proposal.question.runId }
            : {}),
          ...(choiceRef ? { choiceRef } : {}),
        },
      })
    },
    rebase: () => {
      const { proposal, proposalId } = get()
      if (!proposal || !proposalId) return Promise.resolve(false)
      return perform({
        kind: "turn",
        proposalId,
        input: {
          requestId: operationId(),
          parentVersion: proposal.latestVersion,
          message: "请保留当前要求，基于最新旅程重新预演。",
          mode: "rebase",
        },
      })
    },
    cancel: () => {
      const proposal = get().proposal
      if (!proposal?.run) return Promise.resolve(false)
      return perform({
        kind: "cancel",
        proposalId: proposal.proposalId,
        runId: proposal.run.runId,
      })
    },
    discard: (version) => {
      const id = get().proposalId
      return id
        ? perform({ kind: "discard", proposalId: id, version })
        : Promise.resolve(false)
    },
    apply: (version) => {
      const id = get().proposalId
      return id
        ? perform({ kind: "apply", proposalId: id, version })
        : Promise.resolve(false)
    },
    retry: () =>
      get().pending
        ? perform(get().pending!, true)
        : load().then(() => !get().readFailed),
  }))

  async function load(preserveError = false) {
    const id = store.getState().proposalId
    if (!id) return
    readController?.abort()
    const controller = new AbortController()
    readController = controller
    store.setState({ loading: true })
    try {
      const proposal = await api.get(journeyId, id, controller.signal)
      if (controller.signal.aborted) return
      store.setState((state) => {
        const applied =
          state.pending?.kind === "apply" &&
          proposal.receipt?.version === state.pending.version
        return {
          proposal,
          receipt: proposal.receipt,
          pending: applied ? null : state.pending,
          readFailed: false,
          error: applied ? null : preserveError ? state.error : null,
          needsRebase:
            proposal.status === "OPEN" &&
            (proposal.baseRevision !== proposal.currentJourneyRevision ||
              // A rejected commit remains blocked until a different preview is read.
              (state.needsRebase &&
                state.proposal?.latestVersion === proposal.latestVersion &&
                state.proposal.baseRevision === proposal.baseRevision)),
        }
      })
    } catch (cause) {
      if (controller.signal.aborted) return
      store.setState({
        readFailed: true,
        error:
          cause instanceof TypeError
            ? "网络连接中断，无法读取规划，请重试。"
            : cause instanceof Error
              ? cause.message
              : "无法读取规划，请重试。",
        ...(cause instanceof PlanningRequestError && cause.status === 404
          ? { proposal: null }
          : {}),
      })
    } finally {
      if (!controller.signal.aborted) store.setState({ loading: false })
    }
  }

  async function perform(action: Pending, retry = false): Promise<boolean> {
    const state = store.getState()
    if (state.busy || (!retry && state.pending)) return false
    readController?.abort()
    store.setState({ busy: true, loading: false, error: null })
    try {
      if (action.kind === "create") {
        const started = await api.create(journeyId, action.input)
        store.setState({ proposalId: started.proposalId })
      } else if (action.kind === "turn") {
        await api.turn(journeyId, action.proposalId, action.input)
      } else if (action.kind === "cancel") {
        await api.cancel(journeyId, action.proposalId, action.runId)
      } else if (action.kind === "discard") {
        await api.discard(journeyId, action.proposalId, action.version)
      } else {
        // The confirmed version stays pinned across retries; never substitute
        // a later preview after an uncertain response or a conflict.
        const receipt = await api.apply(
          journeyId,
          action.proposalId,
          action.version
        )
        store.setState({ receipt })
      }
      store.setState((current) => ({
        pending: null,
        sent:
          action.kind === "create" || action.kind === "turn"
            ? current.sent.some(
                (message) => message.id === action.input.requestId
              )
              ? current.sent
              : [
                  ...current.sent,
                  { id: action.input.requestId, message: action.input.message },
                ]
            : current.sent,
      }))
      await load()
      return true
    } catch (cause) {
      if (cause instanceof PlanningRequestError && cause.status < 500) {
        store.setState({ pending: null, error: cause.message })
        if (cause.status === 409 || cause.code === "PREVIEW_REQUIRED")
          await load(true)
        if (
          cause.code === "PREVIEW_REQUIRED" &&
          action.kind === "apply" &&
          store.getState().proposal?.latestVersion === action.version
        )
          store.setState({ needsRebase: true })
      } else {
        // An absent response does not prove that the server rejected the write.
        // Keep the exact request for explicit retry, including its requestId.
        store.setState({
          pending: action,
          error: "操作结果尚未确认，请重试原请求。",
        })
      }
      return false
    } finally {
      store.setState({ busy: false })
    }
  }
  return store
}
export type PlanningStore = ReturnType<typeof createPlanningStore>
