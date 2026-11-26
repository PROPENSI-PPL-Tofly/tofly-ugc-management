"use client";

import { useId } from "react";
import { Field, FIELD } from "@/components/creators/contract-terms-fields";
import { CharLimit } from "@/components/ui/char-limit";
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "@/lib/creator-form";
import { ROLE_LABELS, type AdminRole } from "@/lib/admin-users";
import { SELF_ROLE_REASON, type AdminFormErrors, type AdminFormValues } from "@/lib/admin-user-form";

/** The two roles a Super Admin can give someone, in the list's own words. */
export const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "super_admin", label: ROLE_LABELS.super_admin },
];

/**
 * The fields Tambah Admin and Ubah Admin share. An edit leaves the email out: it was the account
 * that was created, not a name or a role the Super Admin is changing here.
 */
export function AdminUserFields({
  values,
  errors,
  onChange,
  onBlur,
  mode,
  roleLocked = false,
}: {
  values: AdminFormValues;
  errors: AdminFormErrors;
  onChange: (field: keyof AdminFormValues, value: string) => void;
  onBlur: (field: keyof AdminFormValues) => void;
  mode: "create" | "edit";
  /** The caller's own row: its role select is shut, with the reason on a tip. */
  roleLocked?: boolean;
}) {
  const nameId = useId();
  const emailId = useId();

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Nama"
        error={errors.name}
        note={<CharLimit id={`${nameId}-count`} length={values.name.length} max={MAX_NAME_LENGTH} />}
      >
        <input
          id={nameId}
          className={FIELD}
          value={values.name}
          maxLength={MAX_NAME_LENGTH}
          required
          aria-describedby={`${nameId}-count`}
          onChange={(event) => onChange("name", event.target.value)}
          onBlur={() => onBlur("name")}
        />
      </Field>

      {mode === "create" ? (
        <Field
          label="Email"
          error={errors.email}
          note={
            <CharLimit id={`${emailId}-count`} length={values.email.length} max={MAX_EMAIL_LENGTH} />
          }
        >
          <input
            id={emailId}
            className={FIELD}
            type="email"
            value={values.email}
            maxLength={MAX_EMAIL_LENGTH}
            required
            aria-describedby={`${emailId}-count`}
            onChange={(event) => onChange("email", event.target.value)}
            onBlur={() => onBlur("email")}
          />
        </Field>
      ) : null}

      <Field
        label="Peran"
        error={errors.role}
        hint={
          roleLocked
            ? { label: "Peran tidak bisa diubah", text: SELF_ROLE_REASON }
            : undefined
        }
      >
        <select
          className={FIELD}
          value={values.role}
          disabled={roleLocked}
          required
          onChange={(event) => onChange("role", event.target.value)}
          onBlur={() => onBlur("role")}
        >
          <option value="">Pilih peran</option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
