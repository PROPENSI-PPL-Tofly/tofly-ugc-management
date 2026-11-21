"use client";

import { useId, useState, type FormEvent } from "react";
import { useFieldErrors } from "@/components/creators/use-field-errors";
import { Button } from "@/components/ui/button";
import { ALERT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import {
  EMPTY_ADMIN_FORM,
  validateAdminForm,
  type AdminFormErrors,
  type AdminFormValues,
} from "@/lib/admin-user-form";
import type { AdminRole } from "@/lib/admin-users";
import { AdminUserFields } from "./admin-user-fields";

// One object, not a fresh `{}` each render: useFieldErrors tracks identity to know when the
// backend's answer changed, and a new empty object each time would look like a new answer.
const NO_ERRORS: AdminFormErrors = {};

/**
 * Tambah Admin: the three fields, checked here before anything is sent. The backend's answer
 * comes back through `serverErrors`, which useFieldErrors keeps on the field it named until the
 * Super Admin edits that field again.
 */
export function AddAdminModal({
  onClose,
  onSubmit,
  saving = false,
  serverErrors = NO_ERRORS,
  formError,
}: {
  onClose: () => void;
  onSubmit: (values: { name: string; email: string; role: AdminRole }) => void;
  saving?: boolean;
  serverErrors?: AdminFormErrors;
  formError?: string;
}) {
  const formId = useId();
  const [values, setValues] = useState<AdminFormValues>(EMPTY_ADMIN_FORM);
  const liveErrors = validateAdminForm(values, "create");
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
    onSubmit({ name: values.name.trim(), email: values.email.trim(), role: values.role });
  }

  return (
    <Modal
      title="Tambah Admin"
      onClose={onClose}
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
            email: fieldError("email"),
            role: fieldError("role"),
          }}
          onChange={change}
          onBlur={markTouched}
          mode="create"
        />
      </form>
    </Modal>
  );
}
