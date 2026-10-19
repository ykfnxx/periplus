"use client"

import { useState } from "react"
import type { RecordingJourneySummary } from "@/modules/data-model/contracts/recording"
import { journeyDateLabel } from "./display"
import {
  CalendarDays,
  Clock3,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Image as ImageIcon,
} from "lucide-react"
import TravelogueHeader from "./TravelogueHeader"
import RecordDialog from "./RecordDialog"
import {
  RecordButton,
  RecordError,
  RecordField,
  recordInputClass,
} from "./primitives"

export type JourneyLibraryItem = RecordingJourneySummary

export default function JourneyLibrary({
  journeys,
  loading,
  error,
  onCreate,
  onOpen,
  onRename,
  onRetry,
}: {
  journeys: JourneyLibraryItem[]
  loading: boolean
  error: string | null
  onCreate: (title: string) => Promise<void>
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onRetry: () => void
}) {
  const [sort, setSort] = useState<"all" | "recent">("all")
  const [form, setForm] = useState<{ id?: string; title: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const sorted =
    sort === "recent"
      ? [...journeys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : journeys

  async function submit() {
    if (!form || !form.title.trim()) {
      setFormError("给旅程起一个名字。")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (form.id) await onRename(form.id, form.title.trim())
      else await onCreate(form.title.trim())
      setForm(null)
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "保存失败，请重试。"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-dvh bg-cream text-ink">
      <TravelogueHeader />
      <div className="mx-auto max-w-[1320px] px-5 py-8 md:px-10 md:py-12">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              我的旅程
            </h1>
            <p className="mt-3 text-sm font-medium text-walnut md:text-lg">
              把走过的路，慢慢记下来。
            </p>
          </div>
          <RecordButton
            primary
            onClick={() => {
              setForm({ title: "" })
              setFormError(null)
            }}
            className="rounded-xl px-4 md:min-h-14 md:px-6 md:text-base"
          >
            <Plus size={22} />
            <span>新建旅程</span>
          </RecordButton>
        </div>
        <div className="mb-5 flex gap-2" aria-label="旅程排序">
          {(
            [
              ["all", "全部"],
              ["recent", "最近编辑"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={`min-h-10 rounded-full px-6 text-sm font-bold ${sort === value ? "bg-russet text-white" : "text-walnut hover:bg-soft-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <p role="status" className="py-12 text-walnut">
            正在打开我的旅程…
          </p>
        ) : null}
        <RecordError message={error} />
        {error ? (
          <RecordButton onClick={onRetry} className="mt-4">
            重试
          </RecordButton>
        ) : null}
        {!loading && !error && !journeys.length ? (
          <div className="rounded-2xl border border-dashed border-ink-20 bg-soft-white px-6 py-16 text-center">
            <h2 className="text-2xl font-black">从一段经历开始</h2>
            <p className="mt-3 mb-6 text-sm leading-7 text-walnut">
              几张照片、一句话，就能留住这趟旅程。
              <br />
              时间和地点可以以后再补。
            </p>
            <RecordButton primary onClick={() => setForm({ title: "" })}>
              <Plus size={18} />
              新建旅程
            </RecordButton>
          </div>
        ) : null}
        <div className="space-y-4">
          {sorted.map((journey, index) => (
            <article
              key={journey.id}
              className="flex flex-col gap-5 rounded-2xl border border-ink-5 bg-soft-white p-3 sm:flex-row sm:items-center md:gap-7 md:p-4"
            >
              <button
                type="button"
                onClick={() => onOpen(journey.id)}
                className="aspect-[16/9] w-full shrink-0 overflow-hidden rounded-xl bg-mustard/20 sm:aspect-[1.8] sm:w-[29%]"
                aria-label={`打开${journey.title}`}
              >
                {journey.coverUrl ? (
                  <img
                    src={journey.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-teak">
                    <ImageIcon size={36} strokeWidth={1.25} />
                  </div>
                )}
              </button>
              <div className="min-w-0 flex-1 px-2 sm:px-0">
                <button
                  type="button"
                  onClick={() => onOpen(journey.id)}
                  className="max-w-full truncate text-left text-2xl font-black hover:text-russet md:text-3xl"
                >
                  {journey.title}
                </button>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-walnut md:text-sm">
                  <CalendarDays size={16} />
                  {journeyDateLabel(journey)}
                  <span aria-hidden="true">·</span>
                  <LockKeyhole size={14} />
                  仅自己可见
                </p>
                {journey.description ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-walnut md:text-base">
                    {journey.description}
                  </p>
                ) : null}
                <p className="mt-4 flex items-center gap-2 text-xs text-walnut">
                  <Clock3 size={15} />
                  {new Date(journey.updatedAt).toLocaleDateString("zh-CN")} 编辑
                </p>
              </div>
              <div className="flex items-center gap-3 px-2 pb-2 sm:pr-2 sm:pb-0">
                <RecordButton
                  primary={index === 0}
                  onClick={() => onOpen(journey.id)}
                  className="rounded-xl"
                >
                  {index === 0 ? "继续记录" : "打开旅程"}
                </RecordButton>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ id: journey.id, title: journey.title })
                    setFormError(null)
                  }}
                  aria-label={`重命名${journey.title}`}
                  title="重命名"
                  className="rounded-full border border-ink-10 p-3 hover:bg-cream"
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      {form ? (
        <RecordDialog
          title={form.id ? "旅程名称" : "新建旅程"}
          onClose={() => {
            if (!saving) setForm(null)
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            className="space-y-5"
          >
            <RecordField label="旅程名称">
              <input
                autoFocus
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className={recordInputClass}
                placeholder="例如：杭州慢游"
                maxLength={200}
                disabled={saving}
              />
            </RecordField>
            <p className="text-sm leading-6 text-walnut">
              不需要先填完整行程，进入后就可以写文字、加照片。
            </p>
            <RecordError message={formError} />
            <div className="flex justify-end gap-2">
              <RecordButton disabled={saving} onClick={() => setForm(null)}>
                取消
              </RecordButton>
              <RecordButton primary type="submit" disabled={saving}>
                {saving ? "保存中…" : form.id ? "保存" : "开始记录"}
              </RecordButton>
            </div>
          </form>
        </RecordDialog>
      ) : null}
    </main>
  )
}
