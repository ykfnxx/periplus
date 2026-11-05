"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, Copy } from "lucide-react"
import type {
  SharePreview,
  ShareRevoke,
  ShareStatus,
  ShareWrite,
} from "@/modules/data-model/contracts/sharing"
import { Button } from "@/components/kumo/components/button/button"
import { recordingApi, RecordingApiError } from "../data/client"
import { useConfirmation } from "../ui/workbench/Modal"
import SharedJourneyDocument from "./SharedJourneyDocument"

type Pending =
  | { kind: "publish"; input: ShareWrite }
  | { kind: "revoke"; input: ShareRevoke }
export default function ShareManager({
  journeyId,
  initialStatus,
  initialPreview,
  returnHref,
}: {
  journeyId: string
  initialStatus: ShareStatus
  initialPreview: SharePreview
  returnHref: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [preview, setPreview] = useState(initialPreview)
  const [includeCosts, setIncludeCosts] = useState(initialStatus.includeCosts)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const previewRequest = useRef<AbortController | null>(null)
  const link = useRef<HTMLInputElement>(null)
  const { ask, confirmation } = useConfirmation()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      previewRequest.current?.abort()
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  async function loadPreview(value: boolean) {
    previewRequest.current?.abort()
    const controller = new AbortController()
    previewRequest.current = controller
    setLoading(true)
    setError("")
    try {
      const next = await recordingApi.sharePreview(
        journeyId,
        value,
        controller.signal
      )
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
    setError("")
    setLoading(true)
    try {
      const [current, next] = await Promise.all([
        recordingApi.shareStatus(journeyId),
        recordingApi.sharePreview(journeyId, includeCosts),
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
      ? recordingApi.publishShare(journeyId, mutation.input)
      : recordingApi.revokeShare(journeyId, mutation.input)
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
    if (!pending) return
    setBusy(true)
    setError("")
    try {
      const current = await recordingApi.shareStatus(journeyId)
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
    await perform({
      kind: "publish",
      input: {
        expectedRevision: preview.revision,
        expectedShareVersion: status.version,
        includeCosts,
        idempotencyKey: crypto.randomUUID(),
      },
    })
  }
  async function stop() {
    if (
      await ask("原链接将无法打开，旅程和照片会保留。", {
        title: "停止分享这篇游记？",
        cancelLabel: "继续分享",
        confirmLabel: "停止分享",
      })
    )
      await perform({
        kind: "revoke",
        input: {
          expectedShareVersion: status.version,
          idempotencyKey: crypto.randomUUID(),
        },
      })
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(status.url!)
      setNotice("分享链接已复制。")
    } catch {
      link.current?.focus()
      link.current?.select()
      setNotice("请手动复制已选中的分享链接。")
    }
  }
  const blocked = busy || loading || !online || !!pending
  return (
    <main className="share-management">
      <header className="share-management-heading">
        <Link className="share-back" href={returnHref} aria-label="返回旅程">
          <ArrowLeft size={20} />
        </Link>
        <h1>分享旅程</h1>
      </header>
      <div className="share-management-layout">
        <aside
          className="share-settings"
          aria-label="分享设置"
          aria-busy={busy || loading}
        >
          {status.url ? (
            <>
              <p className="share-published">
                <Check size={18} />
                分享页已生成
              </p>
              <h2>把这段旅程分享出去</h2>
              <label className="share-link-label">
                分享链接
                <input
                  ref={link}
                  readOnly
                  value={status.url}
                  aria-label="分享链接"
                />
              </label>
              <div className="share-buttons">
                <Button
                  className="share-action share-emphasis"
                  variant="primary"
                  onClick={copy}
                >
                  <Copy size={17} />
                  复制链接
                </Button>
                <a
                  className="share-action"
                  href={status.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看分享页
                </a>
              </div>
              <p className="share-disclosure">任何获得链接的人都可查看。</p>
              <div className="share-management-divider">
                <h3>更新分享内容</h3>
                <p className="share-disclosure">
                  预览为当前已保存内容，更新成功前原分享页保持不变。
                </p>
              </div>
            </>
          ) : (
            <>
              <h2>{status.revokedAt ? "重新分享这段旅程" : "分享整个旅程"}</h2>
              <p className="share-disclosure">
                生成一篇可直接打开的长页，朋友无需登录。
              </p>
              <p className="share-summary">
                {preview.document.events.length}条记录 ·{" "}
                {preview.document.events.reduce(
                  (sum, event) => sum + event.photos.length,
                  0
                )}
                张照片
              </p>
            </>
          )}
          <label className="share-cost-setting">
            <span>显示花费</span>
            <input
              type="checkbox"
              checked={includeCosts}
              disabled={busy || !!pending}
              onChange={(event) => {
                setIncludeCosts(event.target.checked)
                void loadPreview(event.target.checked)
              }}
            />
          </label>
          {!online && (
            <p className="share-message" role="status">
              当前离线。连接网络后可生成或更新分享页。
            </p>
          )}
          {loading && (
            <p className="share-disclosure" role="status">
              正在更新预览…
            </p>
          )}
          {error && (
            <div className="share-message" role="alert">
              <p>{error}</p>
              {!pending && (
                <Button
                  variant="ghost"
                  className="share-action"
                  disabled={blocked}
                  onClick={refresh}
                >
                  刷新预览
                </Button>
              )}
            </div>
          )}
          {notice && (
            <p className="share-notice" role="status">
              {notice}
            </p>
          )}
          {pending ? (
            <Button
              variant="primary"
              className="share-action share-primary"
              disabled={busy || !online}
              onClick={confirmPending}
            >
              确认上次操作
            </Button>
          ) : (
            <Button
              variant="primary"
              className="share-action share-primary"
              disabled={
                blocked ||
                !!error ||
                preview.includeCosts !== includeCosts ||
                !preview.document.events.length
              }
              onClick={publish}
            >
              {busy ? "正在保存…" : status.url ? "更新分享页" : "生成分享链接"}
            </Button>
          )}
          {status.url && (
            <Button
              variant="ghost"
              className="share-action share-stop"
              disabled={blocked}
              onClick={stop}
            >
              停止分享
            </Button>
          )}
          {!status.url && (
            <p className="share-disclosure">
              任何获得链接的人都可查看。
              <br />
              只分享已保存内容，草稿和账单原图不会公开。
            </p>
          )}
        </aside>
        <section className="share-preview-surface" aria-label="分享内容预览">
          {preview.document.events.length ? (
            <SharedJourneyDocument
              document={preview.document}
              photoUrls={preview.photoUrls}
              preview
            />
          ) : (
            <div className="share-empty">
              <h2>还没有可分享的记录</h2>
              <p>保存第一条记录后，就可以生成分享页。</p>
              <Link href={returnHref}>返回旅程</Link>
            </div>
          )}
        </section>
      </div>
      {confirmation}
    </main>
  )
}
