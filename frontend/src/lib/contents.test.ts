import { afterEach, describe, expect, it, vi } from "vitest";
import { createContent } from "./contents";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createContent", () => {
    it("preserves the server quota error from a 422 response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        message: "Data content tidak valid",
                        errors: {
                            quota: "Kuota content sudah penuh",
                        },
                    }),
                    {
                        status: 422,
                        headers: {
                            "Content-Type": "application/json",
                        },
                    },
                ),
            ),
        );

        const result = await createContent({
            contractId: "22222222-2222-4222-8222-222222222222",
            type: "specific",
            name: "Test Content",
            brief: "Test brief",
            deadline: "2026-09-20",
        });

        expect(result).toEqual({
            ok: false,
            message: "Data content tidak valid",
            errors: {
                quota: "Kuota content sudah penuh",
            },
        });
    });

    it("keeps a contract error from a 422 response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        message: "Data konten tidak valid",
                        errors: { contractId: "Kontrak wajib dipilih" },
                    }),
                    { status: 422 },
                ),
            ),
        );

        const result = await createContent({
            contractId: "",
            type: "evergreen",
            deadline: "2026-10-05",
        });

        expect(result).toMatchObject({
            ok: false,
            errors: { contractId: "Kontrak wajib dipilih" },
        });
    });

    it("posts the contract id the API validates", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: "content-1" }), { status: 201 }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await createContent({
            contractId: "22222222-2222-4222-8222-222222222222",
            type: "evergreen",
            deadline: "2026-10-05",
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/contents");
        expect(JSON.parse(init.body as string)).toEqual({
            contractId: "22222222-2222-4222-8222-222222222222",
            type: "evergreen",
            deadline: "2026-10-05",
        });
    });

    const REQUEST = {
        contractId: "22222222-2222-4222-8222-222222222222",
        type: "evergreen",
        deadline: "2026-10-05",
    } as const;

    it("answers a 422 whose body is not JSON with no field errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 422 })),
        );

        await expect(createContent(REQUEST)).resolves.toEqual({
            ok: false,
            message: "Data content tidak valid",
            errors: {},
        });
    });

    it("drops a field error that is not text, and a field the form does not have", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        errors: {
                            name: ["terlalu panjang"],
                            deadline: "Deadline sudah lewat",
                            extra: "x",
                        },
                    }),
                    { status: 422 },
                ),
            ),
        );

        const result = await createContent(REQUEST);

        expect(result).toMatchObject({ ok: false, errors: { deadline: "Deadline sudah lewat" } });
        expect(result).not.toHaveProperty("errors.name");
        expect(result).not.toHaveProperty("errors.extra");
    });

    it.each([400, 403, 409, 500])(
        "turns HTTP %i into one retryable message, without the server's wording",
        async (status) => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(
                    new Response(JSON.stringify({ message: "relation contents does not exist" }), {
                        status,
                    }),
                ),
            );

            await expect(createContent(REQUEST)).resolves.toEqual({
                ok: false,
                message: "Content gagal disimpan. Coba lagi.",
                errors: {},
            });
        },
    );

    it("turns a network failure into the same retryable message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        await expect(createContent(REQUEST)).resolves.toEqual({
            ok: false,
            message: "Content gagal disimpan. Coba lagi.",
            errors: {},
        });
    });
});
