export interface OtelConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  endpoint: string;
  headers: Record<string, string>;
}

export const otelConfig = (): OtelConfig => {
  const licenseKey = process.env.NEW_RELIC_LICENSE_KEY ?? '';

  return {
    enabled:
      process.env.OTEL_ENABLED === 'true' ||
      (process.env.NODE_ENV !== 'test' && licenseKey !== ''),
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'oficina-execution-service',
    serviceVersion: process.env.APP_VERSION ?? '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    endpoint:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'https://otlp.nr-data.net',
    headers: licenseKey ? { 'api-key': licenseKey } : {},
  };
};
