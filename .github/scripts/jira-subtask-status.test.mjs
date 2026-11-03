// Run with: node --test '.github/scripts/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  subtaskKeys,
  targetStatus,
  shouldMove,
  heldByOpenPrs,
  syncSubtasks,
} from "./jira-subtask-status.mjs";

test("reads the subtask number from the end of a feat/<name>_<no> branch", () => {
  assert.deepEqual(
    subtaskKeys({ title: "feat(backend): add links", branch: "feat/my-performance-links_229" }),
    ["SCRUM-229"],
  );
});

test("reads SCRUM keys from the PR title and drops the branch duplicate", () => {
  assert.deepEqual(
    subtaskKeys({
      title: "feat(frontend): show bonus lines (SCRUM-238)",
      branch: "feat/creator-bonus-breakdown_238",
    }),
    ["SCRUM-238"],
  );
});

test("ignores dotted PBI numbers like SCRUM-27.6 in a title", () => {
  assert.deepEqual(
    subtaskKeys({ title: "feat(frontend): performance view (SCRUM-27.6)", branch: "feat/creator-performance-view_234" }),
    ["SCRUM-234"],
  );
});

test("finds no key in a branch that ends in a PBI number after a hyphen", () => {
  assert.deepEqual(subtaskKeys({ title: "revert(backend): take PBI-28 back out", branch: "fix/revert-pbi-28" }), []);
});

test("moves to Testing when a PR is opened or reopened", () => {
  assert.equal(targetStatus({ action: "opened", merged: false }), "Testing");
  assert.equal(targetStatus({ action: "reopened", merged: false }), "Testing");
});

test("moves to Done only when a closed PR was merged", () => {
  assert.equal(targetStatus({ action: "closed", merged: true }), "Done");
  assert.equal(targetStatus({ action: "closed", merged: false }), null);
  assert.equal(targetStatus({ action: "synchronize", merged: false }), null);
});

// SCRUM workflow status ids: Idea 10000, To Do 10001, In Progress 10002, Testing 10003, Done 10004.
test("never pulls a subtask back from Testing or Done to Testing", () => {
  assert.equal(shouldMove("10002", "Testing"), true);
  assert.equal(shouldMove("10001", "Testing"), true);
  assert.equal(shouldMove("10003", "Testing"), false);
  assert.equal(shouldMove("10004", "Testing"), false);
});

test("moves anything not yet Done to Done", () => {
  assert.equal(shouldMove("10003", "Done"), true);
  assert.equal(shouldMove("10004", "Done"), false);
});

// A fake Jira that answers the three calls the script makes and records each transition.
function fakeJira(issues) {
  const moved = [];
  const fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const key = pathname.split("/")[5];
    const issue = issues[key];
    if (!issue) return { ok: false, status: 404, text: async () => "Issue does not exist" };
    if (pathname.endsWith("/transitions") && init.method === "POST") {
      moved.push([key, JSON.parse(init.body).transition.id]);
      return { ok: true, status: 204, text: async () => "" };
    }
    if (pathname.endsWith("/transitions")) {
      return {
        ok: true,
        json: async () => ({
          transitions: [
            { id: "31", to: { id: "10002", name: issue.names?.[1] ?? "In Progress" } },
            { id: "41", to: { id: "10003", name: "Testing" } },
            { id: "51", to: { id: "10004", name: issue.names?.[2] ?? "Done" } },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ fields: { issuetype: { subtask: issue.subtask }, status: { id: issue.status, name: issue.names?.[0] ?? issue.status } } }),
    };
  };
  return { fetch, moved };
}

const jira = { baseUrl: "https://example.atlassian.net", email: "a@b.c", token: "t" };

test("transitions an In Progress subtask to Testing through the matching transition", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-229": { subtask: true, status: "10002", names: ["In Progress"] } });
  const log = await syncSubtasks({ keys: ["SCRUM-229"], target: "Testing", jira, fetch });
  assert.deepEqual(moved, [["SCRUM-229", "41"]]);
  assert.deepEqual(log, [{ text: "SCRUM-229: In Progress → Testing", failed: false }]);
});

