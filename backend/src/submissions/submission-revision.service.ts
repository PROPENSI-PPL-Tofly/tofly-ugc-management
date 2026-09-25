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
    await this.repository.findById(submissionId);

    return this.repository.saveRevision(
      submissionId,
      input.revisionNotes,
    );
  }
}