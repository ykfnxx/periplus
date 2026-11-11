import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { PlanningWorkbench } from "@/modules/planning/ui/PlanningPage"
import { createPlanningStore } from "@/modules/planning/client/store"
import {
  PlanningRequestError,
  type PlanningApi,
} from "@/modules/planning/client/api"
import { recordingApi } from "@/modules/travelogue/data/client"
import { journeyFixture } from "@/tests/fixtures/journey"
import { proposal, preview } from "./fixtures"

const receipt = {
  proposalId: "proposal",
  version: 2,
  journeyId: "journey",
  appliedRevision: 13,
  replayed: false,
}
function setup(initial = proposal(), initialId: string | null = "proposal") {
  const api = {
    create: vi
      .fn<PlanningApi["create"]>()
      .mockResolvedValue({
        proposalId: "proposal",
        runId: "run",
        parentVersion: 0,
      }),
    get: vi.fn<PlanningApi["get"]>().mockResolvedValue(initial),
    turn: vi.fn<PlanningApi["turn"]>().mockResolvedValue({ runId: "next-run" }),
    cancel: vi.fn<PlanningApi["cancel"]>().mockResolvedValue({}),
    discard: vi.fn<PlanningApi["discard"]>().mockResolvedValue({}),
    apply: vi.fn<PlanningApi["apply"]>().mockResolvedValue(receipt),
  }
  const store = createPlanningStore("journey", initialId, api)
  const rendered = render(
    <PlanningWorkbench
      journey={{ ...journeyFixture(), eventCount: 0 }}
      store={store}
    />
  )
  return { api, store, ...rendered }
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("requires explicit confirmation of the displayed version before sending apply", async () => {
  const { api } = setup()
  const apply = await screen.findByRole("button", {
    name: "应用第 2 版",
  })
  await waitFor(() => expect(apply).toBeEnabled())
  expect(screen.getByText("涉及：2 张照片、1 张账单")).toBeInTheDocument()
  expect(screen.getByText("原交通路线将失效，需重新查询")).toBeInTheDocument()
  fireEvent.click(apply)
  expect(api.apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "继续核对" }))
  expect(api.apply).not.toHaveBeenCalled()
})

it("keeps the version from the confirmation dialog when a newer preview arrives", async () => {
  const { api, store } = setup()
  const apply = await screen.findByRole("button", {
    name: "应用第 2 版",
  })
  await waitFor(() => expect(apply).toBeEnabled())
  fireEvent.click(apply)
  const newer = proposal({
    latestVersion: 3,
    preview: { ...preview, version: 3 },
  })
  act(() => store.setState({ proposal: newer }))
  api.get.mockResolvedValue(newer)
  api.apply.mockRejectedValueOnce(
    new PlanningRequestError("请核对新版", 409, "PROPOSAL_VERSION_CONFLICT")
  )
  fireEvent.click(screen.getByRole("button", { name: "确认应用第 2 版" }))
  await waitFor(() =>
    expect(api.apply).toHaveBeenCalledWith("journey", "proposal", 2)
  )
  expect(api.apply).toHaveBeenCalledTimes(1)
  await screen.findByText("请核对新版")
  expect(
    screen.getByRole("button", { name: "应用第 3 版" })
  ).toBeInTheDocument()
})

it("answers only the current question with its opaque choice reference", async () => {
  const current = proposal({
    question: {
      runId: "current-question",
      message: "是否接受文字安排？",
      choices: [{ choiceRef: "opaque-1", label: "接受文字安排" }],
    },
  })
  const { api } = setup(current)
  const choice = await screen.findByRole("button", {
    name: "接受文字安排",
  })
  await waitFor(() => expect(choice).toBeEnabled())
  fireEvent.click(choice)
  await waitFor(() =>
    expect(api.turn).toHaveBeenCalledWith(
      "journey",
      "proposal",
      expect.objectContaining({
        replyToRunId: "current-question",
        choiceRef: "opaque-1",
        parentVersion: 2,
      })
    )
  )
  expect(api.apply).not.toHaveBeenCalled()
})

it("keeps preview visible but disables applying after a failed recovery read", async () => {
  const { api, store } = setup()
  await screen.findByRole("button", { name: "应用第 2 版" })
  api.get.mockRejectedValueOnce(new TypeError("offline"))
  await act(async () => {
    await store.getState().load()
  })
  expect(screen.getByRole("button", { name: "应用第 2 版" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled()
  expect(screen.getByText(/基于旅程修订 12/)).toBeInTheDocument()
})

it("shows the original applied revision and separately refreshes the current journey", async () => {
  vi.spyOn(recordingApi, "get").mockResolvedValue({
    ...journeyFixture(),
    revision: 14,
  })
  const { api } = setup(
    proposal({
      status: "APPLIED",
      currentJourneyRevision: 14,
      receipt: { ...receipt, replayed: true },
    })
  )
  await screen.findByRole("heading", { name: "第 2 版已应用" })
  await screen.findByText(/已读取最新旅程：修订 14/)
  expect(screen.getByText("变更已保存到旅程修订 13。")).toBeInTheDocument()
  expect(api.apply).not.toHaveBeenCalled()
})

it("matches live places by reference and never retains a display-only name in the turn message", async () => {
  const { api, store } = setup(
    proposal({
      question: {
        runId: "place-question",
        message: "请选择地点",
        choices: [
          { choiceRef: "candidate-2", label: "地点选项 2" },
          { choiceRef: "ordinary", label: "改为文字安排" },
        ],
      },
      livePlaces: [
        { candidateRef: "candidate-1", name: "错误分店" },
        {
          candidateRef: "candidate-2",
          name: "湖滨分店",
          city: "杭州",
          address: "测试地址",
        },
      ],
    })
  )
  const choice = await screen.findByRole("button", {
    name: /湖滨分店/,
  })
  await waitFor(() => expect(choice).toBeEnabled())
  fireEvent.click(choice)
  await waitFor(() =>
    expect(api.turn).toHaveBeenCalledWith(
      "journey",
      "proposal",
      expect.objectContaining({
        choiceRef: "candidate-2",
        message: "地点选项 2",
      })
    )
  )
  act(() =>
    store.setState({
      proposal: proposal({
        question: {
          runId: "place-question",
          message: "请选择地点",
          choices: [{ choiceRef: "candidate-2", label: "地点选项 2" }],
        },
        livePlaces: [],
      }),
    })
  )
  expect(
    screen.queryByRole("button", { name: /湖滨分店/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "地点选项 2" })).toBeInTheDocument()
  expect(
    screen.getByPlaceholderText("写下答复，或要求重新查询")
  ).toBeInTheDocument()
})

it("clears a submitted message once retry confirms the original request", async () => {
  const { api } = setup(proposal(), null)
  api.create.mockRejectedValueOnce(new TypeError("lost response"))
  fireEvent.change(screen.getByLabelText("旅行要求"), {
    target: { value: "11月15日去杭州" },
  })
  fireEvent.click(screen.getByRole("button", { name: "发送要求" }))
  const retry = await screen.findByRole("button", { name: "重试原请求" })
  expect(screen.getByLabelText("旅行要求")).toHaveValue("11月15日去杭州")
  fireEvent.click(retry)
  await waitFor(() => expect(screen.getByLabelText("旅行要求")).toHaveValue(""))
  expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0])
})
