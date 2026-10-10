// The role-based step actions of the Content Detail panel (PBI 6 / SCRUM-155): which
// commands a role sees for a content item, whether each one may run right now, and what
// running it does. Pure functions over the facts the endpoint already decided, so the
// panel only ever projects this list.
//
// The buttons are UX, never the control: every command's authority stays in the endpoint
// that accepts it (approve/revise's compare-and-set, the draft/video eligibility rules),
// which is why the creator branch consumes the server's `creatorActions` instead of
// re-deriving the rules in the browser.

import type { Variant } from "@/components/ui/button-classes";
import { daysUntil } from "./format";
import type { ContentDetail } from "./content-detail";
import type { MyTaskAction } from "./my-tasks";
import type { Role } from "./session";

export type PanelActionKind =
  | "approve"
  | "revise"
  | "approve_proposal"
  | "reject_proposal"
  | "submit_draft"
  | "resubmit_draft"
  | "submit_video";

/**
 * One button of the current step. `canRun` is the enablement predicate (Command's
 * canExecute): the panel renders `disabled={!command.canRun()}` and holds no rules of
 * its own.
 */
export interface PanelCommand {
  kind: PanelActionKind;
  label: string;
  variant: Variant;
  canRun(): boolean;
  run(): void | Promise<void>;
}

/** The state the commands read; a getter, so each `canRun` sees the latest keystroke. */
export interface PanelActionState {
  busy: boolean;
  note: string;
}

/** What a command may ask the outside world to do; every port is optional. */
export interface PanelActionPorts {
  approve?: (submissionId: string) => Promise<void>;
  revise?: (submissionId: string, note: string) => Promise<void>;
  /** Opens the revision note form; revising starts with a form, not a request. */
  openRevisionForm?: () => void;
  /** A creator's proposal becomes scheduled work (PRD 3.10). */
  approveProposal?: (contentId: string) => Promise<void>;
  /** Removes the proposal for good, with the admin's optional reason. */
  rejectProposal?: (contentId: string, reason: string) => Promise<void>;
  /** Opens the rejection reason form; like revising, rejecting starts with a form. */
  openRejectForm?: () => void;
  /** The touchpoint owns the Submit Draft / Submit Link Video modals. */
  onCreatorAction?: (action: MyTaskAction) => void;
}

/** The step's facts the command list is chosen from. */
export type PanelActionFacts = Pick<
  ContentDetail,
  "id" | "waitingOn" | "latestSubmissionId" | "creatorActions" | "status" | "deadline"
>;

type CreatorLabelCase = "approved" | "grace" | "late";

const CREATOR_LABELS: Record<MyTaskAction, Record<CreatorLabelCase, string>> = {
  submit_draft: { approved: "Submit Draft", grace: "Submit Draft", late: "Submit Draft" },
  resubmit_draft: { approved: "Resubmit Draft", grace: "Resubmit Draft", late: "Resubmit Draft" },
  // After approval the link is the planned next step; without one it is the emergency route
  // that skips the draft approval, named after the window it opens in (H-1), or plainly late
  // once the deadline has passed.
  submit_video: {
    approved: "Submit Link Video",
    grace: "Submit Link (H-1)",
    late: "Submit Link (Terlambat)",
  },
};

/** Which wording the creator's commands take for this step, on the given day. */
function labelCase(detail: PanelActionFacts, now: Date): CreatorLabelCase {
  if (detail.status === "draft_approved") return "approved";
  const days = daysUntil(detail.deadline, now);
  return days !== null && days < 0 ? "late" : "grace";
}

const CREATOR_VARIANTS: Record<MyTaskAction, Variant> = {
  submit_draft: "accent",
  resubmit_draft: "attention",
  submit_video: "accent",
};

export function actionsFor(input: {
  role: Role;
  detail: PanelActionFacts;
  state: () => PanelActionState;
  ports: PanelActionPorts;
  /** The moment "late" is judged from; the current one by default, a fixed one in tests. */
  now?: Date;
}): PanelCommand[] {
  const { role, detail, state, ports, now = new Date() } = input;

  if (detail.waitingOn === null) {
    return [];
  }

  if (role === "admin") {
    // A proposal waits on the admin with no hand-in yet: the decision is on the proposal itself.
    if (detail.status === "pending") {
      const contentId = detail.id;
      return [
        {
          kind: "reject_proposal",
          label: "Tolak",
          variant: "danger",
          canRun: () => !state().busy,
          run: () => ports.openRejectForm?.(),
        },
        {
          kind: "approve_proposal",
          label: "Setujui",
          variant: "accent",
          canRun: () => !state().busy,
          run: () => ports.approveProposal?.(contentId) ?? Promise.resolve(),
        },
      ];
    }

    if (detail.waitingOn !== "admin" || !detail.latestSubmissionId) {
      return [];
    }

    const submissionId = detail.latestSubmissionId;
    return [
      {
        kind: "revise",
        label: "Minta Revisi",
        variant: "default",
        canRun: () => !state().busy,
        run: () => ports.openRevisionForm?.(),
      },
      {
        kind: "approve",
        label: "Approve",
        variant: "accent",
        canRun: () => !state().busy,
        run: () => ports.approve?.(submissionId) ?? Promise.resolve(),
      },
    ];
  }

  return detail.creatorActions.map((action) => ({
    kind: action,
    label: CREATOR_LABELS[action][labelCase(detail, now)],
    variant: CREATOR_VARIANTS[action],
    canRun: () => !state().busy,
    run: () => {
      ports.onCreatorAction?.(action);
    },
  }));
}

/**
 * The "Kirim" of the revision form: the subtask's acceptance criterion as a command.
 * Empty and whitespace-only notes say nothing to the creator, so they never run, and a
 * decision already in flight locks the button however good the note is.
 */
export function submitRevision(input: {
  submissionId: string;
  state: () => PanelActionState;
  ports: PanelActionPorts;
}): PanelCommand {
  const { submissionId, state, ports } = input;

  return {
    kind: "revise",
    label: "Kirim Revisi",
    variant: "accent",
    canRun: () => !state().busy && state().note.trim() !== "",
    run: () => ports.revise?.(submissionId, state().note.trim()) ?? Promise.resolve(),
  };
}

/**
 * The "Tolak Pengajuan" of the rejection form. The reason is optional (PRD 3.10), so only a
 * decision already in flight locks it; the reason goes out trimmed.
 */
export function submitRejection(input: {
  contentId: string;
  state: () => PanelActionState;
  ports: PanelActionPorts;
}): PanelCommand {
  const { contentId, state, ports } = input;

  return {
    kind: "reject_proposal",
    label: "Tolak Pengajuan",
    variant: "danger",
    canRun: () => !state().busy,
    run: () => ports.rejectProposal?.(contentId, state().note.trim()) ?? Promise.resolve(),
  };
}
