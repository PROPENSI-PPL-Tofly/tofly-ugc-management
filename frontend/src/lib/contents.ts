import { SubmitError } from "./tasks";

export interface AssignSlotPayload {
  contentId: string;
  deadline: string;
}

export interface AssignedContent {
  id: string;
  name: string;
  type: string;
  deadline: string;
  status: string;
}

const FALLBACK_MESSAGE = "Gagal menyimpan konten. Coba lagi sebentar lagi.";

export async function assignManualSlot(
  payload: AssignSlotPayload,
): Promise<AssignedContent> {
  let response: Response;
  try {
    response = await fetch("/api/contents/manual-slot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new SubmitError(FALLBACK_MESSAGE, 0);
  }

  const data = (await response.json().catch(() => null)) as
    | (Partial<AssignedContent> & { message?: unknown })
    | null;

  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : FALLBACK_MESSAGE;
    throw new SubmitError(message, response.status);
  }

  return data as AssignedContent;
}
