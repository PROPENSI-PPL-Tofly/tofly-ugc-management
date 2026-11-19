# Installed Agent Skills — What They Are and How I Use Them

Two skills were installed into my OpenCode agent setup on 23 Oct 2026, from the official
[anthropics/skills](https://github.com/anthropics/skills) repository (`main` branch):

| Skill | Installed at | Source path |
|---|---|---|
| `skill-creator` | `C:\Users\user\.config\opencode\opencode-for-ctf\skills\skill-creator\` | `anthropics/skills/skills/skill-creator` |
| `docx` | `C:\Users\user\.config\opencode\opencode-for-ctf\skills\docx\` | `anthropics/skills/skills/docx` |

Each skill is a folder containing a `SKILL.md` (the instructions the agent reads when the task
matches the skill's description) plus supporting scripts. OpenCode discovers them from the
configured `skills.paths` directory at startup; both now appear in the session's skill list.

---

## 1. `skill-creator` — building and improving agent skills

**What it is.** A skill for authoring new skills: it defines the standard skill anatomy
(frontmatter `name` + `description`, progressive disclosure through `references/`, helper
`scripts/`), and ships tooling to validate, package, evaluate and benchmark a skill —
`scripts/quick_validate.py`, `package_skill.py`, `run_eval.py`, `run_loop.py`,
`improve_description.py`, plus `references/schemas.md` and an eval-review viewer.

**How I use it.**
- I invoke it whenever a repeatable workflow deserves to become a reusable skill — for example,
  turning my weekly CPL report process (evidence gathering from git/PR/CI/coverage, then filling
  the fixed 7-section template) into a `weekly-report` skill.
- In practice I say something like: *"Create a skill that generates my weekly summary report
  from this repo's git history and PR evidence, following the structure of
  `WEEKLY_REPORT-144-158.md`."* — the skill loads, walks me through the anatomy, writes the
  `SKILL.md` and its reference files, and runs `quick_validate.py` on the result.
- It is also the tool for **improving** an existing skill (tighten the description so it triggers
  reliably, split large instructions into references) and for **evaluating** one (run the eval
  scripts, view the generated review page).

**Why it matters for this project.** My weekly report is the same deliverable every week:
same headings, same bullet types, same evidence sources. Encoding that once as a skill makes the
next report a one-command, consistent output instead of a fresh manual reconstruction.

---

## 2. `docx` — producing and editing Word documents

**What it is.** A skill for creating, reading and editing Word documents (`.docx` / `.dotx`).
It works on the document's OOXML directly via its `scripts/` folder (`comment.py`,
`merge_runs.py`, `accept_changes.py`, office/templates helpers), so output is a real Word file
with proper headings, nested lists, tables, hyperlinks and styles — not a renamed text file.

**How I use it.**
- Whenever a deliverable must leave the repo as a Word document. For the weekly reports: I ask
  *"Convert `WEEKLY_REPORT-163.md` into a Word document, keeping the exact heading and bullet
  structure."* — the skill triggers on the `.docx` request and produces
  `WEEKLY_REPORT-163.docx` with the seven CPL sections, the nested bullet points, the bold
  callouts and the commit/PR hyperlinks intact.
- It also covers the reverse and the middle: extracting content from a `.docx` brief, editing
  tracked changes or comments in place, inserting images or tables, or filling a `.dotx` template
  with new content.

**Why it matters for this project.** The reports are submitted as documents, not as Markdown
browsing sessions. `docx` gives a submission-ready file whose structure matches the Markdown
report one-to-one.

---

## How skills work in this setup (in one paragraph)

A skill is a folder with a `SKILL.md` whose frontmatter `name` and `description` are matched
against the task at hand; when the match is good, the agent loads that skill's instructions and
follows its workflow, executing its scripts where needed. Skills are additive — these two sit
alongside the existing CTF skills with no configuration change. Installation is simply copying
the folder into `C:\Users\user\.config\opencode\opencode-for-ctf\skills\` (already listed in
`opencode.jsonc` under `skills.paths`) and restarting OpenCode, since the skill registry is
fixed at startup.

## Verification

- Both folders exist under the skills directory with intact `SKILL.md` frontmatter
  (`name: skill-creator`, `name: docx`) and their full `scripts/` payloads.
- Both are listed as available skills in the current OpenCode session.
- Source of truth: https://github.com/anthropics/skills (fetched 23 Oct 2026).
