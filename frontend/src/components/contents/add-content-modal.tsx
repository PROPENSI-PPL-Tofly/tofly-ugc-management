"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
    createContent,
    type ContentFieldErrors,
    type ContentType,
} from "@/lib/contents";
import { localCalendarDay } from "@/lib/creator-form";
import { getBufferWindow } from "@/lib/deadline-schedule";

const BUFFER_DAYS = 5;
// Same limits as the contents API (backend new-content.ts).
const MAX_NAME_LENGTH = 100;
const MAX_BRIEF_LENGTH = 2000;

const FIELD =
    "rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2";

// Drawn by CSS so the asterisk stays out of the label text and the accessible name;
// screen readers announce "required" from the control's own attribute instead.
const REQUIRED_MARK = "after:ml-0.5 after:text-red-ink after:content-['*']";

const ALERT =
    "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";

function Field({
                   label,
                   error,
                   count,
                   required = false,
                   children,
               }: {
    label: string;
    /** Adds the visual marker; the control itself carries the required attribute. */
    required?: boolean;
    error?: string;
    /** Rendered outside the label so it stays out of the control's accessible name. */
    count?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1 text-[13px]">
            <label className="flex flex-col gap-1">
                <span className={`font-semibold ${required ? REQUIRED_MARK : ""}`}>
                    {label}
                </span>
                {children}
            </label>

            {count}
            {error ? <span className="text-xs text-red-ink">{error}</span> : null}
        </div>
    );
}

function CharCount({ id, used, max }: { id: string; used: number; max: number }) {
    return (
        <span id={id} className="self-end text-xs tabular-nums text-muted">
            {`${used}/${max} `}
            <span className="sr-only">karakter</span>
        </span>
    );
}

function firstAllowedDeadline(contractStart: string): string {
    const today = localCalendarDay(new Date());

    return getBufferWindow({
        contractStart,
        today,
        bufferDays: BUFFER_DAYS,
    }).firstAllowedDate.toISOString().slice(0, 10);
}

export function AddContentModal({
                                    contractId,
                                    evergreenCount,
                                    quota,
                                    contractStart,
                                    contractEnd,
                                    onClose,
                                    onSaved,
                                }: {
    contractId: string;
    evergreenCount: number;
    quota: number;
    contractStart: string;
    contractEnd: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const evergreenFull = evergreenCount >= quota && quota > 0;
    const firstAllowed = firstAllowedDeadline(contractStart);

    const [type, setType] = useState<ContentType>(
        evergreenFull ? "specific" : "evergreen",
    );
    const [name, setName] = useState("");
    const [brief, setBrief] = useState("");
    const [deadline, setDeadline] = useState(firstAllowed);
    const [errors, setErrors] = useState<ContentFieldErrors>({});
    const [generalError, setGeneralError] = useState("");
    const [saving, setSaving] = useState(false);
    const nameCountId = useId();
    const briefCountId = useId();

    function clearFieldError(field: keyof ContentFieldErrors) {
        setErrors((current) => {
            if (!current[field]) {
                return current;
            }

            const next = { ...current };
            delete next[field];
            return next;
        });
    }

    function handleTypeChange(nextType: ContentType) {
        setType(nextType);
        clearFieldError("type");
        setGeneralError("");
    }

    function handleSubmit() {
        const clientErrors: ContentFieldErrors = {};

        if (type === "specific") {
            if (name.trim() === "") {
                clientErrors.name = "Nama konten wajib diisi";
            }

            if (brief.trim() === "") {
                clientErrors.brief = "Brief wajib diisi";
            }
        }

        if (deadline === "") {
            clientErrors.deadline = "Deadline wajib diisi";
        }

        if (type === "evergreen" && evergreenFull) {
            clientErrors.type = "Kuota Evergreen sudah terpenuhi.";
        }

        if (deadline && (deadline < firstAllowed || deadline > contractEnd)) {
            clientErrors.deadline =
                deadline < firstAllowed
                    ? `Deadline paling cepat ${firstAllowed}`
                    : "Deadline tidak boleh setelah akhir kontrak";
        }

        if (Object.keys(clientErrors).length > 0) {
            setErrors(clientErrors);
            setGeneralError("");
            return;
        }

        setSaving(true);
        setErrors({});
        setGeneralError("");

        void (async () => {
            const result = await createContent({
                contractId,
                type,
                name: type === "specific" ? name : undefined,
                brief: type === "specific" ? brief : undefined,
                deadline,
            });

            if (result.ok) {
                onSaved();
                onClose();
                return;
            }

            setErrors(result.errors);
            setGeneralError(result.message);
            setSaving(false);
        })();
    }

    return (
        <Modal
            title="Tambah Konten"
            onClose={saving ? () => undefined : onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Batal
                    </Button>

                    <Button
                        variant="accent"
                        onClick={handleSubmit}
                        disabled={saving}
                    >
                        {saving ? "Menyimpan..." : "Simpan"}
                    </Button>
                </>
            }
        >
            {generalError || errors.quota || errors.contractId ? (
                <div role="alert" className={ALERT}>
                    {errors.quota ?? errors.contractId ?? generalError}
                </div>
            ) : null}

            <p aria-hidden="true" className="text-xs text-muted">
                <span className="text-red-ink">*</span> <span>wajib diisi</span>
            </p>

            <Field label="Jenis Konten" error={errors.type} required>
                <select
                    required
                    className={FIELD}
                    value={type}
                    onChange={(event) =>
                        handleTypeChange(event.target.value as ContentType)
                    }
                    disabled={saving}
                >
                    <option value="evergreen" disabled={evergreenFull}>
                        Evergreen
                    </option>
                    <option value="specific">Specific</option>
                </select>

                {evergreenFull ? (
                    <span className="text-xs text-red-ink">
                        Kuota Evergreen sudah terpenuhi.
                    </span>
                ) : null}
            </Field>

            {type === "specific" ? (
                <>
                    <Field
                        label="Nama Konten"
                        error={errors.name}
                        required
                        count={<CharCount id={nameCountId} used={name.length} max={MAX_NAME_LENGTH} />}
                    >
                        <input
                            type="text"
                            required
                            maxLength={MAX_NAME_LENGTH}
                            aria-describedby={nameCountId}
                            className={FIELD}
                            value={name}
                            onChange={(event) => {
                                setName(event.target.value);
                                clearFieldError("name");
                            }}
                            disabled={saving}
                        />
                    </Field>

                    <Field
                        label="Brief"
                        error={errors.brief}
                        required
                        count={<CharCount id={briefCountId} used={brief.length} max={MAX_BRIEF_LENGTH} />}
                    >
            <textarea
                className={`${FIELD} min-h-24 resize-y`}
                required
                maxLength={MAX_BRIEF_LENGTH}
                aria-describedby={briefCountId}
                value={brief}
                onChange={(event) => {
                    setBrief(event.target.value);
                    clearFieldError("brief");
                }}
                disabled={saving}
            />
                    </Field>
                </>
            ) : null}

            <Field label="Deadline" error={errors.deadline} required>
                <input
                    type="date"
                    required
                    className={FIELD}
                    min={firstAllowed}
                    max={contractEnd}
                    value={deadline}
                    onChange={(event) => {
                        setDeadline(event.target.value);
                        clearFieldError("deadline");
                    }}
                    disabled={saving}
                />
            </Field>

            <p className="text-xs text-muted">
                Deadline harus minimal {BUFFER_DAYS} hari setelah hari ini atau tanggal
                mulai kontrak, mana yang lebih akhir.
            </p>
        </Modal>
    );
}