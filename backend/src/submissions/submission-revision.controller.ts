import type { RevisionRequest } from './revise-submission.js';

export interface SubmissionReviser {
  revise(submissionId: string, input: RevisionRequest): Promise<unknown>;
}

export class SubmissionRevisionController {
  constructor(private readonly revisions: SubmissionReviser) {}

  async revise(_submissionId: string, _body: unknown): Promise<unknown> {
    throw new Error('Submission revision handling is not implemented yet');
  }
}
