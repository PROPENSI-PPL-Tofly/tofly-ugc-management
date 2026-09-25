import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubmissionRevisionController } from './submission-revision.controller.js';
import { SubmissionRevisionService } from './submission-revision.service.js';
import { SubmissionsModule } from './submissions.module.js';

describe('SubmissionsModule', () => {
  it('provides the submission revision controller and service', async () => {
    const module = await Test.createTestingModule({
      imports: [SubmissionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(SubmissionRevisionController)).toBeDefined();
    expect(module.get(SubmissionRevisionService)).toBeDefined();
  });
});