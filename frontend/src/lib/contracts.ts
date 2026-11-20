// A creator's contract periods from the browser (PBI-30, 30.3): add one ("Perpanjang Kontrak"),
// change or delete one that has not started. Through the same-origin /api proxy, like
// createCreator; the backend's 30.1 endpoints decide, and their answers come back as the
// form's messages.

import { apiFetch } from "./api-client";
import type { ContractTermsInput, ContractType, CreatorFormErrors } from "./creator-form";
import { isUuid } from "./creator-detail";
import { readFieldErrors } from "./creators";

/** One period's terms and its Evergreen deadlines, as POST/PUT /creators/:id/contracts take them. */
export interface ContractRequest extends Omit<ContractTermsInput, "fixedRate" | "contractType"> {
  fixedRate: number;
  contractType: ContractType;
  deadlines: string[];
}

export type SaveContractResult =
  | { ok: true }
  | { ok: false; message: string; errors: CreatorFormErrors };

export type DeleteContractResult = { ok: true } | { ok: false; message: string };

const SAVE_FAILED = "Periode gagal disimpan. Coba lagi.";
const DELETE_FAILED = "Periode gagal dihapus. Coba lagi.";
const INVALID = "Data periode tidak valid";
const CLASHED =
  "Periode bertabrakan dengan periode lain atau sudah dimulai. Muat ulang halaman lalu coba lagi.";
const STARTED = "Periode sudah dimulai dan tidak bisa dihapus. Muat ulang halaman.";
const LAST_PERIOD = "Ini satu-satunya periode creator, jadi tidak bisa dihapus.";
/** The longest errors.contents line shown in place of the generic message. */
const MAX_REASON_LENGTH = 300;

/** The fields a period's form shows a message under; nothing else from a 422 is kept. */
const PERIOD_FIELDS = [
  "contractStart",
  "contractEnd",
  "interval",
  "quota",
  "fixedRate",
  "contractType",
  "deadlines",
] as const satisfies readonly (keyof CreatorFormErrors)[];

/** The path of a creator's periods, or of one of them; null for an id that is not a UUID. */
function contractsPath(creatorId: string, contractId?: string): string | null {
  if (!isUuid(creatorId) || (contractId !== undefined && !isUuid(contractId))) return null;
  const base = `/api/creators/${creatorId}/contracts`;
  return contractId === undefined ? base : `${base}/${contractId}`;
}

/** Only the period's own terms, picked one by one, whatever else the object holds. */
function toBody(request: ContractRequest): string {
  return JSON.stringify({
    contractStart: request.contractStart,
    contractEnd: request.contractEnd,
    interval: request.interval,
    quota: request.quota,
    fixedRate: request.fixedRate,
    contractType: request.contractType,
    deadlines: request.deadlines,
  });
}

/**
 * A refused save: each field's message, and the line the form shows. That line names the Specific
 * content an edit would strand (errors.contents) when the server sends one as short text.
 */
async function refused(response: Response): Promise<SaveContractResult> {
  const body: unknown = await response.json().catch(() => null);
  const contents = (body as { errors?: { contents?: unknown } } | null)?.errors?.contents;
  const reason = typeof contents === "string" && contents.length <= MAX_REASON_LENGTH ? contents : INVALID;
  return { ok: false, message: reason, errors: readFieldErrors(body, PERIOD_FIELDS) };
}

async function conflictCode(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  return (body as { code?: unknown } | null)?.code;
}

async function save(method: "POST" | "PUT", path: string | null, request: ContractRequest): Promise<SaveContractResult> {
  const failed: SaveContractResult = { ok: false, message: SAVE_FAILED, errors: {} };
  if (path === null) return failed;

  let response: Response;
  try {
    response = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: toBody(request),
    });
  } catch {
    return failed;
  }

  if (response.ok) return { ok: true };
  if (response.status === 409) return { ok: false, message: CLASHED, errors: {} };
  if (response.status === 422) return refused(response);
  return failed;
}

/** "Perpanjang Kontrak": a new period after the creator's current one (AC 1-5). */
export function createContract(creatorId: string, request: ContractRequest): Promise<SaveContractResult> {
  return save("POST", contractsPath(creatorId), request);
}

/** A "Belum Dimulai" period's terms changed; its Evergreen schedule is generated again (AC 8). */
export function updateContract(
  creatorId: string,
  contractId: string,
  request: ContractRequest,
): Promise<SaveContractResult> {
  return save("PUT", contractsPath(creatorId, contractId), request);
}

/** A "Belum Dimulai" period removed with its Evergreen slots and empty invoice (AC 9). */
export async function deleteContract(creatorId: string, contractId: string): Promise<DeleteContractResult> {
  const failed: DeleteContractResult = { ok: false, message: DELETE_FAILED };
  const path = contractsPath(creatorId, contractId);
  if (path === null) return failed;

  let response: Response;
  try {
    response = await apiFetch(path, { method: "DELETE" });
  } catch {
    return failed;
  }

  if (response.ok) return { ok: true };
  if (response.status === 409) {
    return { ok: false, message: (await conflictCode(response)) === "LAST_PERIOD" ? LAST_PERIOD : STARTED };
  }
  return failed;
}
