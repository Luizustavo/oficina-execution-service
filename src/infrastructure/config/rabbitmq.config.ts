export const rabbitmqConfig = () => {
  const url = process.env.RABBITMQ_URL || '';
  return {
    rabbitmq: {
      url,
      enabled: url.length > 0,
      prefetch: Number(process.env.RABBITMQ_PREFETCH || 10),
      connectTimeoutMs: Number(
        process.env.RABBITMQ_CONNECT_TIMEOUT_MS || 5_000,
      ),
      publishTimeoutMs: Number(
        process.env.RABBITMQ_PUBLISH_TIMEOUT_MS || 5_000,
      ),
      relayIntervalMs: Number(process.env.OUTBOX_RELAY_INTERVAL_MS || 1_000),
      relayBatchSize: Number(process.env.OUTBOX_RELAY_BATCH_SIZE || 50),
    },
  };
};
