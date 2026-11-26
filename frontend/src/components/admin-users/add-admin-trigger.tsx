"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { NO_ADMIN_ERRORS, formLine, type AdminFailure } from "@/lib/admin-user-form";
import type { AdminRole } from "@/lib/admin-users";
import { createAdmin } from "@/lib/admin-users-api";
import { AddAdminModal } from "./add-admin-modal";

/**
 * Owns Tambah Admin's open state, kept out of the row-scoped actions: adding someone is not a
 * per-row action. On 201 the dialog closes, the page's server fetch runs again and the toast
 * says what happened, so the new row shows up without a full reload.
 */
export function AddAdminTrigger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const { show, toast } = useToast();

  function close() {
    setOpen(false);
    setFailure(null);
  }

  async function save(values: { name: string; email: string; role: AdminRole }) {
    setSaving(true);
    setFailure(null);

    const result = await createAdmin(values);
    setSaving(false);

    if (result.ok) {
      close();
      show(`Admin ${values.name.trim()} berhasil ditambahkan.`);
      router.refresh();
    } else {
      setFailure({ message: result.message, errors: result.errors });
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
      >
        Tambah Admin
      </Button>
      {open ? (
        <AddAdminModal
          onClose={close}
          onSubmit={(values) => void save(values)}
          saving={saving}
          serverErrors={failure?.errors ?? NO_ADMIN_ERRORS}
          formError={formLine(failure)}
        />
      ) : null}
      {toast}
    </>
  );
}
