"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { formatTimestamp } from "@/lib/format";
import { COMMENT_FAILED, COMMENTS_UNAVAILABLE } from "@/lib/invoice-comments";
import {
  addInvoiceComment,
  loadInvoiceComments,
  type CommentOutcome,
  type CommentsOutcome,
} from "@/lib/invoice-comments-actions.server";
import type { InvoiceComment } from "@/lib/invoice-comments-api";

// What the thread needs to read and add comments. The thread depends on this, not on the server
// actions (DIP), so a test hands it a stub.
export interface CommentsGateway {
  load: (contractId: string) => Promise<CommentsOutcome>;
  add: (contractId: string, text: string) => Promise<CommentOutcome>;
}

const SERVER_COMMENTS: CommentsGateway = { load: loadInvoiceComments, add: addInvoiceComment };

const ROLE_LABELS = { admin: "Admin", creator: "Creator" } as const;

// Where the thread stands; one state at a time.
type Thread =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "loaded"; comments: InvoiceComment[] };

// The comment thread of one invoice in the Rincian panel (PBI-13, subtask 13.4): every comment
// with who wrote it, as which role and when, and a box to add one. It takes no status, so it is
// the same at every step of the invoice, a Paid one included.
export function InvoiceComments({
  contractId,
  comments = SERVER_COMMENTS,
}: Readonly<{ contractId: string; comments?: CommentsGateway }>) {
  const boxId = useId();
  const [thread, setThread] = useState<Thread>({ kind: "loading" });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Not awaited on purpose: an effect cannot be async, and the catch below handles a throw.
    void comments
      .load(contractId)
      // A call that throws (the network, say) reads as unavailable, never as loading for ever.
      .catch((): CommentsOutcome => ({ ok: false, message: COMMENTS_UNAVAILABLE }))
      .then((outcome) =>
        setThread(
          outcome.ok
            ? { kind: "loaded", comments: outcome.comments }
            : { kind: "failed", message: outcome.message },
        ),
      );
  }, [comments, contractId]);

  // The saved comment goes after the ones already shown, as the thread reads oldest first.
  async function send(shown: InvoiceComment[]) {
    setSending(true);
    setError(null);
    const outcome = await comments
      .add(contractId, text)
      .catch((): CommentOutcome => ({ ok: false, message: COMMENT_FAILED }));
    setSending(false);
    if (outcome.ok) {
      setThread({ kind: "loaded", comments: [...shown, outcome.comment] });
      setText("");
    } else {
      setError(outcome.message);
    }
  }

  return (
    <section aria-label="Komentar invoice" className="flex flex-col gap-2 text-[13px]">
      <h3 className="text-[13px] font-bold">Komentar</h3>

      {thread.kind === "loading" ? (
        <p role="status" className="text-muted">
          Memuat komentar…
        </p>
      ) : null}

      {thread.kind === "failed" ? (
        <p role="alert" className={FIELD_ERROR}>
          {thread.message}
        </p>
      ) : null}

      {thread.kind === "loaded" ? (
        <>
          {thread.comments.length === 0 ? (
            <p className="text-muted">Belum ada komentar.</p>
          ) : (
            <ul aria-label="Komentar" className="flex flex-col gap-3">
              {thread.comments.map((comment) => (
                <li key={comment.id} className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted">
                    <strong className="text-ink">{comment.author}</strong>
                    {` · ${ROLE_LABELS[comment.role]} · ${formatTimestamp(comment.createdAt)}`}
                  </p>
                  <p className="whitespace-pre-wrap">{comment.text}</p>
                </li>
              ))}
            </ul>
          )}

          <label htmlFor={boxId} className="font-semibold">
            Tulis komentar
          </label>
          <textarea
            id={boxId}
            className={FIELD}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {error ? (
            <p role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          ) : null}
          <div>
            <Button disabled={sending} onClick={() => send(thread.comments)}>
              Kirim
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
