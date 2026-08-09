const grafanaUrl = (
  process.env.GRAFANA_URL ??
  `http://127.0.0.1:${process.env.PERIPLUS_GRAFANA_PORT ?? "3003"}`
).replace(/\/$/, "")
const grafanaUser = process.env.GRAFANA_ADMIN_USER
const grafanaPassword = process.env.GRAFANA_ADMIN_PASSWORD
const timeoutMs = Number(process.env.GRAFANA_SMOKE_TIMEOUT_MS ?? "30000")

if (!grafanaUser || !grafanaPassword) {
  throw new Error(
    "GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD are required for the Grafana provisioning smoke"
  )
}

const authorization = `Basic ${Buffer.from(
  `${grafanaUser}:${grafanaPassword}`
).toString("base64")}`

const requiredResources = [
  "/api/datasources/uid/prometheus",
  "/api/datasources/uid/tempo",
  "/api/dashboards/uid/periplus-agent-api-overview",
  "/api/dashboards/uid/periplus-agent-runs",
] as const

async function getResource(path: string) {
  const response = await fetch(`${grafanaUrl}${path}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`)
  }
}

const sleep = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

async function main() {
  const deadline = Date.now() + timeoutMs
  let lastFailure = "Grafana provisioning is not ready"

  while (Date.now() < deadline) {
    const results = await Promise.allSettled(
      requiredResources.map((path) => getResource(path))
    )
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [`${requiredResources[index]}: ${String(result.reason)}`]
        : []
    )
    if (failures.length === 0) {
      console.log(
        "Grafana provisioning smoke passed: 2 datasources and 2 dashboards are available"
      )
      return
    }
    lastFailure = failures.join("; ")
    await sleep(1_000)
  }

  throw new Error(
    `Grafana provisioning smoke timed out after ${timeoutMs}ms: ${lastFailure}`
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
