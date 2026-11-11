"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useStore } from "zustand"
import { ArrowLeft, Send, Square } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { InputArea } from "@/components/kumo/components/input/input-area"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { recordingApi } from "@/modules/travelogue/data/client"
import { useConfirmation } from "@/modules/travelogue/ui/workbench/Modal"
import { createPlanningStore, type PlanningStore } from "../client/store"
import { planningErrorText } from "../client/api"
import PlanningPreview from "./PlanningPreview"

export type PlanningJourney = Pick<JourneySnapshot, "id" | "title"> & {
  eventCount: number
}

export default function PlanningPage({
  journey,
}: {
  journey: PlanningJourney
}) {
  const query = useSearchParams()
  const router = useRouter()
  const [store] = useState(() =>
    createPlanningStore(journey.id, query.get("proposal"))
  )
  const id = useStore(store, (state) => state.proposalId)
  useEffect(() => {
    if (id && query.get("proposal") !== id)
      router.replace(
        `/journeys/${encodeURIComponent(journey.id)}/planning?proposal=${encodeURIComponent(id)}`,
        { scroll: false }
      )
  }, [id, query, router, journey.id])
  return <PlanningWorkbench journey={journey} store={store} />
}

const runLabels = {
  RUNNING: "正在整理行程…",
  SUCCEEDED: "本轮已完成",
  QUESTION: "需要你的答复",
  CANCELLED: "本轮已取消，上一版预览保留。",
  TIMED_OUT: "本轮已超时，上一版预览保留。可重新发送要求。",
  FAILED: "本轮未完成，上一版预览保留。",
}

