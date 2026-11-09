import { DecisionError } from "./decisions";
import { addFollowUp } from "./follow-ups";

const SUBMISSION = "550e8400-e29b-41d4-a716-446655440000";

const SAVED = {
  id: "f1",
  note: "Tambahan: logo di detik 3.",
  at: "2026-11-09T04:00:00.000Z",
  actor: { name: "Bastian" },
};

describe("addFollowUp", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the note to the round's follow-ups and answers with the saved follow-up", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(SAVED), { status: 201 }),
    );

    await expect(addFollowUp(SUBMISSION, SAVED.note)).resolves.toEqual(SAVED);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/submissions/${SUBMISSION}/followups`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: SAVED.note }),
      }),
    );
  });

  it("encodes a crafted id so it cannot climb out of the submissions path (OWASP A01)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(SAVED), { status: 201 }),
    );

    await addFollowUp("../../admin/users", "x");

    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "/api/submissions/..%2F..%2Fadmin%2Fusers/followups",
    );
  });

  it("keeps the 409 the backend answers once the creator has sent a new draft", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: "FOLLOWUP_ROUND_CLOSED", message: "Creator sudah mengirim draft baru" }),
        { status: 409 },
      ),
    );

    const error = await addFollowUp(SUBMISSION, "x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DecisionError);
    expect(error).toMatchObject({ status: 409, message: "Creator sudah mengirim draft baru" });
  });

  it("shows the field's own reason when the backend refuses the note", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Data catatan susulan tidak valid",
          errors: { note: "Catatan susulan maksimal 1000 karakter" },
        }),
        { status: 422 },
      ),
    );

    await expect(addFollowUp(SUBMISSION, "x")).rejects.toMatchObject({
      status: 422,
      message: "Catatan susulan maksimal 1000 karakter",
    });
  });

  it("shows its own message for a server failure instead of the server's wording", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "PrismaClientKnownRequestError" }), { status: 500 }),
    );

    await expect(addFollowUp(SUBMISSION, "x")).rejects.toMatchObject({
      status: 500,
      message: "Catatan susulan gagal dikirim. Coba lagi.",
    });
  });
});
