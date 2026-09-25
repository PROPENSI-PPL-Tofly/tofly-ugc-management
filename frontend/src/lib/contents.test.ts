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
            creatorId: "11111111-1111-4111-8111-111111111111",
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
});