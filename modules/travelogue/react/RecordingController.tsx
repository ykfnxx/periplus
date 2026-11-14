"use client"
import { useMemo, type ComponentProps } from "react"
import { useStore } from "zustand"
import type { RecordingStore } from "../application/recording-session"
import { createRecordingActions } from "../application/recording-actions"
import { createReceiptActions } from "../application/receipts"
import RecordingWorkbench, {
  type RecordingPanels,
} from "../ui/workbench/RecordingWorkbench"
import DraftEntry from "./DraftEntry"
import EventEditor from "./EventEditorController"
import PhotoPanel from "./PhotoController"
import ReceiptDetails from "./ReceiptDetailsController"
import ReceiptImport from "./ReceiptController"
import JourneyMembers from "./MembersController"
import RevisionReload from "./RevisionReload"
export default function RecordingController({
  userId,
  store,
  ...props
}: Omit<
  ComponentProps<typeof RecordingWorkbench>,
  "snapshot" | "actions" | "panels" | "draftEntry"
> & { userId: string; store: RecordingStore }) {
  const snapshot = useStore(store)
  const actions = useMemo(() => createRecordingActions(store), [store])
  const panels = useMemo<RecordingPanels>(() => {
    const receipts = createReceiptActions(store)
    return {
      EventEditor: (props) => (
        <EventEditor {...props} store={store} userId={userId} />
      ),
      PhotoPanel: (props) => <PhotoPanel {...props} store={store} />,
      ReceiptDetails: ({ canEdit, ...props }) => (
        <ReceiptDetails {...props} store={canEdit ? store : undefined} />
      ),
      ReceiptImport: (props) => (
        <ReceiptImport
          {...props}
          {...receipts}
          revisionNotice={<RevisionReload store={store} />}
        />
      ),
      JourneyMembers: (props) => <JourneyMembers {...props} store={store} />,
      RevisionReload: () => <RevisionReload store={store} />,
    }
  }, [store, userId])
  return (
    <RecordingWorkbench
      {...props}
      snapshot={snapshot}
      actions={actions}
      panels={panels}
      draftEntry={
        <DraftEntry
          userId={userId}
          journeys={
            props.directoryLoading ||
            props.directoryError ||
            !props.onOpenJourney
              ? undefined
              : props.journeys
          }
        />
      }
    />
  )
}
