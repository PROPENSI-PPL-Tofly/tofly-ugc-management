import type { MyTask } from "@/lib/tasks";

/** A believable task row for tests, with only the fields under test overridden. */
export function myTask(overrides: Partial<MyTask> = {}): MyTask {
  return {
    id: "content-1",
    name: "Evergreen - Review Fitur Tobi AI",
    type: "evergreen",
    brief: "",
    deadline: "2026-10-01",
    status: "scheduled",
    daysUntilDeadline: 14,
    videoLink: null,
    platform: null,
    latestDraft: null,
    actions: {
      canSubmitDraft: true,
      isResubmission: false,
      canSubmitVideo: false,
      inGracePeriod: false,
    },
    ...overrides,
  };
}
