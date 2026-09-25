import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import type { RevisionRequest } from './revise-submission.js';

export interface SubmissionRevisionRepository {
  findById(
    submissionId: string,
  ): Promise<{ id: string; status: string } | null>;

  saveRevision(
    submissionId: string,
    revisionNotes: string,
  ): Promise<unknown>;
}

export class SubmissionRevisionService {
  constructor(
    private readonly repository: SubmissionRevisionRepository,
  ) {}

  async revise(
    submissionId: string,
    input: RevisionRequest,
  ): Promise<unknown> {
    const submission = await this.repository.findById(submissionId);

    if (!submission) {
      throw new NotFoundException('Submission tidak ditemukan');
    }

    if (submission.status !== 'review') {
      throw new BadRequestException(
        'Submission tidak sedang menunggu review',
      );
    }

    return this.repository.saveRevision(
      submissionId,
      input.revisionNotes,
    );
  }
}