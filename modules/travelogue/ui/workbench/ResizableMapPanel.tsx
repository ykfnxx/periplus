"use client"
import { useRef, type ReactNode } from "react"
import { Group, Panel, Separator } from "react-resizable-panels"
import { motion, useDragControls, useReducedMotion } from "motion/react"
import { Button } from "@/components/kumo/components/button/button"
import useRecordingViewport from "../useRecordingViewport"

export default function ResizableMapPanel({
  children,
  width = 392,
  onWidth,
  sheet = "half",
  onSheet,
  recording = false,
}: {
  children: ReactNode
  recording?: boolean
  width?: number
  onWidth?: (width: number) => void
  sheet?: "small" | "half" | "full"
  onSheet?: (sheet: "small" | "half" | "full") => void
}) {
  const { desktop, height } = useRecordingViewport()
  const controls = useDragControls()
  const dragged = useRef(false)
  const reduced = useReducedMotion()
  if (desktop)
    return (
      <Group
        orientation="horizontal"
        className={`pointer-events-none absolute h-auto! ${recording ? "inset-y-7 right-5 left-5" : "inset-5"}`}
        id="record-workbench"
      >
        <Panel
          id="records"
          defaultSize={width}
          minSize={recording ? 336 : 320}
          maxSize={recording ? 440 : 560}
          onResize={(size) => onWidth?.(size.inPixels)}
        >
          <section
            aria-label="旅程面板"
            className="journal-panel pointer-events-auto flex h-full flex-col overflow-hidden rounded-[20px] border border-ink-10 bg-soft-white shadow-periplus"
          >
            {children}
          </section>
        </Panel>
        <Separator
          className={`group pointer-events-auto flex items-center justify-center outline-none focus-visible:bg-russet/20 ${recording ? "w-4" : "w-3"}`}
          aria-label="调整记录面板宽度"
        >
          <span className="h-14 w-1 rounded-full bg-ink-20 opacity-30 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </Separator>
        <Panel id="map-space" minSize={recording ? 0 : 240} />
      </Group>
    )
  const sheetHeight =
    sheet === "small"
      ? 164
      : sheet === "full"
        ? height - 24
        : Math.round(height * 0.55)
  return (
    <motion.section
      aria-label="旅程面板"
      className="journal-panel absolute inset-x-3 bottom-3 z-20 flex flex-col overflow-hidden rounded-[20px] border border-ink-10 bg-soft-white shadow-periplus"
      animate={{ height: sheetHeight, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 38 }
      }
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.12}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.y) > 45 || Math.abs(info.velocity.y) > 400)
          onSheet?.(info.offset.y < 0 ? "full" : "small")
      }}
    >
      <Button
        variant="ghost"
        aria-label="调整记录列表高度"
        className="h-6! shrink-0 touch-none rounded-none"
        onPointerDown={(event) => {
          dragged.current = false
          controls.start(event)
        }}
        onClick={() => {
          if (!dragged.current)
            onSheet?.(
              sheet === "small" ? "half" : sheet === "half" ? "full" : "half"
            )
        }}
      >
        <span className="h-1 w-9 rounded-full bg-ink-20" />
      </Button>
      {children}
    </motion.section>
  )
}
