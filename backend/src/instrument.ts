import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Imported first in main.ts so the whole boot path is instrumented. The DSN is injected by the
// platform; with no DSN the SDK is a no-op, which keeps tests and local runs quiet.
const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  profileSessionSampleRate: isProduction ? 0.1 : 1.0,
  profileLifecycle: 'trace',
});
