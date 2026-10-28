import { useEffect, useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import JoinJourney from "./JoinJourney"
import RecordingEditor from "./RecordingEditor"
import { createRecordingStore } from "../state/recording-store"
import { RecordingApiError, type RecordingApi } from "../data/client"
import {
  createStoryRecordingApi,
  sharedJourney,
  storyOwner,
} from "./recording-story-data"

const meta = {
  title: "Travelogue/Collaboration",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

function JoinedEditor() {
  const [store] = useState(() =>
    createRecordingStore(
      "hangzhou",
      createStoryRecordingApi(false, 0, sharedJourney)
    )
  )
  useEffect(() => {
    void store.getState().load()
    return () => store.getState().dispose()
  }, [store])
  return <RecordingEditor store={store} onBack={() => {}} />
}

function JoinStory({
  authenticated = true,
  expired = false,
  failJoin = false,
}: {
  authenticated?: boolean
  expired?: boolean
  failJoin?: boolean
}) {
  const [joined, setJoined] = useState(false)
  const [api] = useState<Pick<RecordingApi, "invitation" | "acceptInvitation">>(
    () => {
      let failed = false
      return {
        invitation: async () => {
          if (expired)
            throw new RecordingApiError(
              "Invitation not found",
              404,
              "NOT_FOUND"
            )
          return {
            journeyId: "hangzhou",
            journeyTitle: "杭州慢游",
            owner: storyOwner,
            expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          }
        },
        acceptInvitation: async () => {
          if (failJoin && !failed) {
            failed = true
            throw new RecordingApiError("Request failed", 503)
          }
          setJoined(true)
          return { journeyId: "hangzhou" }
        },
      }
    }
  )
  return joined ? (
    <JoinedEditor />
  ) : (
    <JoinJourney
      token="story-invitation"
      authenticated={authenticated}
      api={api}
    />
  )
}

export const Invitation: Story = { render: () => <JoinStory /> }
export const LoginToJoin: Story = {
  render: () => <JoinStory authenticated={false} />,
}
export const ExpiredInvitation: Story = { render: () => <JoinStory expired /> }
export const JoinFailure: Story = { render: () => <JoinStory failJoin /> }
