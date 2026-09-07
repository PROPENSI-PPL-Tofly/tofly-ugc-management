import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

// Fail fast at boot if DB creds are missing, instead of a buried Prisma error later.
function validate(config: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!config[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return config;
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate })],
  controllers: [AppController, HealthController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
