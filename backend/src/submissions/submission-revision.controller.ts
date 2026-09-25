import type { RevisionRequest } from './revise-submission.js';
import { checkRevisionRequest } from './revise-submission.js';

export interface SubmissionReviser {
  revise(
    submissionId: string,
    input: RevisionRequest,
  ): Promise<unknown>;
}

export class SubmissionRevisionController {
  constructor(private readonly revisions: SubmissionReviser) {}

  async revise(
    submissionId: string,
    body: unknown,
  ): Promise<unknown> {
    const validatedBody = checkRevisionRequest(body);

    return this.revisions.revise(submissionId, validatedBody);
  }
}