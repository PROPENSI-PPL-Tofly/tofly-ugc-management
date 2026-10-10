# SCRUM-155 — Role-Based Actions Panel: Design Patterns & SOLID

Rubric companion for the subtask *"the in-progress step shows role-based actions; Kirim is disabled while the revision note is empty; the panel opens from every touchpoint with the same content."*

Method: every pattern below is **forced by a line of the requirement**, not decoration. Each entry names the requirement it solves, where it lands, the test that proves it, and the cost you pay for it. Prior art in the repo is cited so you can show the team already practices this and you are extending a convention, not inventing one.

---

## 1. The three requirement sentences → the three structural problems

| Requirement sentence | Structural problem it creates |
|---|---|
| "role-based actions (Approve, Minta Revisi)" | The set of actions depends on data the panel does not own (role + status + deadline). A `switch (role)` inside JSX makes every future role or action an edit to the render tree. |
| "the Kirim button is disabled when the revision note is empty" | An action is no longer "a button that calls a function" — it has an **enablement predicate** that changes per keystroke. That is a command object, not a click handler. |
| "opens from five places with the same content" | The panel must be constructible from anywhere with only an id and a role. Anything it reaches for globally (a fetch module, a session helper, a router) becomes a hidden dependency that five call sites cannot substitute. |

---

## 2. Design patterns (with the code that proves each one)

### 2.1 Command — the pattern your acceptance criterion literally describes

The "Kirim disabled when the note is empty" rule is `canExecute`. Model the current-step actions as commands:

```ts
// frontend/src/lib/panel-actions.ts
export interface PanelCommand {
  kind: "approve" | "revise" | "submit_draft" | "resubmit_draft" | "submit_video";
  label: string;
  /** False when the command must render disabled — no if-spread in the JSX. */
  canRun(): boolean;
  run(): Promise<void>;
}
```

The panel's footer becomes a pure projection: `commands.map((c) => <Button disabled={!c.canRun()} .../>)`. The revise command closes over the note state, so `canRun = () => note.trim().length > 0 && !busy` — which is exactly today's logic at `review-actions.tsx:56` and `:130`, promoted from a local boolean to the command's contract.

- **Test that proves it:** render with a command whose `canRun()` is false → the button is rendered *and* `disabled`; flip the note to `"x"` → `canRun()` true → click → `run()` called once. Then a second test drives an unrelated command (`approve`) whose `canRun()` ignores the note — proving the enablement rule lives on the command, not on shared component state.
- **Cost:** one indirection layer for two buttons. Worth it because the creator role adds three more commands (`task-actions.ts:7` already names them) and each has its own enablement rule (deadline window, status).

### 2.2 Strategy — role decides *which* action set, not *how* it renders

```ts
export type ActionSet = PanelCommand[];

export function actionsFor(input: {
  role: Role;                 // "admin" | "creator"  — frontend/src/lib/session.ts:4
  waitingOn: "admin" | "creator" | null;
  latestSubmissionId?: string;
  creatorActions: TaskAction[]; // facts from the endpoint, not re-derived client-side
  run: ActionPorts;
}): ActionSet
```

Two strategies (admin, creator) selected by one lookup, sharing one renderer. The critical discipline: **the creator strategy consumes facts the server already computed** (`creatorActions` from `task-actions.ts:42-55`) instead of re-implementing `canSubmitVideo` in the browser — two copies of an eligibility rule will drift, and the client copy is the one an attacker ignores anyway. The buttons are UX; the endpoints (`approve`, `revise`, `video`) stay authoritative, exactly as they are today (`submission-review.service.ts:110-119`).

- **Test that proves it:** one table-driven test over `(role, waitingOn, status)` → expected command kinds. Admin+`waitingOn: "creator"` → `[]` (renders the waiting message, no buttons). Creator+`["submit_video"]` → one command with the H-1 label.
- **Cost:** the panel can no longer answer "what should this button do?" from local state alone; it needs the payload. That is already true of `DraftPreviewModal` (`load` prop, `draft-preview-modal.tsx:156-167`).

