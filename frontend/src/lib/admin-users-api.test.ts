import { apiFetch } from "./api-client";
import {
  CONFIRMATION_MINUTES,
  createAdmin,
  deactivateAdmin,
  reactivateAdmin,
  requestConfirmation,
  updateAdmin,
  verifyConfirmation,
} from "./admin-users-api";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

function answers(status: number, body: unknown = null) {
  vi.mocked(apiFetch).mockResolvedValue(
    new Response(body === null ? null : JSON.stringify(body), { status }),
  );
}

function sent(index = 0) {
  const [path, init] = vi.mocked(apiFetch).mock.calls[index];
  return {
    path,
    method: init?.method,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

const NEW_ADMIN = { name: "Rangga", email: "rangga@example.com", role: "admin" as const };

describe("saving an admin", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("posts a trimmed new admin and reads 201 as saved", async () => {
    answers(201, { id: "u1" });

    await expect(
      createAdmin({ ...NEW_ADMIN, name: "  Rangga  ", email: " rangga@example.com " }),
    ).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin-users",
      method: "POST",
      body: { name: "Rangga", email: "rangga@example.com", role: "admin" },
    });
  });

  // The backend names the field it refused, as POST /admin-users answers a taken email (23.2).
  it("puts a refused email on the email field, in the AC's words", async () => {
    answers(422, { message: "Data admin tidak valid", errors: { email: "Email sudah dipakai" } });

    await expect(createAdmin(NEW_ADMIN)).resolves.toEqual({
      ok: false,
      message: "Data admin tidak valid",
      errors: { email: "Email sudah dipakai" },
    });
  });

  it("puts the last Super Admin on the role field", async () => {
    answers(409, { code: "LAST_SUPER_ADMIN" });

    await expect(createAdmin({ ...NEW_ADMIN, role: "super_admin" })).resolves.toEqual({
      ok: false,
      message: "Minimal harus ada satu Super Admin",
      errors: { role: "Minimal harus ada satu Super Admin" },
    });
  });

  // OWASP A10: a server error's own body is not shown as it came.
  it("hides a server error behind the form's own words", async () => {
    answers(500, { message: "Prisma error at users.email" });

    await expect(createAdmin(NEW_ADMIN)).resolves.toEqual({
      ok: false,
      message: "Admin gagal disimpan. Coba lagi.",
      errors: {},
    });
  });

  // The backend holds the confirmation on the session (23.2), so the request carries no id.
  it("patches a name and a changed role", async () => {
    answers(200);

    await expect(updateAdmin("u1", { name: "Rangga P", role: "super_admin" })).resolves.toEqual({
      ok: true,
    });

    expect(sent()).toEqual({
      path: "/api/admin-users/u1",
      method: "PATCH",
      body: { name: "Rangga P", role: "super_admin" },
    });
  });

  it("patches only the name when the role did not change", async () => {
    answers(200);

    await updateAdmin("u1", { name: "Rangga P" });

    expect(sent().body).toEqual({ name: "Rangga P" });
  });

  it("deactivates on the session's confirmation", async () => {
    answers(200);

    await expect(deactivateAdmin("u1")).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin-users/u1/deactivate",
      method: "POST",
      body: undefined,
    });
  });

  it("names the Super Admin's own row when the backend refuses deactivating it", async () => {
    answers(409, { code: "CANNOT_DEACTIVATE_SELF" });

    await expect(deactivateAdmin("u1")).resolves.toEqual({
      ok: false,
      message: "Super Admin tidak bisa menonaktifkan dirinya sendiri",
      errors: {},
    });
  });

  it("asks for the email code when the backend says the session is not confirmed", async () => {
    answers(403, {
      code: "CONFIRMATION_REQUIRED",
      message: "Konfirmasi dengan kode yang dikirim ke email kamu dulu.",
    });

    await expect(deactivateAdmin("u1")).resolves.toEqual({
      ok: false,
      message: "Konfirmasi dengan kode yang dikirim ke email kamu dulu.",
      errors: {},
    });
  });

  it("keeps only the fields the form has from a refusal", async () => {
    answers(422, { message: "Data admin tidak valid", errors: { role: "Role wajib dipilih", other: "x" } });

    await expect(createAdmin(NEW_ADMIN)).resolves.toEqual({
      ok: false,
      message: "Data admin tidak valid",
      errors: { role: "Role wajib dipilih" },
    });
  });

  it("reactivates without sending a code itself", async () => {
    answers(200);

    await expect(reactivateAdmin("u1")).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin-users/u1/reactivate",
      method: "POST",
      body: undefined,
    });
  });

  it("names a stale role's refusal on the action rather than a field", async () => {
    answers(403, { code: "FORBIDDEN" });

    await expect(deactivateAdmin("u1")).resolves.toEqual({
      ok: false,
      message: "Hanya Super Admin yang bisa mengelola admin",
      errors: {},
    });
  });
});

