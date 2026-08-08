# Periplus observability

Start the local monitoring stack from the Periplus checkout:

```sh
docker compose -f ops/observability/compose.yaml up -d
```

Run the backend with `npm run dev:backend` and keep
`PERIPLUS_OBSERVABILITY_ENABLED=true` plus
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in the backend environment.
Grafana is available on port `PERIPLUS_GRAFANA_PORT` (3003 by default) and
Phoenix is available on port `PERIPLUS_PHOENIX_PORT` (6008 by default).

The Collector sends full technical traces to Tempo, metrics to Prometheus,
and the redacted Agent/Prompt subset to Phoenix. The named volumes preserve
Tempo, Prometheus, Grafana, and Phoenix data across component restarts.

For manual acceptance, run one Agent turn containing a model response, MCP
tool call, and Workspace command. Open the Agent/API Overview and Agent Runs
dashboards, restart the compose stack, and confirm the same run remains
queryable. Stop the Collector and repeat a run to verify that the backend
continues without telemetry changing the business result.
