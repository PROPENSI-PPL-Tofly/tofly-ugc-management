import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** The one thing the health check needs from the database: a round trip it can await. */
export interface DatabasePing {
  $queryRaw: PrismaService['$queryRaw'];
}

@Controller('health')
export class HealthController {
  // Depends on the narrow ping, not on the whole Prisma client (DIP); Nest still hands it
  // PrismaService through the token.
  constructor(
    @Inject(PrismaService)
    private readonly db: DatabasePing,
  ) {}

  @Get()
  async check(): Promise<{ db: string }> {
    await this.db.$queryRaw`SELECT 1`;
    return { db: 'ok' };
  }
}
