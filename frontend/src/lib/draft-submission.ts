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
  contentId: string,
  input: DraftSubmissionInput,
): Promise<DraftSubmissionResult> {
  // Keep HTTP communication in this service instead of inside the UI component.
  await fetch(`/api/contents/${contentId}/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  // Response handling will be added in a later TDD cycle.
  return {
    ok: false,
    message: "Response handling not implemented",
  };
}