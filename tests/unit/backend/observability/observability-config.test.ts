import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8")

describe("observability configuration contract", () => {
  it("keeps Phoenix as an allowlisted redacted sink", () => {
    const collector = read("ops/observability/otel-collector.yaml")

    expect(collector).toContain('not (name == "agent.run"')
    expect(collector).toContain('name == "llm.request"')
    expect(collector).toContain("url.full")
    expect(collector).toContain("http.url")
    expect(collector).toContain("url.query")
    expect(collector).not.toContain("        - 'name == \"agent.run\"'")
  })

  it("requires runtime Grafana credentials and configures Phoenix retention", () => {
    const compose = read("ops/observability/compose.yaml")

    expect(compose).toContain("arizephoenix/phoenix:version-9.0.0")
    expect(compose).not.toContain("arizephoenix/phoenix:9.0.0")
    expect(compose).toContain('PHOENIX_DEFAULT_RETENTION_POLICY_DAYS: "30"')
    expect(compose).toContain(
      "${GRAFANA_ADMIN_USER:?GRAFANA_ADMIN_USER must be set at runtime}"
    )
    expect(compose).toContain(
      "${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD must be set at runtime}"
    )
    expect(compose).not.toContain("GRAFANA_ADMIN_USER:-")
    expect(compose).not.toContain("GRAFANA_ADMIN_PASSWORD:-")
  })

  it("exposes spanmetrics quantiles and run lookup variables", () => {
    const collector = read("ops/observability/otel-collector.yaml")
    expect(collector).toContain("name: http.request.method")
    expect(collector).toContain("name: http.response.status_code")
    expect(collector).not.toContain("name: http.method")
    expect(collector).not.toContain("name: http.status_code")
    expect(collector).toContain("periplus.stream.first_delta")
    expect(collector).toContain("periplus.stream.last_delta")

    const overview = JSON.parse(
      read("ops/observability/grafana/dashboards/agent-api-overview.json")
    ) as { panels: Array<{ targets?: Array<{ expr?: string }> }> }
    const overviewExpressions = overview.panels
      .flatMap((panel) => panel.targets ?? [])
      .map((target) => target.expr ?? "")
      .join("\n")
    expect(overviewExpressions).toContain("traces_span_metrics_calls_total")
    expect(overviewExpressions).toContain(
      "periplus_agent_tool_duration_milliseconds_bucket"
    )
    expect(overviewExpressions).toContain("histogram_quantile(0.5")
    expect(overviewExpressions).toContain("histogram_quantile(0.95")
    expect(overviewExpressions).toContain("histogram_quantile(0.99")
    expect(overviewExpressions).toContain(
      "periplus_agent_run_ttft_milliseconds_bucket"
    )
    expect(overviewExpressions).toContain("http_request_method")
    expect(overviewExpressions).toContain("http_response_status_code")
    expect(overviewExpressions).not.toContain("http_method")
    expect(overviewExpressions).not.toContain("http_status_code")

    const runs = JSON.parse(
      read("ops/observability/grafana/dashboards/agent-runs.json")
    ) as {
      templating: { list: Array<{ name: string }> }
      panels: Array<{ targets?: Array<{ query?: string }> }>
    }
    expect(runs.templating.list.map((variable) => variable.name)).toEqual(
      expect.arrayContaining([
        "session_id_hash",
        "run_id_hash",
        "runtime",
        "mode",
        "status",
        "prompt_version",
      ])
    )
    expect(runs.panels[0]?.targets?.[0]?.query).toContain(
      ".periplus.agent.run_id_hash =~ `$run_id_hash`"
    )
    expect(runs.panels[0]?.targets?.[0]?.query).toContain(
      ".periplus.agent.mode =~ `$mode`"
    )
  })
})
