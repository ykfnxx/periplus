import type { PlanningApiError } from "../contracts"
export class PlanningError extends Error {
  constructor(
    public code: PlanningApiError["code"],
    message: string,
    public status: number
  ) {
    super(message)
  }
}
