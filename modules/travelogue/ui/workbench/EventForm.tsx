"use client"
import { useEffect, useRef, useState } from "react"
import { Camera, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { InputArea } from "@/components/kumo/components/input/input-area"
import { Select } from "@/components/kumo/components/select/select"
import { Collapsible } from "@/components/kumo/components/collapsible/collapsible"
import type { RecordingEventContent } from "@/modules/data-model/contracts/recording"

export interface EventDraft {
  title: string
  body: string
  category: RecordingEventContent["category"]
  date: string
  time: string
  timeZone: string
}
export const eventKinds = [
  { value: "note", label: "随手记" },
  { value: "VISIT", label: "游览" },
  { value: "MEAL", label: "餐饮" },
  { value: "STAY", label: "住宿" },
  { value: "ACTIVITY", label: "活动" },
  { value: "TRANSIT", label: "交通" },
]
export default function EventForm({
  initial,
  onSave,
  onAutosave,
  onDirtyChange,
  onCancel,
}: {
  initial?: EventDraft
  onSave: (draft: EventDraft, files: File[]) => Promise<void>
  onAutosave?: (draft: EventDraft) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<EventDraft>(
    initial || {
      title: "",
      body: "",
      category: null,
      date: "",
      time: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  )
  const [initialDetailsOpen] = useState(!!initial)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const current = JSON.stringify(draft)
  const [saved, setSaved] = useState(JSON.stringify(initial || draft))
  const dirty = current !== saved || files.length > 0
  const editing = !!initial
  function update(next: EventDraft) {
    setDraft(next)
    onDirtyChange?.(JSON.stringify(next) !== saved || files.length > 0)
  }
  const latest = useRef({ draft, onAutosave })
  useEffect(() => {
    latest.current = { draft, onAutosave }
  }, [draft, onAutosave])
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews]
  )
  useEffect(() => {
    const snapshot: EventDraft = JSON.parse(current)
    if (
      saving ||
      !editing ||
      current === saved ||
      (snapshot.time && !snapshot.date)
    )
      return
    let active = true
    const timer = setTimeout(async () => {
      if (!latest.current.onAutosave) return
      setStatus("自动保存中…")
      try {
        await latest.current.onAutosave(snapshot)
        if (active) {
          setSaved(current)
          setStatus("文字已自动保存")
          setError(null)
        }
      } catch (cause) {
        if (active) {
          setStatus("")
          setError(
            cause instanceof Error
              ? cause.message
              : "自动保存失败，输入保留，请重试。"
          )
        }
      }
    }, 900)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [current, saved, editing, saving])
  function replaceFiles(next: File[]) {
    setFiles(next)
    setPreviews(next.map((file) => URL.createObjectURL(file)))
  }
  async function submit() {
    if (
      !draft.title.trim() &&
      !draft.body.trim() &&
      !files.length &&
      !initial
    ) {
      setError("写下一句话，或选择几张照片。")
      return
    }
    if (draft.time && !draft.date) {
      setError("填写时间时，请同时选择日期。")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft, files)
      setSaved(current)
      replaceFiles([])
      setStatus("已保存")
      onDirtyChange?.(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存失败，内容保留，请重试。"
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      aria-label={initial ? "编辑记录" : "添加记录"}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="space-y-4"
    >
      <h3 className="text-xl font-black">
        {initial ? "编辑这段经历" : "记下一段经历"}
      </h3>
      <Input
        aria-label="记录标题"
        placeholder="给这段经历起个名字（选填）"
        value={draft.title}
        maxLength={200}
        disabled={saving}
        onChange={(event) => update({ ...draft, title: event.target.value })}
      />
      <InputArea
        aria-label="记录正文"
        placeholder="此刻有什么想记下来的？"
        rows={5}
        value={draft.body}
        disabled={saving}
        onChange={(event) => update({ ...draft, body: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="relative overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previews[index]}
              alt={file.name}
              className="aspect-[4/3] w-full object-cover"
            />
            <Button
              variant="secondary"
              shape="square"
              size="sm"
              aria-label={`移除待上传照片 ${file.name}`}
              className="absolute top-2 right-2"
              onClick={() => replaceFiles(files.filter((_, i) => i !== index))}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          replaceFiles([...files, ...Array.from(event.target.files || [])])
          event.target.value = ""
        }}
      />
      <Button
        variant="secondary"
        disabled={saving}
        onClick={() => fileInput.current?.click()}
      >
        <Camera size={17} />
        加照片
      </Button>
      <Collapsible
        defaultOpen={initialDetailsOpen}
        className="rounded-xl border border-ink-10 p-3"
      >
        <Collapsible.Trigger
          render={
            <Button variant="ghost" className="w-full justify-between!" />
          }
        >
          补充信息（选填）
          <ChevronDown size={16} />
        </Collapsible.Trigger>
        <Collapsible.Panel>
          <div className="mt-4 space-y-3">
            <Input
              label="日期"
              type="date"
              value={draft.date}
              disabled={saving}
              onChange={(event) =>
                update({ ...draft, date: event.target.value })
              }
            />
            <Input
              label="时间"
              type="time"
              value={draft.time}
              disabled={saving}
              onChange={(event) =>
                update({ ...draft, time: event.target.value })
              }
            />
            <Select
              label="分类"
              value={draft.category || "note"}
              items={eventKinds}
              onValueChange={(value) =>
                update({
                  ...draft,
                  category:
                    value === "note" ? null : (value as EventDraft["category"]),
                })
              }
              disabled={saving}
            />
            {draft.time && (
              <Input
                label="当地时区"
                value={draft.timeZone}
                onChange={(event) =>
                  update({ ...draft, timeZone: event.target.value })
                }
                disabled={saving}
              />
            )}
          </div>
        </Collapsible.Panel>
      </Collapsible>
      {error && (
        <p role="alert" className="text-sm leading-6 text-coral">
          {error}
        </p>
      )}
      <p role="status" className="text-xs text-walnut">
        {onAutosave ? status || "修改后自动保存文字" : "时间和地点可以以后再补"}
      </p>
      <div className="flex justify-end gap-2 border-t border-ink-10 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button variant="primary" type="submit" loading={saving}>
          保存记录
        </Button>
      </div>
    </form>
  )
}
