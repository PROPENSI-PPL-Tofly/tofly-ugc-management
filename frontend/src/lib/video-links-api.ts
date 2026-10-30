// The calls behind Kirim Link Video, kept out of the modal. 38.2's routes: POST
// /contents/:id/links adds one or more platform links, and PUT /contents/:id/links/:platform
// replaces one. A refused field's message comes back keyed by its platform.

import { apiFetch } from "./api-client";
import { VIDEO_PLATFORMS, type LinkChanges, type LinkProblems, type VideoPlatform } from "./video-links";

/** AC 5, worded as the backend's VIDEO_LINK_TAKEN refusal (38.1). */
export const LINK_TAKEN_MESSAGE = "Link ini sudah dipakai di konten lain";
export const LINK_TAKEN = "VIDEO_LINK_TAKEN";

const SAVE_FAILED = "Link video gagal dikirim. Coba lagi.";

export type VideoLinksSaveResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      code?: string;
      errors?: LinkProblems;
      /** What went through before the refusal, so trying again does not send it twice. */
      saved?: LinkChanges["added"];
    };

/** The contract the modal depends on, so a test can hand it a stand-in. */
export type VideoLinksSaver = (
  contentId: string,
  changes: LinkChanges,
) => Promise<VideoLinksSaveResult>;

type Failure = Extract<VideoLinksSaveResult, { ok: false }>;

interface ErrorBody {
  message?: unknown;
  code?: unknown;
  platform?: unknown;
  errors?: Record<string, unknown>;
}

function isPlatform(value: unknown): value is VideoPlatform {
  return VIDEO_PLATFORMS.includes(value as VideoPlatform);
}

/**
 * Only messages for a platform the form shows survive, so nothing odd lands under a field.
 * Without one (`errors.links`, nothing filled) the answer is for the whole form.
 */
function fieldErrors(errors: Record<string, unknown> | undefined): LinkProblems | undefined {
  if (!errors) return undefined;

  const problems: LinkProblems = {};
  for (const platform of VIDEO_PLATFORMS) {
    const message = errors[platform];
    if (typeof message === "string") problems[platform] = message;
  }
  return Object.keys(problems).length > 0 ? problems : undefined;
}

/**
 * A taken link belongs under the field it came from: the one the server names, or the only one
 * this request sent. With several sent and none named, it stays a message for the whole form.
 */
function takenFailure(body: ErrorBody, sent: readonly VideoPlatform[]): Failure {
  const named = isPlatform(body.platform) ? body.platform : null;
  const platform = named ?? (sent.length === 1 ? sent[0] : null);

  const failure: Failure = { ok: false, code: LINK_TAKEN, message: LINK_TAKEN_MESSAGE };
  if (platform) failure.errors = { [platform]: LINK_TAKEN_MESSAGE };
  return failure;
}

/** Reads a refusal; an empty or unreadable body still answers the caller. */
async function failureOf(response: Response, sent: readonly VideoPlatform[]): Promise<Failure> {
  let body: ErrorBody;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }

  // A refusal the app wrote is a 422 or carries a code. Anything else is the framework or the
  // server talking (a missing route, an error page), and its text is not for a creator to read.
  const refusal = response.status < 500 && (response.status === 422 || typeof body.code === "string");
  if (!refusal) return { ok: false, message: SAVE_FAILED };

  if (body.code === LINK_TAKEN) return takenFailure(body, sent);

  const failure: Failure = {
    ok: false,
    message: typeof body.message === "string" ? body.message : SAVE_FAILED,
  };
  if (typeof body.code === "string") failure.code = body.code;
  const errors = fieldErrors(body.errors);
  if (errors) failure.errors = errors;
  return failure;
}

async function send(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  sent: readonly VideoPlatform[],
): Promise<VideoLinksSaveResult> {
  let response: Response;
  try {
    response = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // A dropped connection is retryable like any other failure, not an error to throw at the UI.
    return { ok: false, message: SAVE_FAILED };
  }

  return response.ok ? { ok: true } : failureOf(response, sent);
}

/**
 * Sends a save: every new link in one POST, then each replaced link on its own PUT. Adding goes
 * first, so a content without links gets its first one (and its submitted date) before anything
 * else. The first refusal stops the rest, so the form shows one answer it can act on.
 */
export const saveVideoLinks: VideoLinksSaver = async (contentId, { added, replaced }) => {
  const base = `/api/contents/${encodeURIComponent(contentId)}/links`;
  const saved: LinkChanges["added"] = [];

  if (added.length > 0) {
    const links = Object.fromEntries(added.map(({ platform, url }) => [platform, url]));
    const result = await send(
      base,
      "POST",
      { links },
      added.map((link) => link.platform),
    );
    if (!result.ok) return result;
    saved.push(...added);
  }

  for (const link of replaced) {
    const result = await send(`${base}/${link.platform}`, "PUT", { url: link.url }, [link.platform]);
    if (!result.ok) return saved.length > 0 ? { ...result, saved } : result;
    saved.push(link);
  }

  return { ok: true };
};
