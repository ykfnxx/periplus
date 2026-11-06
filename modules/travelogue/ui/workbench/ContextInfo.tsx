"use client"

import { useRef, useState, type ReactNode } from "react"
import { Popover } from "@base-ui/react/popover"

export default function ContextInfo({
  label,
  className,
  children,
  content,
}: {
  label: string
  className: string
  children: ReactNode
  content: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const returningFocus = useRef(false)
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "escape-key")
          returningFocus.current = true
        setOpen(next)
      }}
    >
      <Popover.Trigger
        className={className}
        aria-label={label}
        openOnHover
        delay={150}
        onFocus={(event) => {
          if (returningFocus.current) {
            returningFocus.current = false
            return
          }
          if (event.currentTarget.matches(":focus-visible")) setOpen(true)
        }}
        onBlur={() => {
          returningFocus.current = false
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="cards-info-popover" initialFocus={false}>
            <Popover.Title className="sr-only">{label}</Popover.Title>
            {content}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
