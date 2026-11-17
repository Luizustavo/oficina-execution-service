import { randomUUID } from 'node:crypto';

import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';

const HEALTH_PATH = '/api/execution/health';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-signature"]',
  'req.body.document',
  'res.headers["set-cookie"]',
];

export const loggingConfig = (): Params => ({
  pinoHttp: {
    level:
      process.env.LOG_LEVEL ??
      (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'HH:MM:ss' },
          },
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      const id =
        (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    customProps: () => ({
      service: process.env.OTEL_SERVICE_NAME ?? 'oficina-execution-service',
      env: process.env.NODE_ENV ?? 'development',
    }),
    autoLogging: {
      ignore: (req: IncomingMessage) => (req.url ?? '').startsWith(HEALTH_PATH),
    },
    customLogLevel: (_req, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },
});
