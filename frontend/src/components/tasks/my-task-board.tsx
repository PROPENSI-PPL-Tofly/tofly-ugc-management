"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubmitDraftModal } from "@/components/my-task/submit-draft-modal";
import { SubmitVideoModal } from "@/components/my-task/submit-video-modal";
import type { MyTask, MyTaskAction } from "@/lib/my-tasks";
import { MyTaskTable } from "./my-task-table";

interface Opened {
  task: MyTask;
  action: MyTaskAction;
}

/**
 * Task Saya's interactive part: the table plus the modal its buttons open. The page fetches on
 * the server and cannot hold "which task is open", so this client component does. After a
 * hand-in the page is refreshed, which re-fetches the list with the row's new status.
 */
export function MyTaskBoard({ tasks }: Readonly<{ tasks: MyTask[] }>) {
  const router = useRouter();
  const [opened, setOpened] = useState<Opened | null>(null);

  const close = () => setOpened(null);
  const refresh = () => router.refresh();

  function renderModal(current: Opened) {
    const { id, name, deadline } = current.task;
    // Keyed by task and action so opening another row starts from an empty form.
    const key = `${id}:${current.action}`;

    if (current.action === "submit_video") {
      return (
        <SubmitVideoModal
          key={key}
          content={{ id, name, deadline }}
          onClose={close}
          onSubmitted={refresh}
        />
      );
    }

    return (
      <SubmitDraftModal
        key={key}
        action={current.action}
        content={{ id, name, deadline }}
        onClose={close}
        onSubmitted={refresh}
      />
    );
  }

  return (
    <>
      <MyTaskTable tasks={tasks} onAction={(task, action) => setOpened({ task, action })} />
      {opened ? renderModal(opened) : null}
    </>
  );
}
