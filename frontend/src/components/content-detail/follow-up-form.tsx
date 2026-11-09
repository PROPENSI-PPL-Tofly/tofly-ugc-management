"use client";

import { useId, useState } from "react";
import { RichNoteEditor, type RichNote } from "@/components/revision-note/rich-note-editor";
import { REQUIRED_MARK } from "@/components/ui/form-classes";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { FollowUp } from "@/lib/content-detail";
import { DecisionError } from "@/lib/decisions";
import { MAX_FOLLOW_UP_LENGTH } from "@/lib/follow-ups";

/** Saves one follow-up for a round; the API by default, a stub in tests (Dependency Inversion). */
export type AddFollowUp = (submissionId: string, note: string) => Promise<FollowUp>;

export const FOLLOW_UP_SAVED = "Catatan susulan terkirim ke kreator.";

const MISSING = "Catatan susulan wajib diisi sebelum dikirim.";
const EMPTY_NOTE: RichNote = { html: "", text: "", length: 0 };

/**
 * "Tambah Catatan Susulan": a closed button under the latest revision note that opens into the
 * same rich text editor the revision was written in (AC 2, PBI-34), without screenshots. Saving
 * keeps the panel open, so the admin sees the new entry join the list (`onAdded`) and a toast
 * confirms it. A 409 means the creator already answered with a new draft: the round is closed,
 * and the panel takes over (`onRoundClosed`) to say why and read the content again.
 */
export function FollowUpForm({
  submissionId,
  add,
  onAdded,
  onRoundClosed,
}: Readonly<{
  submissionId: string;
  add: AddFollowUp;
  onAdded: (followUp: FollowUp) => void;
  onRoundClosed: (message: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<RichNote>(EMPTY_NOTE);
  // Not flagged while the note is still being started, only once the admin moved on.
  const [left, setLeft] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The field that held focus unmounts when the form closes; the opener takes focus back so a
  // keyboard user stays where they were.
  const [returnFocus, setReturnFocus] = useState(false);
  const { show, toast } = useToast();
  const missingId = useId();

  // Blank counts as missing: the backend refuses a follow-up with no words.
  const blank = note.text.trim() === "";
  const missing = left && blank;
  const tooLong = note.length > MAX_FOLLOW_UP_LENGTH;

  function close() {
    setOpen(false);
    setNote(EMPTY_NOTE);
    setLeft(false);
    setError(null);
    setReturnFocus(true);
  }

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const saved = await add(submissionId, note.html);
      onAdded(saved);
      close();
      show(FOLLOW_UP_SAVED);
    } catch (caught) {
      if (caught instanceof DecisionError && caught.status === 409) {
        close();
        onRoundClosed(caught.message);
      } else {
        // Anything else keeps the note, so the admin can retry without typing it again.
        setError(caught instanceof Error ? caught.message : "Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="mt-3 flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-xs text-red-ink">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1 text-[13px]">
            <span className={`font-semibold text-ink ${REQUIRED_MARK}`}>Catatan susulan</span>
            <RichNoteEditor
              label="Catatan susulan"
              max={MAX_FOLLOW_UP_LENGTH}
              placeholder="mis. Tambahan: logo muncul di detik 3."
              disabled={sending}
              autoFocus
              required
              invalid={missing}
              describedBy={missing ? missingId : undefined}
              onBlur={() => setLeft(true)}
              onChange={setNote}
            />
          </div>
          {missing ? (
            <p id={missingId} className="text-xs text-red-ink">
              {MISSING}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={sending}>
              Batal
            </Button>
            <Button
              variant="accent"
              onClick={() => void submit()}
              disabled={sending || blank || tooLong}
              aria-busy={sending}
            >
              Kirim Catatan Susulan
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          aria-expanded={false}
          autoFocus={returnFocus}
          onClick={() => {
            setReturnFocus(false);
            setOpen(true);
          }}
          className="mt-2"
        >
          Tambah Catatan Susulan
        </Button>
      )}
      {toast}
    </>
  );
}
