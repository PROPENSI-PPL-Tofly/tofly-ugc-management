import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubmissionRevisionController } from './submission-revision.controller.js';
import { SubmissionRevisionRepository } from './submission-revision.repository.js';
import { SubmissionRevisionService } from './submission-revision.service.js';

@Module({
  imports: [PrismaModule],

  controllers: [SubmissionRevisionController],

  providers: [
    {
      provide: SubmissionRevisionRepository,
      useFactory: (prisma: PrismaService) =>
        new SubmissionRevisionRepository(prisma),
      inject: [PrismaService],
    },

    {
      provide: SubmissionRevisionService,
      useFactory: (repository: SubmissionRevisionRepository) =>
        new SubmissionRevisionService(repository),
      inject: [SubmissionRevisionRepository],
    },

    {
      provide: 'SubmissionRevisionService',
      useExisting: SubmissionRevisionService,
    },
  ],
})
export class SubmissionsModule {}