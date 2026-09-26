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

// Field-specific errors can later be displayed beside the related form field.
export interface DraftSubmissionFieldErrors {
  link?: string;
  notes?: string;
}

export type DraftSubmissionResult =
  | {
      ok: true;
      submission: SubmittedDraft;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      errors?: DraftSubmissionFieldErrors;
    };

// Describes any function that can submit a draft.
// The UI can depend on this contract instead of a specific implementation.
export type DraftSubmitter = (
  contentId: string,
  input: DraftSubmissionInput,
) => Promise<DraftSubmissionResult>;

const DRAFT_SUBMISSION_FALLBACK_MESSAGE = "Draft gagal dikirim. Coba lagi.";

export async function submitDraft(
  contentId: string,
  input: DraftSubmissionInput,
): Promise<DraftSubmissionResult> {
  try {
    const response = await fetch(`/api/contents/${contentId}/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (response.ok) {
      const submission = (await response.json()) as SubmittedDraft;

      return {
        ok: true,
        submission,
      };
    }

    const body = (await response.json()) as {
      message?: unknown;
      code?: unknown;
      errors?: {
        link?: unknown;
        notes?: unknown;
      };
    };

    const result: DraftSubmissionResult = {
      ok: false,
      message:
        typeof body.message === "string"
          ? body.message
          : DRAFT_SUBMISSION_FALLBACK_MESSAGE,
    };

    if (typeof body.code === "string") {
      result.code = body.code;
    }

    if (body.errors) {
      const errors: DraftSubmissionFieldErrors = {};

      if (typeof body.errors.link === "string") {
        errors.link = body.errors.link;
      }

      if (typeof body.errors.notes === "string") {
        errors.notes = body.errors.notes;
      }

      result.errors = errors;
    }

    return result;
  } catch {
    return {
      ok: false,
      message: DRAFT_SUBMISSION_FALLBACK_MESSAGE,
    };
  }
}
