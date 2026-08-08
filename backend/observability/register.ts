import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { periplusServerConfig } from "@/config/periplus.server"
import { setTelemetryShutdown } from "./agent-telemetry"

if (periplusServerConfig.observability.enabled) {
  const endpoint = periplusServerConfig.observability.otlpEndpoint
  const sdk = new NodeSDK({
    serviceName: periplusServerConfig.observability.serviceName,
    resource: resourceFromAttributes({
      "service.name": periplusServerConfig.observability.serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 5000,
        exportTimeoutMillis: 2000,
      }),
    ],
    instrumentations: [new HttpInstrumentation()],
  })

  sdk.start()
  setTelemetryShutdown(() => sdk.shutdown())
}
