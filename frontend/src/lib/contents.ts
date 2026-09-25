export type ContentType = "evergreen" | "specific";

export interface CreateContentRequest {
    contractId: string;
    type: ContentType;
    name?: string;
    brief?: string;
    deadline: string;
}

export interface ContentFieldErrors {
    type?: string;
    name?: string;
    brief?: string;
    deadline?: string;
    contractId?: string;
    quota?: string;
}

export type CreateContentResult =
    | {
    ok: true;
    content: {
        id: string;
        name: string;
        type: ContentType;
        brief: string;
        deadline: string;
        status: string;
    };
}
    | {
    ok: false;
    message: string;
    errors: ContentFieldErrors;
};

const ERROR_FIELDS: (keyof ContentFieldErrors)[] = [
    "contractId",
    "type",
    "name",
    "brief",
    "deadline",
    "quota",
];

function readErrors(body: unknown): ContentFieldErrors {
    const raw =
        (body as { errors?: Record<string, unknown> } | null)?.errors ?? {};

    const errors: ContentFieldErrors = {};

    for (const field of ERROR_FIELDS) {
        const message = raw[field];

        if (typeof message === "string") {
            errors[field] = message;
        }
    }

    return errors;
}

export async function createContent(
    request: CreateContentRequest,
): Promise<CreateContentResult> {
    try {
        const response = await fetch("/api/contents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });

        if (response.ok) {
            return {
                ok: true,
                content: (await response.json()) as {
                    id: string;
                    name: string;
                    type: ContentType;
                    brief: string;
                    deadline: string;
                    status: string;
                },
            };
        }

        if (response.status === 422) {
            const body: unknown = await response.json().catch(() => null);

            return {
                ok: false,
                message: "Data content tidak valid",
                errors: readErrors(body),
            };
        }

        return {
            ok: false,
            message: "Content gagal disimpan. Coba lagi.",
            errors: {},
        };
    } catch {
        return {
            ok: false,
            message: "Content gagal disimpan. Coba lagi.",
            errors: {},
        };
    }
}