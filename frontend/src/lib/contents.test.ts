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
});