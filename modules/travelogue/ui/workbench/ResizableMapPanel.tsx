"use client"

import { useRef, useState, type ReactNode } from "react"
import { Group, Panel, Separator } from "react-resizable-panels"
import useRecordingViewport from "./useRecordingViewport"

export const MOBILE_COLLAPSED_SHEET_HEIGHT = 34
const MOBILE_COLLAPSE_THRESHOLD = 64

export function mobileSheetHeight(viewportHeight: number, sheetRatio: number) {
  if (sheetRatio <= 0) return MOBILE_COLLAPSED_SHEET_HEIGHT
  return Math.max(
    MOBILE_COLLAPSE_THRESHOLD,
    Math.min(viewportHeight, Math.round(viewportHeight * sheetRatio))
  )
}

export default function ResizableMapPanel({
  children,
  width = 428,
  onWidth,
  sheetRatio = 0.65,
  onSheetRatio,
  recording = false,
  picking = false,
}: {
  children: ReactNode
  recording?: boolean
  picking?: boolean
  width?: number
  onWidth?: (width: number) => void
  sheetRatio?: number
  onSheetRatio?: (ratio: number) => void
}) {
  const { desktop, height } = useRecordingViewport()
  const [measuredWidth, setMeasuredWidth] = useState(width)
  const [liveHeight, setLiveHeight] = useState<number | null>(null)
  const dragOrigin = useRef<{ startY: number; startHeight: number } | null>(
    null
  )

  const settledHeight = mobileSheetHeight(height, sheetRatio)
  const currentHeight = liveHeight ?? settledHeight
  const collapsed = currentHeight < MOBILE_COLLAPSE_THRESHOLD

  return (
    <>
      {desktop && (
        <Group
          orientation="horizontal"
          className={`pointer-events-none absolute h-auto! ${recording ? "inset-y-6 right-5 left-5" : "inset-5"}`}
          id="record-workbench"
        >
          <Panel
            id="records"
            defaultSize={width}
            minSize={360}
            maxSize={540}
            onResize={(size) => {
              setMeasuredWidth(size.inPixels)
              onWidth?.(size.inPixels)
            }}
          ></Panel>
          <Separator
            className={`group pointer-events-auto flex items-center justify-center outline-none focus-visible:bg-journal-amber/15 ${recording ? "w-4" : "w-3"}`}
            aria-label="调整记录面板宽度"
          >
            <span className="h-14 w-1 rounded-full bg-ink-20 opacity-30 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </Separator>
          <Panel id="map-space" minSize={recording ? 0 : 240} />
        </Group>
      )}
      <section
        aria-label="旅程面板"
        style={{
          height: desktop ? undefined : `${currentHeight}px`,
          width: desktop ? `${measuredWidth}px` : undefined,
          transition:
            liveHeight !== null
              ? "none"
              : "height 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className={`journal-panel absolute z-20 flex flex-col overflow-hidden ${desktop ? (recording ? "inset-y-6 left-5" : "inset-y-5 left-5") : `journal-sheet inset-x-0 bottom-0 ${currentHeight >= height - 4 ? "pt-[env(safe-area-inset-top)]" : ""}`}`}
      >
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label="拖动调整面板高度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            collapsed ? 0 : Math.round((currentHeight / height) * 100)
          }
          className={`${desktop ? "hidden" : "flex"} h-[34px] w-full shrink-0 cursor-ns-resize touch-none items-center justify-center outline-none select-none focus-visible:bg-journal-canvas-recess`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragOrigin.current = {
              startY: event.clientY,
              startHeight: settledHeight,
            }
            setLiveHeight(settledHeight)
          }}
          onPointerMove={(event) => {
            if (!dragOrigin.current) return
            const deltaY = dragOrigin.current.startY - event.clientY
            const next = Math.max(
              MOBILE_COLLAPSED_SHEET_HEIGHT,
              Math.min(
                height,
                Math.round(dragOrigin.current.startHeight + deltaY)
              )
            )
            setLiveHeight(next)
            onSheetRatio?.(next < MOBILE_COLLAPSE_THRESHOLD ? 0 : next / height)
          }}
          onPointerUp={(event) => {
            if (!dragOrigin.current) return
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId)
            const finalHeight = liveHeight ?? settledHeight
            dragOrigin.current = null
            setLiveHeight(null)
            onSheetRatio?.(
              finalHeight < MOBILE_COLLAPSE_THRESHOLD
                ? 0
                : Math.min(1, finalHeight / height)
            )
          }}
          onPointerCancel={() => {
            dragOrigin.current = null
            setLiveHeight(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault()
              onSheetRatio?.(
                Math.min(1, (collapsed ? 0.35 : sheetRatio) + 0.15)
              )
            } else if (event.key === "ArrowDown") {
              event.preventDefault()
              const next = sheetRatio - 0.15
              onSheetRatio?.(next < 0.15 ? 0 : next)
            }
          }}
        >
          <span className="h-1 w-9 rounded-full bg-ink-20" />
        </div>
        <div
          inert={(!desktop && collapsed) || picking || undefined}
          className={`flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity duration-150 ${
            !desktop && collapsed
              ? "pointer-events-none opacity-0"
              : picking
                ? "pointer-events-none opacity-85"
                : "opacity-100"
          }`}
        >
          {children}
        </div>
      </section>
    </>
  )
}
