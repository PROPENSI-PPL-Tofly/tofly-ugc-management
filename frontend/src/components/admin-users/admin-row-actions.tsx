"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ALERT } from "@/components/ui/form-classes";
import { InfoTip } from "@/components/ui/info-tip";
import {
  NO_ADMIN_ERRORS,
  formLine,
  canChangeRole,
  canDeactivate,
  SELF_DEACTIVATE_REASON,
  type AdminFailure,
} from "@/lib/admin-user-form";
import { adminUserDisplayName, type AdminRole, type AdminUser } from "@/lib/admin-users";
import {
  deactivateAdmin,
  reactivateAdmin,
  updateAdmin,
  type AdminSaveOutcome,
  type SensitiveAction,
} from "@/lib/admin-users-api";
import { EditAdminModal } from "./edit-admin-modal";

const CELL = "border-b border-rule-2 px-5 py-3 align-top text-[13px]";

/**
 * The actions at the end of one admin's row (AC 6 to AC 11). A role change waits for the email
 * code; deactivation asks for the dialog first, then the code; reactivation is one press for an
 * Admin and waits for the code for a Super Admin, as the backend asks. The
 * caller's own row has no deactivation at all, with the reason beside the shut control.
 */
export function AdminRowActions({
  user,
  withConfirmation,
  onChanged,
}: {
  user: AdminUser;
  withConfirmation: (action: SensitiveAction, run: () => void) => void;
  onChanged: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<AdminFailure | null>(null);

  function apply(result: AdminSaveOutcome, message: string, close: () => void) {
    setSaving(false);
    if (result.ok) {
      setFailure(null);
      close();
      onChanged(message);
    } else {
      setFailure({ message: result.message, errors: result.errors });
    }
  }

  function saveEdit(values: { name: string; role: AdminRole }) {
    setSaving(true);
    setFailure(null);

    const changedRole = canChangeRole(user) && values.role !== user.role;
    const patch = changedRole
      ? { name: values.name, role: values.role }
      : { name: values.name };
    const send = () => {
      void updateAdmin(user.id, patch).then((result) =>
        apply(result, "Perubahan admin disimpan.", () => setEditing(false)),
      );
    };

    if (changedRole) {
      withConfirmation("role_change", send);
    } else {
      send();
    }
  }

  function deactivate() {
    setDeactivating(false);
    setSaving(true);
    setFailure(null);

    withConfirmation("deactivate", () => {
      void deactivateAdmin(user.id).then((result) =>
        apply(result, "Admin dinonaktifkan.", () => setDeactivating(false)),
      );
    });
  }

  function reactivate() {
    setSaving(true);
    setFailure(null);
    const send = () => {
      void reactivateAdmin(user.id).then((result) =>
        apply(result, "Admin diaktifkan kembali.", () => setSaving(false)),
      );
    };

    if (user.role === "super_admin") {
      withConfirmation("reactivate_super_admin", send);
    } else {
      send();
    }
  }

  return (
    <td className={CELL}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            setFailure(null);
            setEditing(true);
          }}
        >
          Ubah
        </Button>

        {canDeactivate(user) ? (
          <Button type="button" variant="danger-outline" onClick={() => setDeactivating(true)}>
            Nonaktifkan
          </Button>
        ) : user.isActive ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="danger-outline" disabled>
              Nonaktifkan
            </Button>
            <InfoTip label={SELF_DEACTIVATE_REASON} text={SELF_DEACTIVATE_REASON} />
          </div>
        ) : (
          <Button type="button" variant="positive" onClick={reactivate}>
            Aktifkan
          </Button>
        )}
      </div>

      {failure !== null && !editing ? (
        <p role="alert" className={`mt-2 ${ALERT}`}>
          {failure.message}
        </p>
      ) : null}

      {editing ? (
        <EditAdminModal
          user={user}
          onClose={() => setEditing(false)}
          onSubmit={saveEdit}
          saving={saving}
          serverErrors={failure?.errors ?? NO_ADMIN_ERRORS}
          formError={formLine(failure)}
        />
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          title="Nonaktifkan admin?"
          message={`${adminUserDisplayName(user)} langsung keluar dari semua sesi dan tidak bisa masuk lagi. Untuk mengembalikannya, aktifkan kembali akunnya.`}
          confirmLabel="Nonaktifkan"
          cancelLabel="Batal"
          onConfirm={deactivate}
          onCancel={() => setDeactivating(false)}
        />
      ) : null}
    </td>
  );
}
