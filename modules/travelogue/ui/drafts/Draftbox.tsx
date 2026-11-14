"use client"
import type { ReactNode } from "react"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { useConfirmation } from "@/components/ui/Modal"
import type { DraftContext, LocalDraft } from "../../model/local-draft"
export default function Draftbox({
  context,
  drafts,
  loading,
  error,
  offlineReady,
  onCreate,
  onSelect,
  onRemove,
  editor,
}: {
  context: DraftContext | null
  drafts: LocalDraft[]
  loading: boolean
  error: string | null
  offlineReady: boolean
  onCreate: () => void
  onSelect: (draft: LocalDraft) => void
  onRemove: (id: string) => Promise<void>
  editor: ReactNode
}) {
  const { ask, confirmation } = useConfirmation()
  return (
    <main className="journal-workbench journal-drafts min-h-dvh bg-journal-paper text-ink">
      <div className="mx-auto max-w-2xl px-5 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation restores the online page from the offline shell. */}
          <a
            href="/journeys"
            aria-label="返回游记"
            className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-action"
          >
            <ArrowLeft size={18} />
          </a>
          <h1 className="flex-1 text-xl font-semibold">
            草稿箱{drafts.length ? ` · ${drafts.length}` : ""}
          </h1>
          <Button
            variant="primary"
            disabled={!context?.journeys.length}
            onClick={onCreate}
          >
            <Plus size={16} />
            记一笔
          </Button>
        </header>
        <p role="status" className="mt-3 text-xs text-walnut">
          仅存本机 ·{" "}
          {offlineReady ? "可离线打开" : "离线重开需先通过 HTTPS 完成准备"}
        </p>
        {error && (
          <p role="alert" className="mt-5 text-sm text-coral">
            {error}{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation rechecks authentication outside the offline shell. */}
            <a href="/" className="underline">
              登录
            </a>
          </p>
        )}
        {loading ? (
          <p className="mt-10 text-sm text-walnut">正在读取草稿…</p>
        ) : (
          <ul className="mt-6 divide-y divide-journal-paper-line">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-center gap-3 py-5">
                <button
                  className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-action"
                  onClick={() => onSelect(draft)}
                >
                  <span className="block truncate font-semibold">
                    {draft.content.title ||
                      draft.content.body ||
                      "未完成的记录"}
                  </span>
                  <span className="mt-1 block truncate text-sm text-walnut">
                    {draft.journey.title} · {draft.content.date || "日期待填写"}
                    {draft.photos.length
                      ? ` · ${draft.photos.length} 张照片`
                      : ""}
                  </span>
                  <span className="mt-1 block text-xs text-walnut">
                    {draft.pending
                      ? "提交结果待确认"
                      : draft.eventId
                        ? "照片待完成"
                        : "待加入游记"}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="删除草稿"
                  onClick={async () => {
                    if (
                      await ask(
                        "删除后无法恢复本机草稿，已提交到游记的内容不受影响。",
                        {
                          title: "删除这份草稿？",
                          cancelLabel: "保留",
                          confirmLabel: "删除",
                        }
                      )
                    ) {
                      await onRemove(draft.id)
                    }
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
            {!drafts.length && (
              <li className="py-12 text-center text-sm text-walnut">
                还没有本机草稿
              </li>
            )}
          </ul>
        )}
        {editor}
      </div>
      {confirmation}
    </main>
  )
}
