export interface QueryRetryFailure {
  retryable: boolean
  rateLimited?: boolean
}

interface QueryRetryOptions<T> {
  operation: () => Promise<T>
  failure: (result: T) => QueryRetryFailure | undefined
  maxAttempts?: number
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  signal?: AbortSignal
}

export interface QueryRetryResult<T> {
  result: T
  attempts: number
  exhausted: boolean
}

const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 200
const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForRetry(
  milliseconds: number,
  sleep: (milliseconds: number) => Promise<void>,
  signal?: AbortSignal
) {
  if (!signal) return sleep(milliseconds)
  if (signal.aborted) return
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
    void sleep(milliseconds).then(
      () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      }
    )
  })
}

export async function queryWithRetry<T>(
  options: QueryRetryOptions<T>
): Promise<QueryRetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await options.operation()
    const failure = options.failure(result)
    if (!failure) return { result, attempts: attempt, exhausted: false }

    if (!failure.retryable || attempt === maxAttempts) {
      return { result, attempts: attempt, exhausted: true }
    }

    const baseDelay = failure.rateLimited
      ? RATE_LIMIT_RETRY_BASE_DELAY_MS
      : RETRY_BASE_DELAY_MS
    const exponentialDelay = baseDelay * 2 ** (attempt - 1)
    const jitter = 0.75 + random() * 0.5
    await waitForRetry(
      Math.round(exponentialDelay * jitter),
      sleep,
      options.signal
    )
  }

  throw new Error("Provider retry loop ended without a result")
}
