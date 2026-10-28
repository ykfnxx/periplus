"use client"

import { Popover } from "@base-ui/react/popover"
import { Camera, MoreHorizontal, NotebookPen, Users } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/kumo/components/button/button"

export default function RecordingMenu({
  onReceipt,
  onMembers,
  onSettings,
}: {
  onReceipt: () => void
  onMembers: () => void
  onSettings?: () => void
}) {
  const [open, setOpen] = useState(false)
  const items = [
    { label: "拍账单", icon: Camera, action: onReceipt },
    { label: "同行者", icon: Users, action: onMembers },
    ...(onSettings
      ? [{ label: "旅程信息", icon: NotebookPen, action: onSettings }]
      : []),
  ]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={<Button variant="ghost" shape="square" aria-label="旅程操作" />}
      >
        <MoreHorizontal size={18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-30"
        >
          <Popover.Popup className="journal-directory flex w-44 flex-col gap-1 rounded-2xl bg-white p-2 shadow-journal outline-none">
            {items.map(({ label, icon: Icon, action }) => (
              <Button
                key={label}
                variant="ghost"
                className="justify-start! gap-3!"
                onClick={() => {
                  setOpen(false)
                  action()
                }}
              >
                <Icon size={17} />
                {label}
              </Button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
