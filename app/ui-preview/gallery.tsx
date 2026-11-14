"use client"
import { useState } from "react"
import EventEditor from "@/modules/travelogue/ui/events/EventEditor.preview"
import DraftEditor from "@/modules/travelogue/ui/drafts/DraftEditor.preview"
import PhotoPanel from "@/modules/travelogue/ui/photos/PhotoPanel.preview"
import ReceiptImport from "@/modules/travelogue/ui/receipts/ReceiptImport.preview"
import ShareManager from "@/modules/travelogue/ui/sharing/ShareManager.preview"
import JourneyLibrary from "@/modules/travelogue/ui/library/JourneyLibrary.preview"
import JourneyMembers from "@/modules/travelogue/ui/collaboration/JourneyMembers.preview"
import LoginForm from "@/modules/auth/ui/LoginForm.preview"
import RegisterForm from "@/modules/auth/ui/RegisterForm.preview"
import AuthorizeForm from "@/modules/agent/ui/AuthorizeForm.preview"
import GrantList from "@/modules/agent/ui/GrantList.preview"
import type { PreviewVariant } from "@/modules/travelogue/ui/workbench/fixtures.preview"
const scenes = {
  事件编辑: EventEditor,
  本机草稿: DraftEditor,
  照片: PhotoPanel,
  账单: ReceiptImport,
  分享: ShareManager,
  旅程目录: JourneyLibrary,
  同行者: JourneyMembers,
  登录: LoginForm,
  注册: RegisterForm,
  授权: AuthorizeForm,
  已有授权: GrantList,
}
export default function PreviewGallery() {
  const [scene, setScene] = useState<keyof typeof scenes>("事件编辑")
  const [variant, setVariant] = useState<PreviewVariant>("ready")
  const Scene = scenes[scene]
  return (
    <>
      <nav
        aria-label="组件预览"
        className="fixed top-2 right-2 z-[100] flex gap-2 rounded-xl border border-ink-15 bg-soft-white p-2 text-sm shadow-periplus"
      >
        <select
          aria-label="预览组件"
          value={scene}
          onChange={(event) =>
            setScene(event.target.value as keyof typeof scenes)
          }
        >
          {Object.keys(scenes).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          aria-label="预览状态"
          value={variant}
          onChange={(event) => setVariant(event.target.value as PreviewVariant)}
        >
          {(["ready", "empty", "busy", "error", "conflict"] as const).map(
            (state) => (
              <option key={state}>{state}</option>
            )
          )}
        </select>
      </nav>
      <Scene key={`${scene}:${variant}`} variant={variant} />
    </>
  )
}
