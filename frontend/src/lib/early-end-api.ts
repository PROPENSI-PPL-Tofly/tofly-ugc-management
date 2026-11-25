// "Akhiri Kontrak Lebih Awal" from the browser (PBI-37, 37.2), through the same-origin /api proxy
// like the other period actions. The preview fills the one confirmation (AC 4); the end is final
// (AC 5). The backend's 37.1 endpoints decide, and their answers come back as the form's messages.

import { apiFetch } from "./api-client";
import { isUuid } from "./creator-detail";
import {
  ACCESS_LABELS,
  type AccessAfterEnd,
  type EarlyEndErrors,
  type EarlyEndRequest,
  type InvoiceChoice,
  type UpcomingChoice,
} from "./early-end";

/** A content the end closes, or leaves open until the last day. */
export interface PlannedContent {
  id: string;
  name: string;
  deadline: string;
}

/** A period that has not started, deleted or kept. */
export interface PlannedPeriod {
  contractId: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
}

/** What ending the contract does, as the API plans it for the confirmation and the end alike. */
export interface EarlyEndPlan {
  lastDay: string;
  originalEndDate: string;
  invoice: InvoiceChoice;
  reasonMismatch: boolean;
  /** The first day the invoice can be finalized; null when it is cancelled. */
  finalizableFrom: string | null;
  closing: PlannedContent[];
  unfinished: PlannedContent[];
  /** The keep or delete choice; null when no period waited to start. */
  upcomingPeriods: UpcomingChoice | null;
  deletedPeriods: PlannedPeriod[];
  keptPeriods: PlannedPeriod[];
  access: AccessAfterEnd;
}

export type EarlyEndResult =
  | { ok: true; plan: EarlyEndPlan }
  | { ok: false; message: string; errors: EarlyEndErrors };

const FAILED = "Kontrak gagal diakhiri. Coba lagi.";
const INVALID = "Data pengakhiran kontrak tidak valid";
const ALREADY_ENDED = "Kontrak sudah diakhiri. Muat ulang untuk melihat status terbaru.";
const CONFLICT = "Kontrak tidak bisa diakhiri saat ini. Muat ulang untuk melihat status terbaru.";

/** The fields the form shows a message under; nothing else from a 422 is kept. */
const FORM_FIELDS = ["lastDay", "reason", "note", "upcomingPeriods"] as const;

function failed(message = FAILED, errors: EarlyEndErrors = {}): EarlyEndResult {
  return { ok: false, message, errors };
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** The items of a list that have the expected text fields, each copied field by field. */
function contents(value: unknown): PlannedContent[] {
  if (!Array.isArray(value)) return [];
  return value.map(record).flatMap(({ id, name, deadline }) =>
    isText(id) && isText(name) && isText(deadline) ? [{ id, name, deadline }] : [],
  );
}

function periods(value: unknown): PlannedPeriod[] {
  if (!Array.isArray(value)) return [];
  return value.map(record).flatMap(({ contractId, periodNumber, startDate, endDate }) =>
    isText(contractId) && Number.isInteger(periodNumber) && isText(startDate) && isText(endDate)
      ? [{ contractId, periodNumber: periodNumber as number, startDate, endDate }]
      : [],
  );
}

/**
 * The plan, only when its days, choice and access are of the expected shape; lists keep only
 * well-formed items, copied as text, so nothing else the response carries reaches the screen.
 */
function readPlan(body: unknown): EarlyEndPlan | null {
  const raw = record(body);
  const { lastDay, originalEndDate, invoice, access, finalizableFrom } = raw;
  if (
    !isText(lastDay) ||
    !isText(originalEndDate) ||
    (invoice !== "pay" && invoice !== "cancel") ||
    !isText(access) ||
    !Object.hasOwn(ACCESS_LABELS, access)
  ) {
    return null;
  }
  return {
    lastDay,
    originalEndDate,
    invoice,
    reasonMismatch: raw.reasonMismatch === true,
    finalizableFrom: isText(finalizableFrom) ? finalizableFrom : null,
    closing: contents(raw.closing),
    unfinished: contents(raw.unfinished),
    upcomingPeriods: raw.upcomingPeriods === "keep" || raw.upcomingPeriods === "delete" ? raw.upcomingPeriods : null,
    deletedPeriods: periods(raw.deletedPeriods),
    keptPeriods: periods(raw.keptPeriods),
    access: access as AccessAfterEnd,
  };
}

function fieldErrors(body: unknown): EarlyEndErrors {
  const raw = record(record(body).errors);
  const errors: EarlyEndErrors = {};
  for (const field of FORM_FIELDS) {
    const message = raw[field];
    if (isText(message)) errors[field] = message;
  }
  return errors;
}

/** Only the form's own fields, picked one by one, whatever else the object holds. */
function toBody(request: EarlyEndRequest): string {
  return JSON.stringify({
    invoice: request.invoice,
    lastDay: request.lastDay,
    reason: request.reason,
    note: request.note,
    ...(request.upcomingPeriods === undefined ? {} : { upcomingPeriods: request.upcomingPeriods }),
  });
}

async function post(path: string | null, request: EarlyEndRequest): Promise<EarlyEndResult> {
  if (path === null) return failed();

  let response: Response;
  try {
    response = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: toBody(request),
    });
  } catch {
    return failed();
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const plan = readPlan(body);
    return plan === null ? failed() : { ok: true, plan };
  }
  if (response.status === 422) return failed(INVALID, fieldErrors(body));
  if (response.status === 409) {
    return failed(record(body).code === "CONTRACT_ALREADY_ENDED" ? ALREADY_ENDED : CONFLICT);
  }
  return failed();
}

/** The early-end path of one of the creator's contracts; null for an id that is not a UUID. */
function earlyEndPath(creatorId: string, contractId: string): string | null {
  if (!isUuid(creatorId) || !isUuid(contractId)) return null;
  return `/api/creators/${creatorId}/contracts/${contractId}/early-end`;
}

/** The consequences for the confirmation (AC 4); nothing is saved. */
export function previewEarlyEnd(
  creatorId: string,
  contractId: string,
  request: EarlyEndRequest,
): Promise<EarlyEndResult> {
  const path = earlyEndPath(creatorId, contractId);
  return post(path && `${path}/preview`, request);
}

/** Ends the contract; final once it answers (AC 5). */
export function endContractEarly(
  creatorId: string,
  contractId: string,
  request: EarlyEndRequest,
): Promise<EarlyEndResult> {
  return post(earlyEndPath(creatorId, contractId), request);
}
