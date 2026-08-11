"use client"

import { useId, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import type { TargetWorkspaceHistoryEntry } from "@/modules/data-model/contracts"

interface WorkspaceSwitcherPanelProps {
  workspaces: TargetWorkspaceHistoryEntry[]
  currentWorkspaceId: string
  children: ReactNode
  className?: string
  framed?: boolean
  locked?: boolean
  defaultOpen?: boolean
  now?: number
  onBack?: () => void
  onCollapse?: () => void
  onCreate: () => void
  onSelect: (workspaceId: string) => void
  onRename: (workspaceId: string, title: string) => void
  onDelete: (workspaceId: string) => void
}

export default function WorkspaceSwitcherPanel({
  workspaces,
  currentWorkspaceId,
  children,
  className = "",
  framed = true,
  locked = false,
  defaultOpen = false,
  now = Date.now(),
  onBack,
  onCollapse,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: WorkspaceSwitcherPanelProps) {
  const managerId = useId()
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [menuWorkspaceId, setMenuWorkspaceId] = useState<string | null>(null)
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(
    null
  )
  const [editingTitle, setEditingTitle] = useState("")
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(
    null
  )
  const currentWorkspace = workspaces.find(
    (workspace) => workspace.id === currentWorkspaceId
  )
  const currentTitle = currentWorkspace?.title ?? "新的旅行计划"

  const toggleManager = () => {
    setIsOpen((open) => !open)
    setMenuWorkspaceId(null)
    setEditingWorkspaceId(null)
    setDeletingWorkspaceId(null)
  }

  const beginRename = (workspace: TargetWorkspaceHistoryEntry) => {
    setEditingWorkspaceId(workspace.id)
    setEditingTitle(workspace.title)
    setMenuWorkspaceId(null)
    setDeletingWorkspaceId(null)
  }

  const finishRename = () => {
    if (!editingWorkspaceId) return
    const title = editingTitle.trim()
    if (title) onRename(editingWorkspaceId, title)
    setEditingWorkspaceId(null)
  }

  const selectWorkspace = (workspaceId: string) => {
    if (locked || workspaceId === currentWorkspaceId) return
    onSelect(workspaceId)
    setIsOpen(false)
    setMenuWorkspaceId(null)
  }

  return (
    <div
      className={`${className} min-h-0 flex-col overflow-hidden bg-soft-white/98 ${
        framed
          ? "rounded-xl border border-ink-15 shadow-periplus backdrop-blur-sm"
          : ""
      }`}
    >
      <header className="flex min-h-[76px] shrink-0 items-center gap-3 border-b border-ink-5 px-5 py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="返回行程"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-10 bg-cream text-ink transition hover:border-russet"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={toggleManager}
          aria-expanded={isOpen}
          aria-controls={managerId}
          className="group min-w-0 flex-1 text-left"
        >
          <span className="block text-[10px] font-black tracking-[0.12em] text-teak">
            AI 旅行助手
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-black text-ink transition group-hover:text-russet">
              {currentTitle}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-russet transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="收起 AI 旅行助手"
            className="flex h-7 w-[26px] shrink-0 items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:bg-russet hover:text-soft-white"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {isOpen ? (
        <div id={managerId} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-ink-10 bg-soft-white px-4 py-3">
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                onCreate()
                setIsOpen(false)
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-russet bg-selected-soft text-[12px] font-black text-russet transition hover:bg-russet hover:text-soft-white disabled:cursor-not-allowed disabled:border-ink-10 disabled:bg-cream disabled:text-walnut disabled:opacity-55"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              创建新工作区
            </button>
            {locked ? (
              <p className="mt-2 text-center text-[10px] leading-4 font-bold text-walnut">
                AI 正在规划，完成后即可新建或切换工作区
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[10px] font-black tracking-[0.1em] text-teak">
                工作区
              </p>
              <p className="text-[10px] font-bold text-walnut">
                {workspaces.length} 个
              </p>
            </div>

            <div className="space-y-2">
              {workspaces.map((workspace) => {
                const isCurrent = workspace.id === currentWorkspaceId
                const isEditing = editingWorkspaceId === workspace.id
                const isDeleting = deletingWorkspaceId === workspace.id
                const isMenuOpen = menuWorkspaceId === workspace.id

                return (
                  <article
                    key={workspace.id}
                    className={`relative overflow-visible rounded-[11px] border transition ${
                      isCurrent
                        ? "border-russet/50 bg-selected-soft shadow-periplus-soft"
                        : "border-ink-10 bg-white/70 hover:border-russet/45"
                    }`}
                  >
                    {isCurrent ? (
                      <span
                        className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-russet"
                        aria-hidden="true"
                      />
                    ) : null}

                    {isEditing ? (
                      <form
                        className="p-3"
                        onSubmit={(event) => {
                          event.preventDefault()
                          finishRename()
                        }}
                      >
                        <label
                          htmlFor={`workspace-title-${workspace.id}`}
                          className="text-[10px] font-black tracking-[0.08em] text-teak"
                        >
                          重命名工作区
                        </label>
                        <div className="mt-2 flex gap-2">
                          <input
                            id={`workspace-title-${workspace.id}`}
                            autoFocus
                            value={editingTitle}
                            maxLength={48}
                            onChange={(event) =>
                              setEditingTitle(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                setEditingWorkspaceId(null)
                              }
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-russet bg-soft-white px-3 text-[12px] font-bold text-ink ring-russet/20 outline-none focus:ring-2"
                          />
                          <button
                            type="submit"
                            disabled={!editingTitle.trim()}
                            aria-label="保存名称"
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-russet text-soft-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWorkspaceId(null)}
                            aria-label="取消重命名"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:text-russet"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </form>
                    ) : isDeleting ? (
                      <div className="p-3">
                        <p className="pr-1 text-[12px] font-black text-ink">
                          删除“{workspace.title}”？
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-walnut">
                          {isCurrent
                            ? "将打开最近使用的工作区；已保存行程不受影响。"
                            : "聊天与草稿会被删除；已保存行程不受影响。"}
                        </p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDeletingWorkspaceId(null)}
                            className="h-8 rounded-lg border border-ink-10 bg-cream px-3 text-[11px] font-black text-walnut transition hover:border-russet"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDelete(workspace.id)
                              setDeletingWorkspaceId(null)
                            }}
                            className="h-8 rounded-lg bg-coral px-3 text-[11px] font-black text-white transition hover:bg-ink"
                          >
                            确认删除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={locked || isCurrent}
                          onClick={() => selectWorkspace(workspace.id)}
                          aria-current={isCurrent ? "page" : undefined}
                          className="block w-full rounded-[11px] p-3 pr-11 text-left disabled:cursor-default"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[12px] font-black text-ink">
                              {workspace.title}
                            </span>
                            {isCurrent ? (
                              <span className="shrink-0 text-[9px] font-black tracking-[0.08em] text-russet">
                                当前
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block truncate text-[10px] leading-4 text-walnut">
                            {workspace.preview || "尚未开始对话"}
                          </span>
                          <span className="mt-2 block text-[9px] font-bold text-teak">
                            {formatRelativeTime(workspace.updatedAt, now)}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={locked}
                          onClick={(event) => {
                            event.stopPropagation()
                            setMenuWorkspaceId((current) =>
                              current === workspace.id ? null : workspace.id
                            )
                            setDeletingWorkspaceId(null)
                          }}
                          aria-label={`${workspace.title}的更多操作`}
                          aria-expanded={isMenuOpen}
                          className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-walnut transition hover:bg-cream hover:text-russet disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <MoreHorizontal
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </button>

                        {isMenuOpen ? (
                          <div className="absolute top-10 right-2 z-20 w-28 overflow-hidden rounded-[10px] border border-ink-10 bg-soft-white p-1 shadow-periplus-soft">
                            <button
                              type="button"
                              onClick={() => beginRename(workspace)}
                              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[11px] font-bold text-ink transition hover:bg-cream"
                            >
                              <Pencil
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              重命名
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingWorkspaceId(workspace.id)
                                setMenuWorkspaceId(null)
                                setEditingWorkspaceId(null)
                              }}
                              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[11px] font-bold text-coral transition hover:bg-cream"
                            >
                              <Trash2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              删除
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function formatRelativeTime(updatedAt: string, now: number) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(updatedAt).getTime()) / 60_000)
  )
  if (elapsedMinutes < 1) return "刚刚"
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} 小时前`

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `${elapsedDays} 天前`

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(updatedAt))
}
