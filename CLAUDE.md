# CLAUDE.md

Execution Service of the "oficina mecânica" system (SOAT Tech Challenge, Phase 4). It owns the execution queue (diagnosis and repair of paid service orders), stores jobs in MongoDB (ADR-012) and takes part in the saga orchestrated by `oficina-backend` (ADR-011) through RabbitMQ only. READMEs, docs and code comments are in Brazilian Portuguese.

## Commands

```bash
npm run start:dev           # http://localhost:3000/api/execution/docs
npm test -- --coverage      # unit tests, 80% threshold on domain/ + application/
npm run test:e2e            # boots AppModule
npm run lint                # ESLint + Prettier with --fix
npm run build               # output in dist (start:prod = node dist/main)
```

## Conventions

Same architecture and conventions as `oficina-backend` (read its `CLAUDE.md`): Clean Architecture/DDD layers (`domain`, `application`, `infrastructure`, `shared`), path aliases `@domain/*`, `@application/*`, `@infrastructure/*`, `@shared/*`, repositories as abstract classes used as DI tokens, one use case per file with `Logger` injected last, application code throws only `@shared/exceptions/domain.exceptions` (mapped by `HttpExceptionFilter`), import ordering by clause length.

- **Clean code, few comments.** Names and small functions explain the code; a comment only for a short, non-obvious "why". Longer explanations go to the README, `docs/` or the ADRs in `oficina-backend`.
- **Route prefix `api/execution`** on every controller: Traefik routes by path prefix (ADR-015), and `/api` alone belongs to the OS Service.
- **Observability:** `startTracing()` is the first thing `main.ts` runs (imports above it silently disable OpenTelemetry). `OTEL_SERVICE_NAME=oficina-execution-service`.
- **Job state machine** lives in `ExecutionJobEntity`: `QUEUED → DIAGNOSING → REPAIRING → DONE`, `FAILED` from any active status (mechanic action, throws `InvalidStatusTransitionException` → 422 otherwise) and `CANCELED` from any active status (saga compensation, returns `false` instead of throwing so a repeated cancel is a no-op). Every change appends to `timeline`; `durationSeconds` is measured from `DIAGNOSING` to `DONE`.
- **Message contract** lives in `oficina-backend/docs/arquitetura/contratos-de-mensagens.md` and is the source of truth: change it there first.
- **CI/CD** mirrors `oficina-backend` (`docs/arquitetura/esteira-ci-cd.md` there), including what SonarCloud enforces: `npm ci --ignore-scripts`, third-party actions pinned by commit SHA, no hardcoded passwords, non-root image, `automountServiceAccountToken: false`, memory limits on every container. The runtime image installs production dependencies only (`npm ci --omit=dev`).
