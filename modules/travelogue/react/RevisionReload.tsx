"use client"
import { useStore } from "zustand"
import type { RecordingStore } from "../application/recording-session"
import RevisionReloadView from "../ui/workbench/RevisionReload"
export default function RevisionReload({ store, onReload }: { store: RecordingStore; onReload?: () => void }) {
  const conflict = useStore(store, (state) => state.conflict)
  const loading = useStore(store, (state) => state.loading)
  return <RevisionReloadView conflict={conflict} loading={loading} onReload={async () => { await store.getState().load(); if (!store.getState().error) onReload?.() }} />
}