test("leaves a PBI (not a subtask) alone", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-28": { subtask: false, status: "10002" } });
  const log = await syncSubtasks({ keys: ["SCRUM-28"], target: "Done", jira, fetch });
  assert.deepEqual(moved, []);
  assert.deepEqual(log, [{ text: "SCRUM-28: not a subtask, skipped", failed: false }]);
});

test("reports a missing issue and still handles the others", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-238": { subtask: true, status: "10003" } });
  const log = await syncSubtasks({ keys: ["SCRUM-999", "SCRUM-238"], target: "Done", jira, fetch });
  assert.deepEqual(moved, [["SCRUM-238", "51"]]);
  assert.match(log[0].text, /SCRUM-999: .*404/);
  assert.equal(log[0].failed, true);
});

test("matches statuses by id, so translated status names still move", async () => {
  const { fetch, moved } = fakeJira({
    "SCRUM-240": { subtask: true, status: "10003", names: ["测试", "进行中", "完成"] },
  });
  const log = await syncSubtasks({ keys: ["SCRUM-240"], target: "Done", jira, fetch });
  assert.deepEqual(moved, [["SCRUM-240", "51"]]);
  assert.equal(log[0].failed, false);
});

test("flags a subtask whose workflow has no transition to the target as failed", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-241": { subtask: true, status: "10002", names: ["In Progress"] } });
  const noDone = async (url, init) => {
    const res = await fetch(url, init);
    if (!url.endsWith("/transitions")) return res;
    const body = await res.json();
    return { ok: true, json: async () => ({ transitions: body.transitions.filter((t) => t.to.id !== "10004") }) };
  };
  const log = await syncSubtasks({ keys: ["SCRUM-241"], target: "Done", jira, fetch: noDone });
  assert.deepEqual(moved, []);
  assert.deepEqual(log, [{ text: "SCRUM-241: no transition from In Progress to Done", failed: true }]);
});

const openPr = (number, title, head, base = "feat/pbi-28-performance-bonus") => ({
  number,
  title,
  head: { ref: head },
  base: { ref: base },
});

test("holds a subtask another open PR into a PBI branch still names, by branch or title", () => {
  const held = heldByOpenPrs({
    keys: ["SCRUM-229", "SCRUM-238"],
    mergedNumber: 153,
    openPrs: [
      openPr(155, "feat(backend): add per-link performance data", "feat/performance-data-foundation_229"),
      openPr(156, "fix(backend): lock the contract (SCRUM-229)", "fix/manual-entry-contract-lock"),
    ],
  });
  assert.deepEqual([...held], [["SCRUM-229", [155, 156]]]);
});

test("does not hold a subtask for open PRs into staging or main, or for the merged PR itself", () => {
  const held = heldByOpenPrs({
    keys: ["SCRUM-238"],
    mergedNumber: 160,
    openPrs: [
      openPr(160, "feat(frontend): bonus lines (SCRUM-238)", "feat/creator-bonus-breakdown_238"),
      openPr(149, "feat: release (SCRUM-238)", "feat/pbi-28-performance-bonus", "staging"),
    ],
  });
  assert.equal(held.size, 0);
});

test("leaves a held subtask where it is and still moves the others to Done", async () => {
  const { fetch, moved } = fakeJira({
    "SCRUM-229": { subtask: true, status: "10003", names: ["Testing"] },
    "SCRUM-238": { subtask: true, status: "10003", names: ["Testing"] },
  });
  const log = await syncSubtasks({
    keys: ["SCRUM-229", "SCRUM-238"],
    target: "Done",
    held: new Map([["SCRUM-229", [155, 156]]]),
    jira,
    fetch,
  });
  assert.deepEqual(moved, [["SCRUM-238", "51"]]);
  assert.deepEqual(log[0], { text: "SCRUM-229: open PR #155, #156 still names it, left alone", failed: false });
});
