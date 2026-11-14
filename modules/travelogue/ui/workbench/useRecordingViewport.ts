"use client"
import { useSyncExternalStore } from "react"
function subscribe(callback: () => void) {
  window.addEventListener("resize", callback)
  return () => window.removeEventListener("resize", callback)
}
function snapshot() {
  return `${window.innerWidth}:${window.innerHeight}`
}
export default function useRecordingViewport() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "1440:900")
  const [width, height] = value.split(":").map(Number)
  return { width, height, desktop: width >= 768 }
}
