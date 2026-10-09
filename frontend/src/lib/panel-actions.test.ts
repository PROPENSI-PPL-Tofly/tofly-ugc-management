import { actionsFor, submitRevision, type PanelActionPorts } from "./panel-actions";
import type { ContentDetail } from "./content-detail";

const SUBMISSION = "22222222-2222-2222-2222-222222222222";

type Facts = Pick<
  ContentDetail,
  "waitingOn" | "latestSubmissionId" | "creatorActions" | "status"
>;

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    waitingOn: "admin",
    latestSubmissionId: SUBMISSION,
    creatorActions: [],
    status: "draft_review",
    ...overrides,
  };
}

function idle() {
  return { busy: false, note: "" };
}

function ports(overrides: Partial<PanelActionPorts> = {}): PanelActionPorts {
  return overrides;
}

function adminPorts(overrides: Partial<PanelActionPorts> = {}): PanelActionPorts {
  return {
    approve: vi.fn().mockResolvedValue(undefined),
    revise: vi.fn().mockResolvedValue(undefined),
    openRevisionForm: vi.fn(),
    ...overrides,
  };
}

describe("actionsFor (admin)", () => {
  it("offers Minta Revisi and Approve while a draft waits on the admin", () => {
    const commands = actionsFor({
      role: "admin",
      detail: facts(),
      state: idle,
      ports: adminPorts(),
    });

    expect(commands.map((command) => [command.kind, command.label])).toEqual([
      ["revise", "Minta Revisi"],
      ["approve", "Approve"],
    ]);
  });

  it("approves the latest hand-in the panel was given", async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    const commands = actionsFor({
      role: "admin",
      detail: facts(),
      state: idle,
      ports: adminPorts({ approve }),
    });

    await commands.find((command) => command.kind === "approve")?.run();

    expect(approve).toHaveBeenCalledWith(SUBMISSION);
  });

  it("opens the revision form instead of sending anything by itself", () => {
    const openRevisionForm = vi.fn();
    const commands = actionsFor({
      role: "admin",
      detail: facts(),
      state: idle,
      ports: adminPorts({ openRevisionForm }),
    });

    void commands.find((command) => command.kind === "revise")?.run();

    expect(openRevisionForm).toHaveBeenCalledTimes(1);
  });

  it("locks every command while a decision is already in flight", () => {
    const commands = actionsFor({
      role: "admin",
      detail: facts(),
      state: () => ({ busy: true, note: "" }),
      ports: adminPorts(),
    });

    expect(commands.every((command) => !command.canRun())).toBe(true);
  });

  it("offers an admin nothing when the step waits on the creator", () => {
    const commands = actionsFor({
      role: "admin",
      detail: facts({ waitingOn: "creator" }),
      state: idle,
      ports: adminPorts(),
    });

    expect(commands).toEqual([]);
  });

  it("offers an admin nothing once the content is finished", () => {
    const commands = actionsFor({
      role: "admin",
      detail: facts({ waitingOn: null, status: "link_submitted" }),
      state: idle,
      ports: adminPorts(),
    });

    expect(commands).toEqual([]);
  });

  it("offers an admin nothing while a draft waits on the admin but has no hand-in to decide", () => {
    const commands = actionsFor({
      role: "admin",
      detail: facts({ latestSubmissionId: null }),
      state: idle,
      ports: adminPorts(),
    });

    expect(commands).toEqual([]);
  });
});

describe("actionsFor (creator)", () => {
  it("names the first hand-in, the resubmit and the link by what the backend allowed", () => {
    const cases = [
      { actions: ["submit_draft"] as const, status: "scheduled" as const, label: "Submit Draft" },
      { actions: ["resubmit_draft"] as const, status: "draft_revision" as const, label: "Resubmit Draft" },
      { actions: ["submit_video"] as const, status: "draft_approved" as const, label: "Submit Link Video" },
      { actions: ["submit_video"] as const, status: "draft_review" as const, label: "Submit Link (H-1)" },
    ];

    for (const { actions, label, status } of cases) {
      const commands = actionsFor({
        role: "creator",
        detail: facts({
          waitingOn: "creator",
          latestSubmissionId: null,
          creatorActions: [...actions],
          status,
        }),
        state: idle,
        ports: ports(),
      });

      expect(commands.map((command) => [command.kind, command.label])).toEqual([
        [actions[0], label],
      ]);
    }
  });

  it("hands the chosen action back to the touchpoint, which owns the submit modals", () => {
    const onCreatorAction = vi.fn();
    const commands = actionsFor({
      role: "creator",
      detail: facts({
        waitingOn: "creator",
        latestSubmissionId: null,
        creatorActions: ["submit_video"],
        status: "draft_review",
      }),
      state: idle,
      ports: ports({ onCreatorAction }),
    });

    void commands[0]?.run();

    expect(onCreatorAction).toHaveBeenCalledWith("submit_video");
  });

  it("offers a creator nothing while the admin has the decision", () => {
    const commands = actionsFor({
      role: "creator",
      detail: facts({ waitingOn: "admin", latestSubmissionId: SUBMISSION }),
      state: idle,
      ports: ports(),
    });

    expect(commands).toEqual([]);
  });

  it("locks a creator's commands while a hand-in is in flight", () => {
    const commands = actionsFor({
      role: "creator",
      detail: facts({
        waitingOn: "creator",
        latestSubmissionId: null,
        creatorActions: ["submit_draft"],
      }),
      state: () => ({ busy: true, note: "" }),
      ports: ports(),
    });

    expect(commands.every((command) => !command.canRun())).toBe(true);
  });
});

describe("submitRevision", () => {
  it("keeps Kirim disabled while the note is empty or only spaces", () => {
    const empty = submitRevision({
      submissionId: SUBMISSION,
      state: () => ({ busy: false, note: "" }),
      ports: adminPorts(),
    });
    const spaces = submitRevision({
      submissionId: SUBMISSION,
      state: () => ({ busy: false, note: "   " }),
      ports: adminPorts(),
    });

    expect(empty.canRun()).toBe(false);
    expect(spaces.canRun()).toBe(false);
  });

  it("keeps Kirim disabled while a decision is already in flight", () => {
    const command = submitRevision({
      submissionId: SUBMISSION,
      state: () => ({ busy: true, note: "Perbaiki intro" }),
      ports: adminPorts(),
    });

    expect(command.canRun()).toBe(false);
  });

  it("opens Kirim once something is written, and sends the note trimmed", async () => {
    const revise = vi.fn().mockResolvedValue(undefined);
    const command = submitRevision({
      submissionId: SUBMISSION,
      state: () => ({ busy: false, note: "  Perbaiki intro  " }),
      ports: adminPorts({ revise }),
    });

    expect(command.canRun()).toBe(true);
    await command.run();

    expect(revise).toHaveBeenCalledWith(SUBMISSION, "Perbaiki intro");
  });
});
