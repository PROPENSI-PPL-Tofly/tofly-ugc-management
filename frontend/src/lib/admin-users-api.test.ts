import { apiFetch } from "./api-client";
import {
  createAdmin,
  deactivateAdmin,
  reactivateAdmin,
  updateAdmin,
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
      path: "/api/admin/users",
      method: "POST",
      body: { name: "Rangga", email: "rangga@example.com", role: "admin" },
    });
  });

  it("puts a 409 on the email field, in the AC's words", async () => {
    answers(409, { code: "EMAIL_TAKEN" });

    await expect(createAdmin(NEW_ADMIN)).resolves.toEqual({
      ok: false,
      message: "Email sudah dipakai",
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

  it("patches a name and a changed role with its confirmation", async () => {
    answers(200);

    await expect(
      updateAdmin("u1", { name: "Rangga P", role: "super_admin" }, "c1"),
    ).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin/users/u1",
      method: "PATCH",
      body: { name: "Rangga P", role: "super_admin", confirmationId: "c1" },
    });
  });

  it("patches only the name when the role did not change", async () => {
    answers(200);

    await updateAdmin("u1", { name: "Rangga P" });

    expect(sent().body).toEqual({ name: "Rangga P" });
  });

  it("deactivates with the confirmation it was given", async () => {
    answers(204);

    await expect(deactivateAdmin("u1", "c1")).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin/users/u1/deactivate",
      method: "POST",
      body: { confirmationId: "c1" },
    });
  });

  it("reactivates without asking for a code", async () => {
    answers(204);

    await expect(reactivateAdmin("u1")).resolves.toEqual({ ok: true });

    expect(sent()).toEqual({
      path: "/api/admin/users/u1/reactivate",
      method: "POST",
      body: undefined,
    });
  });

  it("names a stale role's refusal on the action rather than a field", async () => {
    answers(403, { code: "FORBIDDEN" });

    await expect(deactivateAdmin("u1", "c1")).resolves.toEqual({
      ok: false,
      message: "Hanya Super Admin yang bisa mengelola admin",
      errors: {},
    });
  });
});
