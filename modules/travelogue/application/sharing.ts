import { createStore } from "zustand/vanilla"
import { operationId } from "./operation-id"
import type {
  ShareStatus,
  SharePreview,
  ShareWrite,
  ShareRevoke,
} from "@/modules/data-model/contracts/sharing"
import { RecordingApiError, type RecordingApi } from "../ports"
type Pending =
  | { kind: "publish"; input: ShareWrite }
  | { kind: "revoke"; input: ShareRevoke }
export function createSharingSession(
  journeyId: string,
  initialStatus: ShareStatus,
  initialPreview: SharePreview,
  api: RecordingApi
) {
  const state = createStore(() => ({
    status: initialStatus,
    preview: initialPreview,
    includeCosts: initialStatus.includeCosts,
    busy: false,
    loading: false,
    pending: null as Pending | null,
    error: "",
    notice: "",
  }))
  let previewRequest: AbortController | null = null
  const setLoading = (loading: boolean) => state.setState({ loading })
  const setError = (error: string) => state.setState({ error })
  const setPreview = (preview: SharePreview) => state.setState({ preview })
  const setStatus = (status: ShareStatus) => state.setState({ status })
  const setPending = (pending: Pending | null) => state.setState({ pending })
  const setNotice = (notice: string) => state.setState({ notice })
  const setBusy = (busy: boolean) => state.setState({ busy })
  async function loadPreview(value: boolean) {
    previewRequest?.abort()
    const controller = new AbortController()
    previewRequest = controller
    setLoading(true)
    setError("")
    try {
      const next = await api.sharePreview(journeyId, value, controller.signal)
      if (!controller.signal.aborted) setPreview(next)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "预览未能更新，请重试。"
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  async function refresh() {
    const { includeCosts } = state.getState()
    setError("")
    setLoading(true)
    try {
      const [current, next] = await Promise.all([
        api.shareStatus(journeyId),
        api.sharePreview(journeyId, includeCosts),
      ])
      setStatus(current)
      setPreview(next)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法刷新，请重试。")
      return false
    } finally {
      setLoading(false)
    }
  }
  const send = (mutation: Pending) =>
    mutation.kind === "publish"
      ? api.publishShare(journeyId, mutation.input)
      : api.revokeShare(journeyId, mutation.input)
  async function perform(mutation: Pending) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      setStatus(await send(mutation))
      setPending(null)
      setNotice(
        mutation.kind === "publish"
          ? "分享内容已发布。"
          : "已停止分享，原链接已失效。"
      )
    } catch (cause) {
      if (
        cause instanceof RecordingApiError &&
        (cause.status < 500 || cause.code === "STORAGE_UNAVAILABLE")
      ) {
        setPending(null)
        setError(cause.message)
        if (cause.status === 409 && (await refresh()))
          setNotice("旅程或分享已更新，请核对最新预览后再提交。")
      } else {
        // A failed response can hide a committed publication. Retain this exact
        // request until the server confirms it; never mint a replacement key.
        setPending(mutation)
        setError("操作结果尚未确认，请联网后确认上次操作。")
      }
    } finally {
      setBusy(false)
    }
  }
  async function confirmPending() {
    const { pending } = state.getState()
    if (!pending) return
    setBusy(true)
    setError("")
    try {
      const current = await api.shareStatus(journeyId)
      setStatus(current)
      if (
        current.lastMutationId === pending.input.idempotencyKey ||
        (pending.kind === "revoke" && !current.url)
      ) {
        setPending(null)
        setNotice(current.url ? "已确认分享发布成功。" : "已确认分享已停止。")
      } else if (current.version === pending.input.expectedShareVersion) {
        await perform(pending)
      } else {
        setPending(null)
        setNotice("分享状态已有变化，已载入当前状态，请检查预览后继续。")
        await refresh()
      }
    } catch {
      setError("暂时无法确认，请联网后再试。")
    } finally {
      setBusy(false)
    }
  }
  async function publish() {
    const { status, preview, includeCosts } = state.getState()
    await perform({
      kind: "publish",
      input: {
        expectedRevision: preview.revision,
        expectedShareVersion: status.version,
        includeCosts,
        idempotencyKey: operationId(),
      },
    })
  }

  return {
    getState: state.getState,
    subscribe: state.subscribe,
    refresh,
    publish,
    confirmPending,
    setNotice,
    changeCosts(value: boolean) {
      state.setState({ includeCosts: value })
      return loadPreview(value)
    },
    stop() {
      return perform({
        kind: "revoke",
        input: {
          expectedShareVersion: state.getState().status.version,
          idempotencyKey: operationId(),
        },
      })
    },
    dispose() {
      previewRequest?.abort()
    },
  }
}
