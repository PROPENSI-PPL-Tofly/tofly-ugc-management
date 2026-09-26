import { safeHref } from "./safe-href";

export interface VideoSubmissionInput {
  link: string;
}

export interface SubmittedVideo {
  contentId: string;
  status: string;
  videoLink: string;
  platform: "instagram" | "tiktok";
  submittedAt: string;
}

// Field-specific errors can later be displayed beside the related form field.
// The backend names this field `videoLink` (422 from the video submission boundary).
export interface VideoSubmissionFieldErrors {
  videoLink?: string;
}

export type VideoSubmissionResult =
  | {
      ok: true;
      submission: SubmittedVideo;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      errors?: VideoSubmissionFieldErrors;
    };

// Describes any function that can submit the final video link.
// The UI can depend on this contract instead of a specific implementation.
export type VideoSubmitter = (
  contentId: string,
  input: VideoSubmissionInput,
) => Promise<VideoSubmissionResult>;

// The platforms the backend accepts (detectVideoPlatform): the exact host or a
// subdomain of instagram.com / tiktok.com over http(s). Checked client-side so
// a wrong link gets an error as soon as it is typed; the backend still decides.
const SUPPORTED_VIDEO_HOSTS = ["instagram.com", "tiktok.com"];

export function isSupportedVideoLink(link: string): boolean {
  const href = safeHref(link);

  if (href === null) {
    return false;
  }

  // safeHref already proved the link parses over http(s).
  const hostname = new URL(href).hostname.toLowerCase();

  return SUPPORTED_VIDEO_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

export async function submitVideo(
  contentId: string,
  input: VideoSubmissionInput,
): Promise<VideoSubmissionResult> {
  // Keep HTTP communication separate from the UI component.
  const response = await fetch(
    `/api/contents/${encodeURIComponent(contentId)}/video`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  // A successful response contains the submitted video link.
  if (response.ok) {
    const submission = (await response.json()) as SubmittedVideo;

    return {
      ok: true,
      submission,
    };
  }

  // An empty or unreadable error body still has to answer the caller.
  let body: {
    message?: unknown;
    code?: unknown;
    errors?: { videoLink?: unknown };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return {
      ok: false,
      message: "Video gagal dikirim. Coba lagi.",
    };
  }

  const result: VideoSubmissionResult = {
    ok: false,
    message:
      typeof body.message === "string"
        ? body.message
        : "Video gagal dikirim. Coba lagi.",
  };

  // Preserve a machine-readable error code when provided.
  if (typeof body.code === "string") {
    result.code = body.code;
  }

  // Preserve valid field-specific error messages.
  if (body.errors) {
    const errors: VideoSubmissionFieldErrors = {};

    if (typeof body.errors.videoLink === "string") {
      errors.videoLink = body.errors.videoLink;
    }

    result.errors = errors;
  }

  return result;
}