### 2.3 Adapter — the API shape never reaches the components

`lib/content-detail.ts` owns `RawContentDetail → ContentDetail`, mirroring `toDraftPreview` (`draft-preview.ts:64-81`): default missing header fields to `EMPTY`, keep the endpoint's newest-first order **without re-sorting**, filter empty notes with the same `hasNote` rule (`draft-preview.ts:60-62`).

- **Test:** a raw fixture with `null` header fields, an empty revision note and out-of-order timestamps → assert the view model shape, and assert the array order is unchanged (the endpoint's order is the contract).
- **Cost:** one mapping file per endpoint. The team already pays it three times (`draft-preview.ts`, `my-tasks.ts`, `creators.ts`) — consistency is the point.

### 2.4 State — discriminated unions, one state at a time

Copy the existing `LoadState` shape (`draft-preview-modal.tsx:26-30`): `loading | loaded | not_found | failed`. The decision flow gets the same treatment that `review-actions.tsx:46` already uses (`pending: "approve" | "revise" | null`), plus `formOpen`. A union makes "error and loaded on screen together" unrepresentable — the compiler enforces the invariant the comment at `draft-preview-modal.tsx:25` currently states in prose.

- **Test:** the three error paths (404 → "tidak ditemukan", other → "gagal memuat", loading → placeholder) as three cases of one table.

### 2.5 Null Object — "waiting on the other role" is a value, not an absence

`actionsFor` returns `[]`, and the panel renders a `WaitingStep` ("Menunggu kreator" / "Menunggu Admin") for the empty case, mirroring the prototype's `lcNext()` which always returns `{who, text, buttons}`. No `null` action, no `if (actions)` in the render tree — the same way `ACTION_LABELS`/`CONTENT_STATUS_LABELS` are `Record`s so a missing key is a type error, not a blank cell (`my-task-table.tsx:12-16`, `content-labels.ts:8-15`).

### 2.6 Observer (callbacks) — the panel reports upward, never reaches down

Already the house pattern: `onDecided` / `onFormToggle` (`review-actions.tsx:39-43`), `onSubmitted`/`onClose` on the submit modals (`my-task-board.tsx:62-79`). The panel keeps it: after any successful command it calls `router.refresh()` and `onDecided()`, and the touchpoint closes itself. The panel never imports `useRouter` for *navigation to a page* and never holds "which modal is open" — that state belongs to the touchpoint (`my-task-board.tsx:35`).

### 2.7 Composite — the panel is a slot tree, not a monolith

Header + tags + timeline + current-step card, where the current-step card holds an **action slot** (`actions?: ReactNode`, exactly `draft-preview-modal.tsx:160,199`). Your subtask's actions mount there; 6.5's timeline mounts beside it. This is also the agreed integration contract with the Content Detail panel subtask — extend the existing slot rather than inventing a second mechanism.

---

## 3. SOLID, one letter at a time

| Principle | Where it shows in this subtask | Evidence / test |
|---|---|---|
| **S**ingle Responsibility | Four modules, four reasons to change: `content-detail.ts` (API shape), `panel-actions.ts` (eligibility → commands), `content-detail-panel.tsx` (composition/render), the touchpoints (open/close state). If the API adds a field, exactly one file changes; if the design changes, exactly one file changes. | Lint-level proof: the panel file imports no `fetch`, no `api-client`, no session helpers. |
| **O**pen/Closed | Action kinds live in one `Record<PanelCommand["kind"], {label, variant}>` (the `ACTION_LABELS` convention, `my-task-table.tsx:12-16`). Adding the dashboard's future action, or the "Tinjau pengajuan" action from the prototype, is a new map entry + a new command factory — **zero edits to the render tree**. | *The OCP test:* render the panel with an injected command list containing a kind the codebase has never seen, assert it renders with its label and calls `run()`. If that test needs a component edit, the design failed. |
| **L**iskov Substitution | `ContentDetailLoader` (and later `PanelCommand`) implementations must be interchangeable. The real `fetchContentDetail` and the test stub are used through the same prop with identical observable behaviour — the panel cannot tell them apart, so neither can a touchpoint. | Existing precedent: `DraftPreviewModal`'s `load` prop is already swappable (`draft-preview-modal.tsx:156`), and `VideoSubmitter` is the same trick (`video-submission.ts:35-38`). |
| **I**nterface Segregation | The panel depends on the narrowest thing that satisfies it: `ContentDetailLoader`, not `apiFetch` + `Response` + JSON parsing; `PanelCommand`, not a service class. Backend mirror: services take `Pick<PrismaService, 'contents'>`, never the client (`creators.service.ts:161`, `creator-onboarding.service.ts:103`). | A test constructs the panel with a one-function stub — if it needed a second method, the interface was too fat. |
| **D**ependency Inversion | High-level module (panel) declares the ports; low-level modules (`api-client`, `draft-review-actions`, `video-submission`) implement them; **wiring happens only at the touchpoints**, which pass the real implementations as props. Backend equivalent already in the repo: `useFactory` providers injecting Prisma into plain classes (`submissions.module.ts:22-27`) and `@Optional() @Inject('CONTENT_SCHEDULING')` (`contents.service.ts:109-111`). | Swap the loader for a rejecting stub → the failed state renders; swap for a resolving stub → loaded state renders. Same component, both behaviours, no mocking of modules. |

**Prefer props-and-callbacks over DI-container ceremony on the frontend.** The React idiom (props = injected dependencies) *is* dependency inversion; do not add a context/provider layer to "look more enterprise" — the codebase has none, and reviewers on this team reward the existing style (`vi.mocked` over `any`, ports over god-objects).

---

## 4. What not to do (this is graded as harshly as what you do)

- **No Abstract Factory / Singleton / Bridge / Decorator.** Nothing in this subtask has multiple families of related products, a single-instance resource, two independent dimensions of variation, or wrapping behaviour. Forcing them is a rubric red flag, not a green one.
- **No duplicated eligibility rules.** If `panel-actions.ts` re-derives "can this creator submit video today", you now have three sources of truth (`task-actions.ts`, the endpoint, the browser). Consume the facts.
- **No security-by-UI.** Disabling a button is UX. Every action's authority stays in the endpoint's compare-and-set guard (`submission-review.service.ts:110-119`) — say this in the PR so nobody reads the disabled state as a control.
- **No shared mutable "current panel" singleton.** The touchpoint owns open/closed state (`my-task-board.tsx:35` is the model). A global would break the "opens from five places" requirement the moment two surfaces exist at once.

---

## 5. How to write it up so the rubric can see it

For each pattern/principle, three lines in the PR (or your reflection report):

1. **Problem** — the requirement sentence that created it ("role-based actions depend on data the panel does not own").
2. **Decision + location** — `panel-actions.ts:actionsFor` implements Strategy; `PanelCommand.canRun` implements Command's enablement.
3. **Proof** — the test name that fails if the pattern is removed (e.g. *"renders an injected command kind the codebase has never seen"* for OCP).

Then one honest paragraph on cost: Command adds a layer for two buttons; Strategy couples the panel to the endpoint's payload shape; the Adapter duplicates mapping code per endpoint. Rubrics reward the trade-off statement far more than the pattern count — three well-justified patterns beat seven name-drops.

### Rubric self-check before you open the PR

- [ ] Each action is a `PanelCommand` with its own `canRun()` — the Kirim rule is not hard-coded in JSX.
- [ ] `actionsFor(role, facts)` is a pure function, fully table-tested, and consumes server-computed `creatorActions`.
- [ ] The panel imports no fetch/session/router module; all four are injected as props/callbacks.
- [ ] One `Record` maps action kinds to labels/variants (no `switch` in render).
- [ ] The OCP test (injected unknown action kind) passes without editing the component.
- [ ] Load and decision states are discriminated unions; "loaded + error" is unrepresentable.
- [ ] The PR names each pattern, its requirement, its file, its proving test, and its cost.
