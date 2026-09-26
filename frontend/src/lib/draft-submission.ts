export interface DraftSubmissionInput {
  link: string;
  notes: string | null;
}

export interface SubmittedDraft {
  contentId: string;
  submissionId: string;
  status: string;
  link: string;
  notes: string | null;
  submittedAt: string;
}

export type DraftSubmissionResult =
  | {
      ok: true;
      submission: SubmittedDraft;
    }
  | {
      ok: false;
      message: string;
    };

    
export async function submitDraft(
  _contentId: string,
  _input: DraftSubmissionInput,
): Promise<DraftSubmissionResult> {
  return {
    ok: false,
    message: "Not implemented",
  };
}