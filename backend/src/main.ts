import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Sets the defensive response headers (nosniff, frame-deny, HSTS in production) that the
  // browser needs before it can enforce anything on our behalf. The default CSP is left in
  // place: this service returns JSON, so nothing here should ever be treated as a document.
  app.use(helmet());
  // Query and body parameters are only what a DTO declares: anything else is dropped, and
  // a value of the wrong shape is a 400 instead of reaching a query.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Only enable CORS when a frontend origin is named. In production the browser
  // talks solely to the frontend's own origin, which proxies /api/* to us, so
  // nothing calls this API cross-origin and a permissive default would be
  // needless surface on a public service. Local dev sets FRONTEND_URL in .env.
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    app.enableCors({ origin: frontendUrl, credentials: true });
  }
  // Cloud Run sends SIGTERM on every deploy and scale-down, then allows 10 s
  // for cleanup. Without this Nest ignores the signal and onModuleDestroy
  // hooks (e.g. PrismaService releasing its connection) never run.
  app.enableShutdownHooks();
  // Bind all interfaces: Cloud Run injects PORT and health-checks over the
  // container network, so listening on loopback fails the revision at startup.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
