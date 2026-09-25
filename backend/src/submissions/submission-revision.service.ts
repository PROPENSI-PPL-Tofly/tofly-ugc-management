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
    _submissionId: string,
    _input: RevisionRequest,
  ): Promise<unknown> {
    throw new Error('Submission revision service is not implemented yet');
  }
}