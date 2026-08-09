# Periplus observability

Start the local monitoring stack from the Periplus checkout:

```sh
docker compose -f ops/observability/compose.yaml up -d
npm run observability:smoke
```

Run the backend with `npm run dev:backend` and keep
`PERIPLUS_OBSERVABILITY_ENABLED=true`, a private
`PERIPLUS_OBSERVABILITY_ID_SALT`, and
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in the backend environment.
The salt is required at startup when observability is enabled and must come
from ignored runtime environment/configuration.

Grafana credentials are also required runtime variables; set
`GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` before
`npm run observability:up`. The compose file has no usable credential default.
Grafana is available on port `PERIPLUS_GRAFANA_PORT` (3003 by default) and
Phoenix is available on port `PERIPLUS_PHOENIX_PORT` (6008 by default).
After the stack starts, `npm run observability:smoke` authenticates to Grafana
and waits for the two provisioned data sources (`prometheus`, `tempo`) and two
dashboards (`periplus-agent-api-overview`, `periplus-agent-runs`) to be
available through the Grafana API.

The Collector sends full technical traces to Tempo, metrics to Prometheus,
and the redacted Agent/Prompt subset to Phoenix. The named volumes preserve
Tempo, Prometheus, Grafana, and Phoenix data across component restarts. Phoenix
is configured with the Phoenix 9 retention policy environment variable for
30-day trace retention.

For manual acceptance, run one Agent turn containing a model response, MCP
tool call, and Workspace command. Open the Agent/API Overview and Agent Runs
dashboards, restart the compose stack, and confirm the same run remains
queryable. Stop the Collector and repeat a run to verify that the backend
continues without telemetry changing the business result.
