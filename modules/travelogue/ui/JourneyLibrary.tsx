"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import {
  CalendarDays,
  Clock3,
  Image as ImageIcon,
  LockKeyhole,
  MoreHorizontal,
  Plus,
} from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { Tabs } from "@/components/kumo/components/tabs/tabs"
import type { RecordingJourneySummary } from "@/modules/data-model/contracts/recording"
import MapControls from "./workbench/MapControls"
import ResizableMapPanel from "./workbench/ResizableMapPanel"
import { Modal, useConfirmation } from "./workbench/Modal"
import { journeyDateLabel } from "./display"
import type { RecordMapRequest } from "./RecordMap"
const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })
export type JourneyLibraryItem = RecordingJourneySummary
export default function JourneyLibrary({
  journeys,
  loading,
  error,
  onCreate,
  onOpen,
  onRename,
  onRetry,
  developerMode = false,
}: {
  journeys: JourneyLibraryItem[]
  loading: boolean
  error: string | null
  onCreate: (title: string) => Promise<void>
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onRetry: () => void
  developerMode?: boolean
}) {
  const [sort, setSort] = useState("all")
  const [form, setForm] = useState<{
    id?: string
    title: string
    initial: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [mapRequest, setMapRequest] = useState<RecordMapRequest | null>(null)
  const [sheet, setSheet] = useState<"small" | "half" | "full">("half")
  const { ask, confirmation } = useConfirmation()
  const sorted =
    sort === "recent"
      ? [...journeys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : journeys
  const create = () => {
    setFormError(null)
    setForm({ title: "", initial: "" })
  }
  return (
    <main className="journal-workbench journal-library fixed inset-0 isolate overflow-hidden bg-cream text-ink">
      <div className="absolute inset-0">
        <RecordMap points={[]} request={mapRequest} />
      </div>
      <MapControls
        canFit={false}
        onRequest={(type) =>
          setMapRequest((current) => ({ id: (current?.id || 0) + 1, type }))
        }
      />
      <ResizableMapPanel width={440} sheet={sheet} onSheet={setSheet}>
        <header className="shrink-0 px-5 pt-6">
          <h1 className="text-2xl font-black tracking-tight">我的旅程</h1>
          <p className="mt-2 mb-5 text-sm text-walnut">
            把走过的路，慢慢记下来。
          </p>
          <Tabs
            tabs={[
              { value: "all", label: "全部" },
              { value: "recent", label: "最近编辑" },
            ]}
            value={sort}
            onValueChange={setSort}
            variant="segmented"
            listClassName="mb-5"
          />
          {developerMode && (
            <p className="mb-3 text-xs text-walnut">
              开发者模式 · 共用调试数据
            </p>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {loading && (
            <p role="status" className="py-12 text-sm text-walnut">
              正在打开我的旅程…
            </p>
          )}
          {error && (
            <div role="alert" className="py-4 text-sm text-coral">
              <p>{error}</p>
              <Button variant="secondary" className="mt-4" onClick={onRetry}>
                重试
              </Button>
            </div>
          )}
          {!loading && !error && !journeys.length && (
            <div className="rounded-2xl border border-dashed border-ink-20 px-6 py-14 text-center">
              <h2 className="text-2xl font-black">从一段经历开始</h2>
              <p className="my-5 text-sm leading-7 text-walnut">
                几张照片、一句话，就能留住这趟旅程。
                <br />
                时间和地点可以以后再补。
              </p>
              <Button variant="primary" onClick={create}>
                <Plus size={18} />
                新建旅程
              </Button>
            </div>
          )}
          <div className="space-y-3">
            {sorted.map((journey) => (
              <article
                key={journey.id}
                className="relative flex gap-3 rounded-2xl border border-ink-10 bg-white p-3"
              >
                <Button
                  variant="ghost"
                  className="h-28! w-24! shrink-0 overflow-hidden rounded-xl bg-mustard/20 p-0!"
                  aria-label={`打开${journey.title}`}
                  onClick={() => onOpen(journey.id)}
                >
                  {journey.coverUrl ? (
                    // Private media URLs keep their authenticated request semantics.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={journey.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={36} strokeWidth={1.25} />
                  )}
                </Button>
                <div className="min-w-0 flex-1 py-1">
                  <Button
                    variant="ghost"
                    className="h-auto! max-w-full justify-start! p-0! pr-7! text-base font-black"
                    onClick={() => onOpen(journey.id)}
                  >
                    <span className="truncate">{journey.title}</span>
                  </Button>
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-walnut">
                    <CalendarDays size={14} />
                    {journeyDateLabel(journey)}
                    <span>·</span>
                    <LockKeyhole size={13} />
                    仅自己可见
                  </p>
                  {journey.description && (
                    <p className="mt-2 line-clamp-1 text-xs leading-5 text-walnut">
                      {journey.description}
                    </p>
                  )}
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-walnut">
                    <Clock3 size={14} />
                    {new Date(journey.updatedAt).toLocaleDateString(
                      "zh-CN"
                    )}{" "}
                    编辑
                  </p>
                </div>
                <Button
                  variant="ghost"
                  shape="square"
                  size="sm"
                  className="absolute top-2 right-2"
                  aria-label={`重命名${journey.title}`}
                  onClick={() => {
                    setFormError(null)
                    setForm({
                      id: journey.id,
                      title: journey.title,
                      initial: journey.title,
                    })
                  }}
                >
                  <MoreHorizontal size={20} />
                </Button>
              </article>
            ))}
          </div>
        </div>
        <footer className="shrink-0 border-t border-ink-10 p-4">
          <Button variant="primary" className="w-full" onClick={create}>
            <Plus size={19} />
            新建旅程
          </Button>
        </footer>
      </ResizableMapPanel>
      {form && (
        <Modal
          title={form.id ? "旅程名称" : "新建旅程"}
          onClose={() => setForm(null)}
          beforeClose={() =>
            !saving &&
            (form.title === form.initial || ask("旅程名称尚未保存，放弃修改？"))
          }
        >
          {(close) => (
            <form
              className="space-y-5"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!form.title.trim()) {
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
                    cause instanceof Error
                      ? cause.message
                      : "保存失败，请重试。"
                  )
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Input
                label="旅程名称"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                maxLength={200}
                placeholder="例如：杭州慢游"
                disabled={saving}
              />
              <p className="text-sm leading-6 text-walnut">
                不需要先填完整行程，进入后就可以写文字、加照片。
              </p>
              {formError && (
                <p role="alert" className="text-sm text-coral">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={close} disabled={saving}>
                  取消
                </Button>
                <Button variant="primary" type="submit" loading={saving}>
                  {form.id ? "保存" : "开始记录"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {confirmation}
    </main>
  )
}
