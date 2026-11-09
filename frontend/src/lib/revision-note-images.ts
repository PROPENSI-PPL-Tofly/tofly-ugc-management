// The screenshots a revision note takes (PBI-34, subtask 34.2): which files, how large and how
// many, each refusal worded as AC 4 and the prototype word it. Pure module, so the rules are
// tested without a DOM. The server checks them again (34.1); these only spare a wasted upload.

/** The image types a note takes: JPG, PNG and WebP (AC 3). */
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** The largest screenshot a note takes: 5 MB (AC 3). */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

/** The most screenshots one note takes (AC 3). */
export const SCREENSHOT_MAX_COUNT = 5;

export const SCREENSHOT_TYPE_INVALID = "Format harus JPG, PNG, atau WebP";
export const SCREENSHOT_TOO_LARGE = "Ukuran maksimal 5 MB";
export const SCREENSHOT_TOO_MANY = "Maksimal 5 gambar per catatan";

/** What the rules read from a picked, pasted or dropped file; the browser's File has all three. */
export interface ScreenshotFile {
  /** Named in a refusal, so a batch says which file each reason belongs to. */
  name: string;
  type: string;
  size: number;
}

// Why a screenshot cannot join the note, or null when it can. `alreadyAdded` counts every image
// in the note, uploading and failed ones too, so a sixth cannot start while five are on their way.
// The rules are checked in the prototype's order: format, then size, then count.
export function screenshotRefusal(file: ScreenshotFile, alreadyAdded: number): string | null {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return SCREENSHOT_TYPE_INVALID;
  if (file.size > SCREENSHOT_MAX_BYTES) return SCREENSHOT_TOO_LARGE;
  if (alreadyAdded >= SCREENSHOT_MAX_COUNT) return SCREENSHOT_TOO_MANY;
  return null;
}
