"use client"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type {
  SharePreview,
  ShareStatus,
} from "@/modules/data-model/contracts/sharing"
import { recordingApi } from "../adapters/recording-http"
import { useConfirmation } from "../../../components/ui/Modal"

import { createSharingSession } from "../application/sharing"
import ShareManagerView from "../ui/sharing/ShareManager"

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
  const [session] = useState(() =>
    createSharingSession(journeyId, initialStatus, initialPreview, recordingApi)
  )
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  const { status } = snapshot
  const [online, setOnline] = useState(true)
  const link = useRef<HTMLInputElement>(null)
  const { ask, confirmation } = useConfirmation()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      session.dispose()
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [session])
  async function stop() {
    if (
      await ask("原链接将无法打开，旅程和照片会保留。", {
        title: "停止分享这篇游记？",
        cancelLabel: "继续分享",
        confirmLabel: "停止分享",
      })
    )
      await session.stop()
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(status.url!)
      session.setNotice("分享链接已复制。")
    } catch {
      link.current?.focus()
      link.current?.select()
      session.setNotice("请手动复制已选中的分享链接。")
    }
  }
  return (
    <ShareManagerView
      {...snapshot}
      pending={!!snapshot.pending}
      online={online}
      link={link}
      confirmation={confirmation}
      returnHref={returnHref}
      changeCosts={session.changeCosts}
      refresh={session.refresh}
      confirmPending={session.confirmPending}
      publish={session.publish}
      stop={stop}
      copy={copy}
    />
  )
}
