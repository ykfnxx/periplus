"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { recordingApi, RecordingApiError } from "../data/client"
import { operationId } from "../data/operation-id"
import { journeyHref } from "../data/navigation"
import { eventContent } from "../ui/event-content"
import { useConfirmation } from "../ui/workbench/Modal"
import { draftStorage, type DraftContext, type LocalDraft } from "./storage"
import { draftError } from "./publish"
import DraftEditor from "./DraftEditor"
import { prepareOfflineDrafts } from "./offline"

export default function Draftbox() {
  const [context, setContext] = useState<DraftContext | null>(null)
  const [drafts, setDrafts] = useState<LocalDraft[]>([])
  const [selected, setSelected] = useState<LocalDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const { ask, confirmation } = useConfirmation()
  useEffect(() => {
    let disposed = false
    async function load() {
      let saved = await draftStorage.context()
      try {
        const account = await recordingApi.account()
        const journeys = await recordingApi.list()
        saved = {
          userId: account.userId,
          journeys: journeys.map(({ id, title }) => ({ id, title })),
        }
        await draftStorage.remember(saved)
      } catch (cause) {
        if (cause instanceof RecordingApiError && cause.status !== 401)
          throw cause
      }
      if (!saved)
        throw new Error("请先联网登录并打开一次游记，再使用本机草稿。")
      const items = await draftStorage.list(saved.userId)
      if (!disposed) {
        setContext(saved)
        setDrafts(items)
        const requested = new URLSearchParams(window.location.search).get(
          "draft"
        )
        setSelected(items.find((item) => item.id === requested) || null)
      }
    }
    void load()
      .catch((cause) => {
        if (!disposed) setError(draftError(cause))
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    void prepareOfflineDrafts()
      .then((ready) => {
        if (!disposed) setOfflineReady(ready)
      })
      .catch((cause) => {
        if (!disposed) setError(`离线资源准备失败：${draftError(cause)}`)
      })
    return () => {
      disposed = true
    }
  }, [])
  async function refresh() {
    setSelected(null)
    setDrafts(await draftStorage.list(context!.userId))
  }
  return (
    <main className="journal-workbench min-h-dvh bg-journal-paper text-ink">
      <div className="mx-auto max-w-2xl px-5 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center gap-3">
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
            onClick={() => {
              setSelected({
                id: operationId(),
                userId: context!.userId,
                journey: context!.journeys[0],
                content: eventContent(),
                photos: [],
                updatedAt: new Date().toISOString(),
              })
            }}
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
                  onClick={() => setSelected(draft)}
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
                      try {
                        await draftStorage.remove(draft.id)
                        await refresh()
                      } catch (cause) {
                        setError(draftError(cause))
                      }
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
        {selected && context && (
          <DraftEditor
            key={selected.id}
            initial={selected}
            journeys={context.journeys}
            onClose={() => {
              void refresh().catch((cause) => setError(draftError(cause)))
            }}
            onSaved={(journeyId, eventId) =>
              window.location.assign(journeyHref(journeyId, { eventId }))
            }
          />
        )}
      </div>
      {confirmation}
    </main>
  )
}
