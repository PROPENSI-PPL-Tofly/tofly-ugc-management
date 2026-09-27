"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SubmitDraftModal } from "@/components/my-task/submit-draft-modal";
import { SubmitVideoModal } from "@/components/my-task/submit-video-modal";
import { Toast } from "@/components/ui/toast";
import type { MyTask, MyTaskAction } from "@/lib/my-tasks";
import { MyTaskTable } from "./my-task-table";

interface Opened {
  task: MyTask;
  action: MyTaskAction;
}

const SUBMITTED: Record<MyTaskAction, string> = {
  submit_draft: "Draft terkirim. Admin akan meninjaunya.",
  resubmit_draft: "Draft terkirim. Admin akan meninjaunya.",
  submit_video: "Link video terkirim. Konten ini selesai.",
};

/**
 * Task Saya's interactive part: the table plus the modal its buttons open. The page fetches on
 * the server and cannot hold "which task is open", so this client component does. After a
 * hand-in the page is refreshed, which re-fetches the list with the row's new status, and a toast
 * confirms it. Focus then goes to the list: the button that opened the modal usually disappears
 * with the new status, which would otherwise drop focus to the page body.
 */
export function MyTaskBoard({
  tasks,
  emptyMessage,
}: Readonly<{ tasks: MyTask[]; emptyMessage?: string }>) {
  const router = useRouter();
  const [opened, setOpened] = useState<Opened | null>(null);
  // The id is the Toast key: a second hand-in remounts it, restarting its countdown.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const focusListOnClose = useRef(false);

  // Runs after the modal's own cleanup has handed focus back to its opener, so this wins.
  useEffect(() => {
    if (opened === null && focusListOnClose.current) {
      focusListOnClose.current = false;
      listRef.current?.focus();
    }
  }, [opened]);

  const close = () => setOpened(null);

  function renderModal(current: Opened) {
    const { id, name, deadline, brief, revisionNotes } = current.task;
    const content = { id, name, deadline, brief, revisionNotes };
    const submitted = () => {
      focusListOnClose.current = true;
      setToast((last) => ({ id: (last?.id ?? 0) + 1, message: SUBMITTED[current.action] }));
      router.refresh();
    };
    // Keyed by task and action so opening another row starts from an empty form.
    const key = `${id}:${current.action}`;

    if (current.action === "submit_video") {
      return (
        <SubmitVideoModal
          key={key}
          content={content}
          onClose={close}
          onSubmitted={submitted}
        />
      );
    }

    return (
      <SubmitDraftModal
        key={key}
        action={current.action}
        content={content}
        onClose={close}
        onSubmitted={submitted}
      />
    );
  }

  return (
    <>
      <section
        ref={listRef}
        aria-label="Daftar Tugas Saya"
        tabIndex={-1}
        className="outline-none"
      >
        <MyTaskTable
          tasks={tasks}
          emptyMessage={emptyMessage}
          onAction={(task, action) => setOpened({ task, action })}
        />
      </section>
      {opened ? renderModal(opened) : null}
      {toast ? (
        <Toast key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />
      ) : null}
    </>
  );
}
