"use client";

import { useId, useState, type FormEvent } from "react";
import { useFieldErrors } from "@/components/creators/use-field-errors";
import { Button } from "@/components/ui/button";
import { ALERT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import {
  NO_ADMIN_ERRORS,
  canChangeRole,
  validateAdminForm,
  type AdminFormErrors,
  type AdminFormValues,
} from "@/lib/admin-user-form";
import { adminUserDisplayName, type AdminRole, type AdminUser } from "@/lib/admin-users";
import { AdminUserFields } from "./admin-user-fields";

/**
 * Ubah Admin changes a name, and a role when the row is not the caller's own. The email an
 * account was created with is not a field here: changing it means creating another account.
 */
export function EditAdminModal({
  user,
  onClose,
  onSubmit,
  saving = false,
  serverErrors = NO_ADMIN_ERRORS,
  formError,
}: {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (values: { name: string; role: AdminRole }) => void;
  saving?: boolean;
  serverErrors?: AdminFormErrors;
  formError?: string;
}) {
  const formId = useId();
  const [values, setValues] = useState<AdminFormValues>({
    name: adminUserDisplayName(user),
    email: user.email,
    role: user.role,
  });
  const roleLocked = !canChangeRole(user);
  const liveErrors = validateAdminForm(
    { ...values, role: roleLocked ? user.role : values.role },
    "edit",
  );
  const { markTouched, markEdited, fieldError } = useFieldErrors<keyof AdminFormErrors>(
    liveErrors,
    serverErrors,
  );
  const valid = Object.keys(liveErrors).length === 0;

  function change(field: keyof AdminFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    markEdited([field as keyof AdminFormErrors]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || saving || values.role === "") {
      return;
    }
    onSubmit({ name: values.name.trim(), role: values.role });
  }

  return (
    <Modal
      title="Ubah Admin"
      onClose={onClose}
      meta={user.email}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form={formId} disabled={saving || !valid}>
            Simpan
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        {formError ? (
          <p role="alert" className={`mb-4 ${ALERT}`}>
            {formError}
          </p>
        ) : null}
        <AdminUserFields
          values={values}
          errors={{
            name: fieldError("name"),
            role: fieldError("role"),
          }}
          onChange={change}
          onBlur={markTouched}
          mode="edit"
          roleLocked={roleLocked}
        />
      </form>
    </Modal>
  );
}
