// Run with: node --test '.github/scripts/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  subtaskKeys,
  targetStatus,
  shouldMove,
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

test("never pulls a subtask back from Testing or Done to Testing", () => {
  assert.equal(shouldMove("In Progress", "Testing"), true);
  assert.equal(shouldMove("To Do", "Testing"), true);
  assert.equal(shouldMove("Testing", "Testing"), false);
  assert.equal(shouldMove("Done", "Testing"), false);
});

test("moves anything not yet Done to Done", () => {
  assert.equal(shouldMove("Testing", "Done"), true);
  assert.equal(shouldMove("Done", "Done"), false);
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
            { id: "21", to: { name: "In Progress" } },
            { id: "31", to: { name: "Testing" } },
            { id: "41", to: { name: "Done" } },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ fields: { issuetype: { subtask: issue.subtask }, status: { name: issue.status } } }),
    };
  };
  return { fetch, moved };
}

const jira = { baseUrl: "https://example.atlassian.net", email: "a@b.c", token: "t" };

test("transitions an In Progress subtask to Testing through the matching transition", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-229": { subtask: true, status: "In Progress" } });
  const log = await syncSubtasks({ keys: ["SCRUM-229"], target: "Testing", jira, fetch });
  assert.deepEqual(moved, [["SCRUM-229", "31"]]);
  assert.match(log[0], /SCRUM-229: In Progress → Testing/);
});

test("leaves a PBI (not a subtask) alone", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-28": { subtask: false, status: "In Progress" } });
  const log = await syncSubtasks({ keys: ["SCRUM-28"], target: "Done", jira, fetch });
  assert.deepEqual(moved, []);
  assert.match(log[0], /SCRUM-28: not a subtask, skipped/);
});

test("reports a missing issue and still handles the others", async () => {
  const { fetch, moved } = fakeJira({ "SCRUM-238": { subtask: true, status: "Testing" } });
  const log = await syncSubtasks({ keys: ["SCRUM-999", "SCRUM-238"], target: "Done", jira, fetch });
  assert.deepEqual(moved, [["SCRUM-238", "41"]]);
  assert.match(log[0], /SCRUM-999: .*404/);
});
