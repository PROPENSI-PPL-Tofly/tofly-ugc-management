"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyTask } from "@/lib/tasks";
import { SubmitDraftModal } from "./submit-draft-modal";
import { TaskTable } from "./task-table";

type Dialog = { kind: "draft"; task: MyTask } | null;

/**
 * The task table plus the dialogs its buttons open. After a successful submit the updated row
 * replaces the old one straight away, so the new status shows without waiting for the page
 * to be fetched again, and the server list is then refreshed behind it.
 */
export function MyTaskBoard({ tasks }: { tasks: MyTask[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  // Local updates only hold for the list they were made against: once the refreshed list
  // arrives from the server it is newer than anything kept here, so they are dropped.
  const [updates, setUpdates] = useState<{ basis: MyTask[]; byId: Record<string, MyTask> }>({
    basis: tasks,
    byId: {},
  });
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const byId = updates.basis === tasks ? updates.byId : {};
  const rows = tasks.map((task) => byId[task.id] ?? task);

  const submitted = (message: string) => (updated: MyTask) => {
    setUpdates({ basis: tasks, byId: { ...byId, [updated.id]: updated } });
    setDialog(null);
    setConfirmation(message);
    router.refresh();
  };

  return (
    <>
      {confirmation ? (
        <p
          role="status"
          className="mx-5 mb-3 rounded-[var(--radius-control)] bg-green-wash px-4 py-2.5 text-[13px] font-medium text-green"
        >
          {confirmation}
        </p>
      ) : null}

      <TaskTable
        tasks={rows}
        onSubmitDraft={(task) => {
          setConfirmation(null);
          setDialog({ kind: "draft", task });
        }}
      />

      {dialog?.kind === "draft" ? (
        <SubmitDraftModal
          task={dialog.task}
          onClose={() => setDialog(null)}
          onSubmitted={submitted(
            `Draft untuk "${dialog.task.name}" berhasil dikirim dan menunggu review Admin.`,
          )}
        />
      ) : null}
    </>
  );
}