describe("the email confirmation", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("asks the backend to email a code to the signed-in Super Admin", async () => {
    answers(200, { validMinutes: 15 });

    await expect(requestConfirmation()).resolves.toEqual({
      kind: "sent",
      message: "Kode dikirim ke email kamu.",
    });

    expect(sent()).toEqual({
      path: "/api/admin-users/confirmation",
      method: "POST",
      body: undefined,
    });
    expect(CONFIRMATION_MINUTES).toBe(15);
  });

  it("says how long a resend waits when the backend limits it", async () => {
    answers(429, { code: "CONFIRMATION_LIMITED", retryAfterMinutes: 5 });

    await expect(requestConfirmation()).resolves.toEqual({
      kind: "limited",
      message: "Terlalu sering meminta kode. Coba lagi dalam 5 menit.",
    });
  });

  it("reads a right code as confirmed until the time the backend names", async () => {
    answers(200, { confirmedUntil: "2026-11-21T05:15:00.000Z" });

    await expect(verifyConfirmation("123456")).resolves.toEqual({
      kind: "confirmed",
      expiresAt: "2026-11-21T05:15:00.000Z",
    });

    expect(sent()).toEqual({
      path: "/api/admin-users/confirmation/verify",
      method: "POST",
      body: { code: "123456" },
    });
  });

  it("reads a wrong code and how many tries are left", async () => {
    answers(422, { code: "CONFIRMATION_WRONG", attemptsLeft: 2 });

    await expect(verifyConfirmation("000000")).resolves.toEqual({
      kind: "wrong",
      attemptsLeft: 2,
    });
  });

  it("reads an expired code apart from a wrong one", async () => {
    answers(422, { code: "CONFIRMATION_EXPIRED" });

    await expect(verifyConfirmation("123456")).resolves.toEqual({ kind: "expired" });
  });

  it("reads anything else as failed, without the body's own words", async () => {
    answers(500, { message: "SES error" });

    await expect(verifyConfirmation("123456")).resolves.toEqual({ kind: "failed" });
  });
});

describe("the api's edge answers", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows a 4xx's own message when it named no code", async () => {
    answers(400, { message: "Email tidak valid" });

    await expect(createAdmin(NEW_ADMIN)).resolves.toEqual({
      ok: false,
      message: "Email tidak valid",
      errors: {},
    });
  });

  it("says to wait when the code request was limited without a count", async () => {
    answers(429, {});

    await expect(requestConfirmation()).resolves.toEqual({
      kind: "limited",
      message: "Terlalu sering meminta kode. Coba lagi nanti.",
    });
  });

  it("keeps an unnumbered wrong code from looking like a counted one", async () => {
    answers(422, { code: "CONFIRMATION_WRONG" });

    await expect(verifyConfirmation("000000")).resolves.toEqual({ kind: "wrong" });
  });

  it("does not mistake a server error for a wrong code", async () => {
    answers(500, { code: "CONFIRMATION_WRONG" });

    await expect(verifyConfirmation("000000")).resolves.toEqual({ kind: "failed" });
  });
});
