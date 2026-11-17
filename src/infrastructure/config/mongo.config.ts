export const mongoConfig = () => ({
  uri: process.env.MONGODB_URL ?? '',
  serverSelectionTimeoutMs: Number(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5_000,
  ),
});
