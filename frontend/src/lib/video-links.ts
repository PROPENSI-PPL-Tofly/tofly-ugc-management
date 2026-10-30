// The rules of the Kirim Link Video form (PBI-38): one link per platform, each checked against
// its own platform's format. Pure functions over plain values, so every rule is tested without
// rendering the modal; the backend still checks each link again before it is stored.

import { safeHref } from "./safe-href";

export type VideoPlatform = "instagram" | "tiktok";

/** Every platform a link can be sent for, in the order the app lists platforms. */
export const VIDEO_PLATFORMS: readonly VideoPlatform[] = ["instagram", "tiktok"];

export const PLATFORM_LABELS: Record<VideoPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** AC 4: a link is at most 300 characters. */
export const MAX_LINK_LENGTH = 300;

/** A link the content already has, as Content Detail lists it. */
export interface SentLink {
  /** Null only on a link kept from before platforms were recorded. */
  platform: VideoPlatform | null;
  url: string;
}

/** What each platform's field holds, typed or filled in from a sent link. */
export type LinkDraft = Record<VideoPlatform, string>;

export type LinkProblems = Partial<Record<VideoPlatform, string>>;

/** The links a save sends: new ones to add, and sent ones replaced by a new link. */
export interface LinkChanges {
  added: { platform: VideoPlatform; url: string }[];
  replaced: { platform: VideoPlatform; url: string }[];
}

const FORMAT_ERRORS: Record<VideoPlatform, string> = {
  instagram: "Link harus dari Instagram (instagram.com/reel/… atau /p/…)",
  tiktok: "Link harus dari TikTok (tiktok.com/@user/video/… atau vt.tiktok.com/…)",
};

const TOO_LONG = `Link maksimal ${MAX_LINK_LENGTH} karakter`;
const SENT_LINK_EMPTIED = "Link yang sudah dikirim tidak bisa dikosongkan. Ganti dengan link baru.";

// The same forms the backend's link rules take (link-rules.ts, 38.2), so the form never refuses
// what the server would accept, nor sends what it would refuse.
/** AC 4: a post, a reel or a TV page, with or without its owner's handle in front. */
const INSTAGRAM_PATH = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+\/?$/;
/** AC 4: a video under its owner's handle. */
const TIKTOK_VIDEO_PATH = /^\/@[\w.-]+\/video\/\d+\/?$/;
/** AC 4: the code of a vt. or vm. short link. */
const TIKTOK_SHORT_PATH = /^\/\w+\/?$/;
const TIKTOK_SHORT_HOSTS = new Set(["vt.tiktok.com", "vm.tiktok.com"]);

/** Whether `host` is `domain` or one of its subdomains, never a look-alike such as `xdomain`. */
function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** One rule per platform, so a new platform adds an entry instead of another branch. */
const FORMATS: Record<VideoPlatform, (url: URL) => boolean> = {
  instagram: (url) => onDomain(url.hostname, "instagram.com") && INSTAGRAM_PATH.test(url.pathname),
  tiktok: (url) =>
    TIKTOK_SHORT_HOSTS.has(url.hostname)
      ? TIKTOK_SHORT_PATH.test(url.pathname)
      : onDomain(url.hostname, "tiktok.com") && TIKTOK_VIDEO_PATH.test(url.pathname),
};

/**
 * What is wrong with one field's link, or null. An empty field has no problem of its own: only
 * one link is required, which `canSendLinks` checks across the form.
 */
export function linkProblem(platform: VideoPlatform, value: string): string | null {
  const link = value.trim();
  if (link === "") return null;
  if (link.length > MAX_LINK_LENGTH) return TOO_LONG;

  // safeHref lets through only absolute http(s) links, so a script link never reaches a check.
  const href = safeHref(link);
  if (href === null) return FORMAT_ERRORS[platform];

  const url = new URL(href);
  const plain = url.username === "" && url.password === "" && url.port === "";
  return plain && FORMATS[platform](url) ? null : FORMAT_ERRORS[platform];
}

/** The fields as the modal opens: each platform's sent link, or empty. */
export function draftFromLinks(links: readonly SentLink[]): LinkDraft {
  const draft: LinkDraft = { instagram: "", tiktok: "" };
  for (const link of links) {
    if (link.platform !== null) draft[link.platform] = link.url;
  }
  return draft;
}

/**
 * Each shown field's problem. A sent link may be replaced but not emptied (AC 9 has no removal),
 * so clearing one is a problem too.
 */
export function linkProblems(
  platforms: readonly VideoPlatform[],
  draft: LinkDraft,
  sent: LinkDraft = draftFromLinks([]),
): LinkProblems {
  const problems: LinkProblems = {};
  for (const platform of platforms) {
    const emptied = sent[platform] !== "" && draft[platform].trim() === "";
    const problem = emptied ? SENT_LINK_EMPTIED : linkProblem(platform, draft[platform]);
    if (problem) problems[platform] = problem;
  }
  return problems;
}

/** What a save sends: a filled field with no sent link is added, a changed sent link replaced. */
export function linkChanges(
  platforms: readonly VideoPlatform[],
  sent: LinkDraft,
  draft: LinkDraft,
): LinkChanges {
  const changes: LinkChanges = { added: [], replaced: [] };
  for (const platform of platforms) {
    const url = draft[platform].trim();
    if (url === "" || url === sent[platform].trim()) continue;

    const list = sent[platform] === "" ? changes.added : changes.replaced;
    list.push({ platform, url });
  }
  return changes;
}

/** AC 3: Kirim Link opens once no field has a problem and at least one link is new or changed. */
export function canSendLinks(
  platforms: readonly VideoPlatform[],
  draft: LinkDraft,
  sent: LinkDraft = draftFromLinks([]),
): boolean {
  if (Object.keys(linkProblems(platforms, draft, sent)).length > 0) return false;

  const { added, replaced } = linkChanges(platforms, sent, draft);
  return added.length + replaced.length > 0;
}

/** Whether closing would throw away anything typed since the modal opened. */
export function isLinkDraftDirty(opened: LinkDraft, draft: LinkDraft): boolean {
  return VIDEO_PLATFORMS.some((platform) => opened[platform] !== draft[platform]);
}
