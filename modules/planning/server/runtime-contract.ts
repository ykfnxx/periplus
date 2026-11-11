import type {
  PlanningConstraint,
  PlanningEdit,
  PlanningEventSummary,
  PlanningLivePlace,
  PlanningMode,
  PlanningQuestion,
} from "../contracts"

// Sources refer to operation indexes and dotted fields such as content.location.name.
export type PlanningFieldSource = {
  operation: number
  path: string
} & (
  | { kind: "user"; quote: string }
  | { kind: "existing"; eventId: string; field: string }
  | { kind: "provider"; provider: string; policyId: string; factRef: string }
)
export interface PlanningProviderFact {
  factRef: string
  provider: string
  policyId: string
  value: unknown
}
// adjust returns edits after the previous preview; rebase returns a complete
// replacement batch against baseRevision. Question answers inherit their mode.
export type PlanningTurnOutput =
  | {
      kind: "changes"
      operations: PlanningEdit[]
      constraints: PlanningConstraint[]
      unverified: string[]
      sources: PlanningFieldSource[]
    }
  | {
      kind: "question"
      message: string
      choices: { choiceRef: string; label: string }[]
    }
export interface PlanningRunInput {
  proposalId: string
  runId: string
  journeyId: string
  parentVersion: number
  baseRevision: number
  mode: PlanningMode
  message: string
  replyToRunId?: string
  choiceRef?: string
  question?: PlanningQuestion
  userMessages: string[]
  baseEvents: PlanningEventSummary[]
  previewEvents: PlanningEventSummary[]
  operations: PlanningEdit[]
  constraints: PlanningConstraint[]
  rebaseConflicts: string[]
  deadline: string
  signal: AbortSignal
  onProgress: (message: string) => void
  onLivePlaces: (places: PlanningLivePlace[]) => void
}
// The adapter supplies the fact ledger, never the model. Display-only values and
// livePlaces stay in memory; permitted facts are checked again before applying.
export interface PlanningRuntimeResult {
  output: PlanningTurnOutput
  displayOnlyValues: unknown[]
  permittedFacts: PlanningProviderFact[]
}
export interface PlanningRuntime {
  run(input: PlanningRunInput): Promise<PlanningRuntimeResult>
  canRetain(fact: PlanningProviderFact): boolean
}