export function PlanningWorkbench({
  journey,
  store,
}: {
  journey: PlanningJourney
  store: PlanningStore
}) {
  const {
    proposal,
    proposalId,
    receipt,
    loading,
    busy,
    readFailed,
    error,
    needsRebase,
    pending,
    sent,
  } = useStore(store)
  const [message, setMessage] = useState("")
  const [latestJourney, setLatestJourney] = useState<JourneySnapshot | null>(
    null
  )
  const [journeyError, setJourneyError] = useState<string | null>(null)
  const [journeyReload, setJourneyReload] = useState(0)
  const { ask, confirmation } = useConfirmation()
  const running = proposal?.run?.status === "RUNNING"
  const closed =
    proposal?.status === "APPLIED" || proposal?.status === "DISCARDED"
  const preview = proposal?.preview
  const question = proposal?.question
  const answeringRebase = Boolean(
    question &&
    proposal.run?.mode === "rebase" &&
    proposal.run.targetRevision === proposal.currentJourneyRevision
  )
  const locked = busy || loading || readFailed || Boolean(pending)
  const composeDisabled =
    locked || running || closed || (needsRebase && !answeringRebase)

  useEffect(() => {
    void store.getState().load()
    const recover = () => {
      const current = store.getState()
      if (!current.busy) void current.load()
    }
    window.addEventListener("online", recover)
    window.addEventListener("focus", recover)
    return () => {
      window.removeEventListener("online", recover)
      window.removeEventListener("focus", recover)
      store.getState().dispose()
    }
  }, [store])

  useEffect(() => {
    if (!running || busy || readFailed) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await store.getState().load()
      const current = store.getState()
      if (
        !stopped &&
        !current.readFailed &&
        current.proposal?.run?.status === "RUNNING"
      )
        timer = setTimeout(poll, 1200)
    }
    timer = setTimeout(poll, 1200)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [running, busy, readFailed, store])

  const appliedRevision = receipt?.appliedRevision
  useEffect(() => {
    if (appliedRevision === undefined) return
    let disposed = false
    recordingApi
      .get(journey.id)
      .then((current) => {
        if (!disposed) {
          setLatestJourney(current)
          setJourneyError(null)
        }
      })
      .catch((cause) => {
        if (!disposed)
          setJourneyError(
            cause instanceof Error ? cause.message : "无法读取最新旅程。"
          )
      })
    return () => {
      disposed = true
    }
  }, [appliedRevision, journey.id, journeyReload])

  async function send(value: string, choiceRef?: string) {
    if (await store.getState().send(value.trim(), choiceRef)) setMessage("")
  }
  async function retry() {
    const original = store.getState().pending
    if (await store.getState().retry()) {
      if (original?.kind === "create" || original?.kind === "turn")
        setMessage("")
    }
  }
  async function apply() {
    if (!preview) return
    const version = preview.version
    if (
      await ask(
        `将下方已核对的第 ${version} 版变更一次性写入“${journey.title}”。`,
        {
          title: `应用第 ${version} 版？`,
          buttonClassName: "min-h-11",
          confirmLabel: `确认应用第 ${version} 版`,
          cancelLabel: "继续核对",
        }
      )
    )
      await store.getState().apply(version)
  }
  async function discard() {
    if (!proposal) return
    const version = proposal.latestVersion
    if (
      await ask("正式旅程保持原样，当前提案将结束。", {
        title: "放弃这份提案？",
        buttonClassName: "min-h-11",
        confirmLabel: "放弃提案",
        cancelLabel: "继续规划",
      })
    )
      await store.getState().discard(version)
  }

  return (
    <main className="journal-workbench min-h-dvh bg-journal-paper text-journal-ink">
      <header className="border-b border-journal-paper-line">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-action"
            href={`/journeys/${encodeURIComponent(journey.id)}`}
            aria-label="返回旅程"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">规划旅程</h1>
            <p className="mt-1 truncate text-sm text-journal-muted">
              {journey.title}
            </p>
          </div>
          {proposal?.status === "OPEN" && (
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={busy || Boolean(pending) || readFailed}
              onClick={() => void discard()}
            >
              放弃提案
            </Button>
          )}
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-12 lg:py-10">
        <section aria-label="规划对话" className="min-w-0">
          <h2 className="mb-5 text-lg font-semibold">
            {closed
              ? "本次规划"
              : proposalId
                ? "继续规划"
                : journey.eventCount
                  ? "想怎样调整行程？"
                  : "想去哪里，哪天出发？"}
          </h2>
          {sent.length > 0 && (
            <ol
              className="mb-5 max-h-72 space-y-4 overflow-y-auto overscroll-contain"
              aria-label="本次输入"
            >
              {sent.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl bg-journal-paper-soft px-4 py-3 text-sm leading-7 break-words whitespace-pre-wrap"
                >
                  {item.message}
                </li>
              ))}
            </ol>
          )}
          {proposal?.run && (
            <div className="mb-5 flex items-start justify-between gap-3 text-sm leading-6">
              <div role="status" aria-live="polite">
                <p>
                  {running
                    ? proposal.run.progress || runLabels.RUNNING
                    : runLabels[proposal.run.status]}
                </p>
                {proposal.run.error &&
                  proposal.run.error.code !== "RUN_FAILED" && (
                    <p className="mt-2 text-coral">
                      {planningErrorText(proposal.run.error)}
                    </p>
                  )}
              </div>
              {running && (
                <Button
                  variant="secondary"
                  className="min-h-11 shrink-0"
                  disabled={busy || Boolean(pending)}
                  onClick={() => void store.getState().cancel()}
                >
                  <Square size={14} />
                  取消本轮
                </Button>
              )}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mb-5 space-y-3 text-sm leading-6 text-coral"
            >
              <p>{error}</p>
              {(pending || readFailed) && (
                <Button
                  variant="secondary"
                  className="min-h-11"
                  loading={busy}
                  onClick={() => void retry()}
                >
                  {pending ? "重试原请求" : "重新读取"}
                </Button>
              )}
            </div>
          )}
          {needsRebase && !closed && (
            <div className="mb-5 space-y-3 text-sm leading-6">
              {!error && (
                <p>
                  {proposal &&
                  proposal.baseRevision !== proposal.currentJourneyRevision
                    ? "旅程已有其他修改，当前预览不能直接应用。"
                    : "待应用内容需要重新预演，当前预览不能直接应用。"}
                </p>
              )}
              {!answeringRebase && (
                <Button
                  variant="secondary"
                  className="h-auto! min-h-11 max-w-full text-left whitespace-normal"
                  disabled={locked || running}
                  onClick={() => void store.getState().rebase()}
                >
                  基于最新旅程重新预演
                </Button>
              )}
            </div>
          )}
          {question && !closed && (
            <section aria-label="当前问题" className="mb-5 space-y-4">
              <h3 className="text-base leading-7 font-medium break-words whitespace-pre-wrap">
                {question.message}
              </h3>
              {question.choices.length > 0 && (
                <div className="flex flex-col gap-2">
                  {question.choices.map((choice) => {
                    const place = proposal.livePlaces.find(
                      (item) => item.candidateRef === choice.choiceRef
                    )
                    return (
                      <Button
                        key={choice.choiceRef}
                        variant="secondary"
                        className="h-auto! min-h-11 w-full! justify-start! px-4! py-3! text-left leading-6 break-words whitespace-normal"
                        disabled={composeDisabled}
                        onClick={() =>
                          void send(choice.label, choice.choiceRef)
                        }
                      >
                        <span className="min-w-0">
                          <span className="block">
                            {place ? place.name : choice.label}
                          </span>
                          {place && (place.city || place.address) && (
                            <span className="mt-1 block text-sm font-normal text-journal-muted">
                              {[place.city, place.address]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                      </Button>
                    )
                  })}
                </div>
              )}
            </section>
          )}
          {!closed && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (message.trim() && !composeDisabled) void send(message)
              }}
            >
              <InputArea
                label={question ? "答复当前问题" : "旅行要求"}
                className="text-base! leading-7! placeholder:text-journal-muted!"
                placeholder={
                  question
                    ? "写下答复，或要求重新查询"
                    : "出发日期、目的地，或想调整的活动"
                }
                value={message}
                onValueChange={setMessage}
                maxLength={10000}
                rows={4}
                disabled={busy || Boolean(pending)}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  type="submit"
                  className="min-h-11"
                  disabled={composeDisabled || !message.trim()}
                  loading={busy && !pending}
                >
                  <Send size={16} />
                  {question ? "发送答复" : "发送要求"}
                </Button>
              </div>
            </form>
          )}
          {proposal?.livePlaces.length ? (
            <details className="mt-6 text-sm leading-6">
              <summary className="cursor-pointer font-medium">
                本轮地点查询
              </summary>
              <p className="mt-3 text-journal-muted">
                实际保存的名称和位置以待应用变更为准。
              </p>
              <ul className="mt-3 space-y-3">
                {proposal.livePlaces.map((place) => (
                  <li key={place.candidateRef} className="break-words">
                    <p>
                      {place.name}
                      {place.city ? ` · ${place.city}` : ""}
                    </p>
                    {place.address && (
                      <p className="text-journal-muted">{place.address}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {proposal?.status === "DISCARDED" && (
            <div className="space-y-4 text-sm">
              <p>提案已放弃，正式旅程没有变更。</p>
              <a
                className="inline-flex min-h-11 items-center text-action underline underline-offset-4"
                href={`/journeys/${encodeURIComponent(journey.id)}/planning`}
              >
                开始新的规划
              </a>
            </div>
          )}
        </section>
        <section
          aria-label="提案预览"
          className="min-w-0 border-t border-journal-paper-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
        >
          {receipt ? (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">
                第 {receipt.version} 版已应用
              </h2>
              <p className="text-sm leading-7">
                变更已保存到旅程修订 {receipt.appliedRevision}。
              </p>
              {latestJourney && (
                <p className="text-sm leading-7 text-journal-muted">
                  已读取最新旅程：修订 {latestJourney.revision}，共{" "}
                  {latestJourney.events.length} 项事件。
                </p>
              )}
              {journeyError && (
                <div role="alert" className="space-y-2 text-sm text-coral">
                  <p>{journeyError} 应用回执已保留。</p>
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => setJourneyReload((count) => count + 1)}
                  >
                    读取最新旅程
                  </Button>
                </div>
              )}
              <Link
                className="inline-flex min-h-11 items-center rounded-lg bg-action px-5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action"
                href={`/journeys/${encodeURIComponent(journey.id)}`}
              >
                查看旅程
              </Link>
            </div>
          ) : preview ? (
            <>
              <PlanningPreview preview={preview} />
              {proposal?.status === "OPEN" && (
                <div className="mt-7 border-t border-journal-paper-line pt-5">
                  <Button
                    variant="primary"
                    className="min-h-11"
                    disabled={
                      locked ||
                      running ||
                      needsRebase ||
                      !preview.canApply ||
                      preview.committableDiff.length === 0
                    }
                    onClick={() => void apply()}
                  >
                    应用第 {preview.version} 版
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 py-6 text-sm leading-7 text-journal-muted">
              <h2 className="text-lg font-semibold text-journal-ink">
                待应用变更
              </h2>
              <p>
                {loading
                  ? "正在恢复提案…"
                  : running
                    ? "正在生成预览，正式旅程保持原样。"
                    : "发送要求后在这里核对变更，再明确应用。"}
              </p>
            </div>
          )}
        </section>
      </div>
      {confirmation}
    </main>
  )
}
