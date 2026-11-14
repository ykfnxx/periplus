"use client"
import Link from "next/link"
import type { RefObject, ReactNode } from "react"
import { ArrowLeft, Check, Copy } from "lucide-react"
import type {
  ShareStatus,
  SharePreview,
} from "@/modules/data-model/contracts/sharing"
import { Button } from "@/components/kumo/components/button/button"
import SharedJourneyDocument from "./SharedJourneyDocument"
export default function ShareManager({
  status,
  preview,
  includeCosts,
  busy,
  loading,
  pending,
  error,
  notice,
  online,
  link,
  confirmation,
  returnHref,
  changeCosts,
  refresh,
  confirmPending,
  publish,
  stop,
  copy,
}: {
  status: ShareStatus
  preview: SharePreview
  includeCosts: boolean
  busy: boolean
  loading: boolean
  pending: boolean
  error: string
  notice: string
  online: boolean
  link: RefObject<HTMLInputElement | null>
  confirmation: ReactNode
  returnHref: string
  changeCosts: (value: boolean) => void
  refresh: () => void
  confirmPending: () => void
  publish: () => void
  stop: () => void
  copy: () => void
}) {
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
                void changeCosts(event.target.checked)
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
