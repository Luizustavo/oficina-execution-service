import {
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import {
  resourceFromAttributes,
  defaultResource,
} from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter,
} from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { otelConfig } from '@infrastructure/config/otel.config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { metrics } from '@opentelemetry/api';

const HEALTH_PATH = '/api/execution/health';

let sdk: NodeSDK | undefined;

export function startTracing(): void {
  const config = otelConfig();
  if (!config.enabled) {
    return;
  }

  const { headers, endpoint } = config;

  sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        'deployment.environment.name': config.environment,
      }),
    ),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
          headers,
          // Com CUMULATIVE o New Relic perde o primeiro ponto de cada série (ver docs/observabilidade.md do backend).
          temporalityPreference: AggregationTemporalityPreference.DELTA,
        }),
        exportIntervalMillis: 30_000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers }),
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Desligada: ela cria o span de publicação a partir do contexto ativo e
        // sobrescreve o traceparent gravado no outbox. Os spans de publicação e
        // consumo vêm de infrastructure/messaging/message-tracing.ts.
        '@opentelemetry/instrumentation-amqplib': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: true },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) =>
            (request.url ?? '').startsWith(HEALTH_PATH),
        },
      }),
    ],
  });

  sdk.start();

  // Sinal de vida a cada exportação: sem tráfego o serviço não gera span
  // nenhum, e o alerta de "serviço sem sinal" dispararia com ele saudável.
  metrics
    .getMeter(config.serviceName)
    .createObservableGauge('service.heartbeat', {
      description: 'Vale 1 enquanto o processo estiver exportando métricas',
    })
    .addCallback((result) => result.observe(1));

  const shutdown = (): void => {
    void sdk
      ?.shutdown()
      .catch((error: unknown) =>
        console.error('Erro ao encerrar o OpenTelemetry', error),
      )
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
