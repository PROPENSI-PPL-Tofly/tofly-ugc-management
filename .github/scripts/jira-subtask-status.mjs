// Moves the Jira subtasks a pull request names along the SCRUM workflow
// (Idea → To Do → In Progress → Testing → Done): opening a PR into a
// feat/pbi-* branch puts its subtask in Testing, merging it puts it in Done.
// Run by .github/workflows/jira-subtask-status.yml; no dependencies.
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// SCRUM's workflow status ids (GET /rest/api/3/issue/SCRUM-238/transitions,
// 2026-11-03). Matched by id because Jira may translate the built-in names
// into the token owner's language.
const STATUS_ID = { Idea: "10000", "To Do": "10001", "In Progress": "10002", Testing: "10003", Done: "10004" };

// Statuses a subtask may still be in when its PR opens. Testing and Done are
// left alone, so a fix PR never drags a finished subtask back.
const BEFORE_TESTING = new Set([STATUS_ID.Idea, STATUS_ID["To Do"], STATUS_ID["In Progress"]]);

// SCRUM-238 counts, SCRUM-27.6 (a PBI's subtask numbering) does not.
const TITLE_KEY = /\bSCRUM-(\d+)(?![\d.])/g;
// The team's branch convention, feat/<name>_<no>.
const BRANCH_NUMBER = /_(\d+)$/;

export function subtaskKeys({ title, branch }) {
  const numbers = [...title.matchAll(TITLE_KEY)].map((m) => m[1]);
  const fromBranch = branch.match(BRANCH_NUMBER);
  if (fromBranch) numbers.push(fromBranch[1]);
  return [...new Set(numbers)].map((n) => `SCRUM-${n}`);
}

export function targetStatus({ action, merged }) {
  if (action === "opened" || action === "reopened") return "Testing";
  if (action === "closed" && merged) return "Done";
  return null;
}

export function shouldMove(currentId, target) {
  if (target === "Testing") return BEFORE_TESTING.has(currentId);
  return currentId !== STATUS_ID[target];
}

async function jiraCall(fetch, jira, path, init = {}) {
  const auth = Buffer.from(`${jira.email}:${jira.token}`).toString("base64");
  const res = await fetch(`${jira.baseUrl}/rest/api/3/issue/${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Jira answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function syncOne({ key, target, jira, fetch }) {
  const issue = await (await jiraCall(fetch, jira, `${key}?fields=issuetype,status`)).json();
  if (!issue.fields.issuetype.subtask) return { text: `${key}: not a subtask, skipped`, failed: false };

  const current = issue.fields.status.name;
  if (!shouldMove(issue.fields.status.id, target)) {
    return { text: `${key}: already ${current}, left alone`, failed: false };
  }

  const { transitions } = await (await jiraCall(fetch, jira, `${key}/transitions`)).json();
  const transition = transitions.find((t) => t.to.id === STATUS_ID[target]);
  if (!transition) return { text: `${key}: no transition from ${current} to ${target}`, failed: true };

  await jiraCall(fetch, jira, `${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transition.id } }),
  });
  return { text: `${key}: ${current} → ${target}`, failed: false };
}

// One entry per key. A failing key is reported, never thrown, so the others still move.
export async function syncSubtasks({ keys, target, jira, fetch }) {
  const log = [];
  for (const key of keys) {
    try {
      log.push(await syncOne({ key, target, jira, fetch }));
    } catch (err) {
      log.push({ text: `${key}: ${err.message}`, failed: true });
    }
  }
  return log;
}

async function main() {
  const { action, pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const target = targetStatus({ action, merged: pr.merged });
  const keys = subtaskKeys({ title: pr.title, branch: pr.head.ref });
  if (!target || keys.length === 0) {
    console.log(`Nothing to move (action ${action}, keys ${keys.join(", ") || "none"}).`);
    return;
  }

  const jira = {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    token: process.env.JIRA_API_TOKEN,
  };
  if (!jira.email || !jira.token) {
    console.log("::warning::JIRA_EMAIL or JIRA_API_TOKEN is not set; no subtask was moved.");
    return;
  }

  const log = await syncSubtasks({ keys, target, jira, fetch });
  // A wrong or expired token gets 404 (Jira hides the issue), not 401.
  for (const { text, failed } of log) console.log(failed ? `::warning::${text}` : text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Jira subtasks\n\n${log.map((l) => `- ${l.text}`).join("\n")}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
