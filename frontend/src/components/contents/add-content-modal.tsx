"use client";

import { useEffect, useMemo, useState } from "react";
import {
    createContent,
    type ContentFieldErrors,
    type ContentType,
} from "@/lib/contents";

const BUFFER_DAYS = 5;

function isoToday(): string {
    return new Date().toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
    const value = new Date(`${day}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

interface AddContentModalProps {
    open: boolean;
    creatorId: string;
    creatorName: string;
    quota: number;
    evergreenCount: number;
    contractStart: string;
    contractEnd: string;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}

export function AddContentModal({
                                    open,
                                    creatorId,
                                    creatorName,
                                    quota,
                                    evergreenCount,
                                    contractStart,
                                    contractEnd,
                                    onClose,
                                    onSaved,
                                }: AddContentModalProps) {
    const [type, setType] =
        useState<ContentType>("evergreen");
    const [name, setName] = useState("");
    const [brief, setBrief] = useState("");
    const [deadline, setDeadline] = useState("");
    const [errors, setErrors] =
        useState<ContentFieldErrors>({});
    const [generalError, setGeneralError] = useState("");
    const [saving, setSaving] = useState(false);

    const evergreenFull =
        evergreenCount >= quota && quota > 0;

    const firstAllowed = useMemo(() => {
        const today = isoToday();
        const base =
            contractStart > today ? contractStart : today;

        return addDays(base, BUFFER_DAYS);
    }, [contractStart]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setType(evergreenFull ? "specific" : "evergreen");
        setName("");
        setBrief("");
        setDeadline(
            firstAllowed <= contractEnd ? firstAllowed : contractEnd,
        );
        setErrors({});
        setGeneralError("");
        setSaving(false);
    }, [open, evergreenFull, firstAllowed, contractEnd]);

    if (!open) {
        return null;
    }

    async function submit() {
        setSaving(true);
        setErrors({});
        setGeneralError("");

        const result = await createContent({
            creatorId,
            type,
            name: type === "specific" ? name : undefined,
            brief: type === "specific" ? brief : undefined,
            deadline,
        });

        if (!result.ok) {
            setErrors(result.errors);
            setGeneralError(result.message);
            setSaving(false);
            return;
        }

        await onSaved();
        onClose();
        setSaving(false);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) {
                    onClose();
                }
            }}
        >
            <div
                className="w-full max-w-lg rounded-(--radius-panel) border border-rule bg-surface shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-content-title"
            >
                <div className="border-b border-rule px-5 py-4">
                    <h2
                        id="add-content-title"
                        className="text-base font-semibold text-ink"
                    >
                        Tambah Konten
                    </h2>

                    <p className="mt-1 text-xs text-ink-3">
                        Menambahkan konten untuk {creatorName}.
                    </p>
                </div>

                <div className="space-y-4 px-5 py-5">
                    {generalError && (
                        <div
                            className="rounded-(--radius-control) border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                            role="alert"
                        >
                            {generalError}
                        </div>
                    )}

                    <div>
                        <label
                            htmlFor="content-type"
                            className="mb-1.5 block text-xs font-semibold text-ink"
                        >
                            Status konten
                        </label>

                        <select
                            id="content-type"
                            value={type}
                            onChange={(event) =>
                                setType(event.target.value as ContentType)
                            }
                            className="w-full rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
                        >
                            <option
                                value="evergreen"
                                disabled={evergreenFull}
                            >
                                Evergreen
                            </option>
                            <option value="specific">Specific</option>
                        </select>

                        {evergreenFull && (
                            <p
                                className="mt-1 text-xs text-danger"
                                role="status"
                            >
                                Kuota Evergreen sudah penuh. Pilih Specific untuk
                                menambahkan konten baru.
                            </p>
                        )}

                        {errors.type && (
                            <p className="mt-1 text-xs text-danger">
                                {errors.type}
                            </p>
                        )}
                    </div>

                    {type === "specific" && (
                        <>
                            <div>
                                <label
                                    htmlFor="content-name"
                                    className="mb-1.5 block text-xs font-semibold text-ink"
                                >
                                    Nama Konten
                                </label>

                                <input
                                    id="content-name"
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    className="w-full rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
                                    placeholder="Contoh: Promo Payday September"
                                />

                                {errors.name && (
                                    <p className="mt-1 text-xs text-danger">
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="content-brief"
                                    className="mb-1.5 block text-xs font-semibold text-ink"
                                >
                                    Brief
                                </label>

                                <textarea
                                    id="content-brief"
                                    value={brief}
                                    onChange={(event) =>
                                        setBrief(event.target.value)
                                    }
                                    rows={4}
                                    className="w-full rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
                                    placeholder="Jelaskan kebutuhan konten..."
                                />

                                {errors.brief && (
                                    <p className="mt-1 text-xs text-danger">
                                        {errors.brief}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    <div>
                        <label
                            htmlFor="content-deadline"
                            className="mb-1.5 block text-xs font-semibold text-ink"
                        >
                            Tanggal deadline
                        </label>

                        <input
                            id="content-deadline"
                            type="date"
                            value={deadline}
                            min={firstAllowed}
                            max={contractEnd}
                            onChange={(event) =>
                                setDeadline(event.target.value)
                            }
                            className="w-full rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
                        />

                        <p className="mt-1 text-xs text-ink-3">
                            Deadline minimal {firstAllowed}.
                        </p>

                        {errors.deadline && (
                            <p className="mt-1 text-xs text-danger">
                                {errors.deadline}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-rule px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                    >
                        Batal
                    </button>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={saving || !deadline}
                        className="rounded-(--radius-control) bg-ink px-3 py-2 text-xs font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}