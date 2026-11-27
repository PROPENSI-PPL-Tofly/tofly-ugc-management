"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Field } from "@/components/creators/contract-terms-fields";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ALERT } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  PROPOSAL_BRIEF_MAX,
  PROPOSAL_NAME_MAX,
  PROPOSAL_NOTES_MAX,
  checkProposal,
  proposalWindowLabel,
  type ProposalErrors,
  type ProposalFields,
  type ProposalWindow,
} from "@/lib/creator-proposal";
import { submitProposal } from "@/lib/creator-proposal-api";
import { formatDate } from "@/lib/format";
import { MY_TASKS_BASE } from "@/lib/my-tasks";

const FIELD =
  "w-full rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink-2 aria-invalid:border-red-ink";

const EMPTY: ProposalFields = { name: "", brief: "", deadline: "", notes: "" };

/** Where a sent proposal waits (AC 5), so the creator sees it land. */
const WAITING_TAB = `${MY_TASKS_BASE}?tab=waiting`;

/**
 * "+ Ajukan Konten" in Task Saya and its form (PBI-14, 14.2): a creator proposes a Specific
 * content idea with a brief and a deadline inside `window`. The page renders it only when the
 * creator has a running contract (AC 3); the API judges every proposal again. Sending asks first
 * and then toasts (AC 4), and the creator is taken to Menunggu Admin, where it now waits (AC 5).
 */
export function ProposeContent({ window }: Readonly<{ window: ProposalWindow }>) {
  const router = useRouter();
  const { show, toast } = useToast();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ProposalFields>(EMPTY);
  const [errors, setErrors] = useState<ProposalErrors>({});
  const [failure, setFailure] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const ids = {
    name: useId(),
    brief: useId(),
    deadline: useId(),
    notes: useId(),
    nameCount: useId(),
    briefCount: useId(),
    notesCount: useId(),
  };

  const windowLabel = proposalWindowLabel(window);
  const isDirty = Object.values(fields).some((value) => value.trim() !== "");

  function reset() {
    setFields(EMPTY);
    setErrors({});
    setFailure("");
    setOpen(false);
  }

  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty,
    onDiscard: reset,
    title: "Batalkan pengajuan konten?",
  });

  function change(field: keyof ProposalFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function ask() {
    const found = checkProposal(fields, window);
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  async function send() {
    setConfirming(false);
    setSending(true);
    const result = await submitProposal(fields);
    setSending(false);

    if (result.ok) {
      reset();
      show("Pengajuan terkirim. Tunggu persetujuan Admin.");
      // The page is dynamic, so the push alone renders it again with the new proposal.
      router.push(WAITING_TAB);
      return;
    }
    setErrors(result.errors);
    setFailure(result.message);
  }

  const describedBy = (field: keyof ProposalFields, count?: string) =>
    [count, errors[field] ? `${ids[field]}-error` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <Button type="button" variant="accent" onClick={() => setOpen(true)}>
        + Ajukan Konten
      </Button>

      {open ? (
        <Modal
          title="Ajukan Konten"
          eyebrow="Konten Specific"
          onClose={sending ? () => undefined : requestClose}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={requestClose} disabled={sending}>
                Batal
              </Button>
              <Button type="button" variant="accent" onClick={ask} disabled={sending}>
                {sending ? "Mengirim…" : "Kirim Pengajuan"}
              </Button>
            </>
          }
        >
          {failure ? (
            <p role="alert" className={ALERT}>
              {failure}
            </p>
          ) : null}

          <p className="text-xs text-muted">Kolom bertanda * wajib diisi.</p>

          <Field
            label="Nama Konten"
            error={errors.name}
            errorId={`${ids.name}-error`}
            note={<CharLimit id={ids.nameCount} length={fields.name.length} max={PROPOSAL_NAME_MAX} />}
          >
            <input
              type="text"
              className={FIELD}
              maxLength={PROPOSAL_NAME_MAX}
              placeholder="mis. Review Sunscreen Gel di Pantai"
              value={fields.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy("name", ids.nameCount)}
              onChange={(event) => change("name", event.target.value)}
              disabled={sending}
            />
          </Field>

          <Field
            label="Brief"
            error={errors.brief}
            errorId={`${ids.brief}-error`}
            note={<CharLimit id={ids.briefCount} length={fields.brief.length} max={PROPOSAL_BRIEF_MAX} />}
          >
            <textarea
              rows={4}
              className={`${FIELD} resize-y`}
              maxLength={PROPOSAL_BRIEF_MAX}
              placeholder="Ide konten, produk yang dipakai, gaya video…"
              value={fields.brief}
              aria-invalid={Boolean(errors.brief)}
              aria-describedby={describedBy("brief", ids.briefCount)}
              onChange={(event) => change("brief", event.target.value)}
              disabled={sending}
            />
          </Field>

          <Field
            label="Usulan Deadline"
            error={errors.deadline}
            errorId={`${ids.deadline}-error`}
            hint={{
              label: "Tentang Usulan Deadline",
              text: `${windowLabel}. Kalau Admin belum memutuskan sampai H-1, pengajuan otomatis masuk jadwal.`,
            }}
          >
            <input
              type="date"
              className={FIELD}
              min={window.first}
              max={window.last}
              value={fields.deadline}
              aria-invalid={Boolean(errors.deadline)}
              aria-describedby={describedBy("deadline")}
              onChange={(event) => change("deadline", event.target.value)}
              disabled={sending}
            />
          </Field>

          <Field
            label="Catatan untuk Admin"
            optional
            error={errors.notes}
            errorId={`${ids.notes}-error`}
            note={<CharLimit id={ids.notesCount} length={fields.notes.length} max={PROPOSAL_NOTES_MAX} />}
          >
            <textarea
              rows={2}
              className={`${FIELD} resize-y`}
              maxLength={PROPOSAL_NOTES_MAX}
              placeholder="Opsional"
              value={fields.notes}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={describedBy("notes", ids.notesCount)}
              onChange={(event) => change("notes", event.target.value)}
              disabled={sending}
            />
          </Field>
        </Modal>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Kirim Pengajuan?"
          message="Admin akan meninjau pengajuan ini sebelum masuk jadwal."
          details={[
            ["Konten", fields.name.trim()],
            ["Deadline", formatDate(fields.deadline)],
          ]}
          confirmLabel="Kirim"
          cancelLabel="Periksa Lagi"
          confirmVariant="accent"
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {confirmDialog}
      {toast}
    </>
  );
}
