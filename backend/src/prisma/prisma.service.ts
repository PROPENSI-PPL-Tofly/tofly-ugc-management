import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Reached on SIGTERM via enableShutdownHooks() in main.ts. Releases this
  // instance's pooled connection instead of leaving it to time out on the
  // free-tier pooler, which allows exactly one per instance (connection_limit=1).
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
