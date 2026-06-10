# i18n + Wails 3 Desktop Implementation Checklist

## Purpose

This document captures the recommended repo strategy for adding Chinese translation support and packaging the app with Wails 3 while keeping upstream merges manageable.

Primary goals:

- Ship a Chinese-capable desktop build
- Keep upstream source files as close to original as practical
- Avoid long-lived manual edits across many `tsx` files
- Keep desktop concerns isolated from the current Bun + React app

Primary constraint:

- The tracked source tree should remain merge-friendly

Because of that constraint, the recommended i18n path in this repo is **generated-copy localization**, not "edit every tracked React file in place".

---

## Recommended Architecture

### Web localization

Use a generated-copy workflow:

- Keep `apps/web/src` as the upstream-facing source tree
- Store translation resources separately
- Generate a localized working copy before dev/build
- Run codemods only on the generated copy
- Point a dedicated Vite config at the generated copy

This means:

- tracked `tsx` files stay close to upstream
- localized React code exists only under generated output
- merge conflicts are dramatically reduced

### Desktop packaging

Use a standalone Wails shell:

- Wails starts the Bun server as a child process
- Bun continues serving `/api`, `/ws`, uploads, and static assets
- Wails opens `http://127.0.0.1:<port>/`

This keeps desktop packaging independent from the current web/server architecture.

---

## Why This Strategy

There are three broad choices:

1. In-place i18n edits across tracked `tsx` files
2. DOM overlay / runtime text replacement
3. Generated-copy localization

For this repo, option 3 is the best balance.

Why not in-place tracked edits:

- they work technically
- they create lots of future merge pressure
- every upstream UI change can collide with local translation edits

Why not a pure DOM overlay:

- fragile with React rerenders
- hard to cover placeholders, aria labels, dialog text, and dynamic states
- difficult to keep accurate as the app evolves

Why generated-copy localization fits best:

- React still renders true translated UI
- tracked upstream source stays mostly clean
- localization work becomes reproducible instead of hand-maintained

---

## Repo Layout

### Tracked source of truth

- `apps/web/src`
- `apps/server/src`
- `apps/web/src/i18n/resources/zh-CN.ts`
- `docs/i18n-wails3-implementation-checklist.md`

### Generated or automation-only area

Recommended:

- `localization/config.json`
- `localization/scripts/*`
- `.generated/web-src-i18n/*`
- `.generated/web-entry-i18n/*`

Do not commit generated localized source:

- `.generated/**`

Optional to keep tracked:

- localization scripts
- key maps
- extraction config

Do not keep tracked by default:

- generated rewritten `tsx`
- generated temporary entrypoints
- generated message snapshots unless intentionally curated

---

## High-Level Build Flow

### Normal upstream-oriented development

Use the original app source:

- `bun run dev`
- `bun run build`

### Chinese localized development

Use generated-copy commands:

- `bun run l10n:prepare`
- `bun run dev:zh`

### Chinese localized build

- `bun run l10n:prepare`
- `bun run build:zh`

Conceptually:

1. Copy selected web source into `.generated`
2. Inject i18n helpers and replace hardcoded text in the generated copy
3. Build or serve from the generated copy

---

## What Stays Tracked vs Generated

### Keep tracked

- translation dictionaries
- localization config
- codemod rules
- file include/exclude lists
- Wails desktop source
- docs explaining the workflow

### Keep generated

- rewritten React component files
- generated i18n entrypoints for build
- temporary alias roots
- machine-produced mappings and snapshots unless they are intentionally reviewed artifacts

---

## Concrete Web Plan

## Phase 0: Re-stabilize the tracked tree

Objective:

- Stop carrying large manual `tsx` translation edits in the tracked source tree

Checklist:

- [ ] Restore tracked `apps/web/src/**/*.tsx` files to upstream-facing versions
- [ ] Keep translation resources such as `apps/web/src/i18n/resources/zh-CN.ts`
- [ ] Remove generated localization output from tracked changes
- [ ] Add `.generated/` to `.gitignore` if not already ignored
- [ ] Decide whether `localization/` scripts are worth keeping now or later

Acceptance:

- Tracked UI source is not broadly rewritten for i18n
- Translation work remains represented by resource files and automation

---

## Phase 1: Define generation boundaries

Objective:

- Be explicit about what files are allowed to be localized automatically

Checklist:

- [ ] Create a localization config listing included source files
- [ ] Start with a narrow set of high-value files
- [ ] Define excluded paths such as tests, protocol types, and tooling files
- [ ] Add key naming rules
- [ ] Define strings that must remain untranslated

Suggested starting include set:

- layout and navigation
- settings shell
- onboarding shell
- a small number of main views

Avoid at first:

- deeply dynamic form builders
- tool rendering internals
- protocol-facing technical labels

Acceptance:

- The automation has a clear and intentionally limited target surface

---

## Phase 2: Build the generated-copy pipeline

Objective:

- Create a repeatable local pipeline that never rewrites tracked source files

Checklist:

- [ ] Create `.generated/web-src-i18n`
- [ ] Copy allowed source files from `apps/web/src`
- [ ] Copy or synthesize any required entry files
- [ ] Run codemods against the generated files only
- [ ] Inject `useTranslation()` and `t(...)` only in generated output
- [ ] Write a dedicated Vite config for localized builds
- [ ] Alias imports so the app resolves from `.generated` during `dev:zh` and `build:zh`

Recommended generated assets:

- `.generated/web-src-i18n/**`
- `.generated/web-entry-i18n/main.tsx`
- `.generated/web-entry-i18n/i18n.ts`

Acceptance:

- We can run a localized dev or build flow without modifying tracked `tsx` files

---

## Phase 3: Keep translation resources first-class

Objective:

- Make translation files the durable part of the localization work

Checklist:

- [ ] Keep `zh-CN.ts` organized by semantic sections
- [ ] Keep English as fallback
- [ ] Make sure missing keys fail safely to English
- [ ] Add verification that generated code only references known keys
- [ ] Add verification for duplicate or inconsistent keys

Acceptance:

- Translation maintenance primarily happens in resource files, not in page-by-page tracked component edits

---

## Phase 4: Add localized dev/build commands

Objective:

- Make the workflow ergonomic enough to use regularly

Checklist:

- [ ] Add `l10n:prepare`
- [ ] Add `dev:zh`
- [ ] Add `build:zh`
- [ ] Add optional `l10n:verify`
- [ ] Document what each command reads and writes

Recommended behavior:

- `l10n:prepare` is idempotent
- rerunning it refreshes generated output from tracked source
- deleting `.generated` is always safe

Acceptance:

- A localized build is one command away and reproducible

---

## Phase 5: Introduce Wails 3 on top of the localized build

Objective:

- Package the Chinese build without changing the core Bun server architecture

Checklist:

- [ ] Create `apps/desktop`
- [ ] Make the desktop app consume the localized web build output
- [ ] Start Bun as a child process
- [ ] Wait for readiness before opening the window
- [ ] Shut Bun down cleanly when the app exits

Acceptance:

- Wails packages the localized app without requiring tracked in-place i18n edits across `apps/web/src`

---

## Suggested File Layout

### Tracked

- `apps/web/src/i18n/resources/en.ts`
- `apps/web/src/i18n/resources/zh-CN.ts`
- `localization/config.json`
- `localization/scripts/prepare.ts`
- `localization/scripts/verify.ts`
- `apps/web/vite.i18n.config.ts`
- `apps/desktop/**`

### Ignored

- `.generated/web-src-i18n/**`
- `.generated/web-entry-i18n/**`
- `.generated/localization-cache/**`

---

## Vite Strategy

Use a dedicated localized Vite config rather than changing the main one.

Recommended split:

- `apps/web/vite.config.ts` for normal upstream-facing dev/build
- `apps/web/vite.i18n.config.ts` for generated localized dev/build

This keeps the default workflow boring and predictable while letting the localized build point to generated sources.

---

## Translation Scope Rules

Translate:

- headings
- labels
- buttons
- empty states
- helper text
- dialogs
- navigation labels
- settings descriptions

Do not translate:

- API paths
- route paths
- env var names
- task IDs
- model IDs
- tool ids
- code blocks
- shell commands
- file paths
- protocol field names
- raw server logs

Translate carefully:

- provider display labels
- marketplace metadata
- server-generated error strings
- highly technical guidance text

---

## Merge-Friendly Rules

- Do not commit generated rewritten `tsx` files
- Do not let localized builds become the default build path
- Keep tracked translation edits concentrated in resource files and automation config
- Keep Wails fully isolated in `apps/desktop`
- Limit any tracked app-source i18n edits to the absolute minimum infrastructure needed

What "absolute minimum" means here:

- resource files
- optional i18n bootstrap helpers
- build scripts
- dedicated localized Vite config

Not this:

- broad manual replacement of hardcoded strings across tracked views

---

## Testing Checklist

### Localization pipeline

- [ ] `l10n:prepare` runs from a clean checkout
- [ ] `.generated` is recreated deterministically
- [ ] missing keys fall back to English
- [ ] generated localized source compiles successfully

### App behavior

- [ ] chat works
- [ ] WebSocket streaming works
- [ ] tasks work
- [ ] routines work
- [ ] inbox works
- [ ] KB works
- [ ] settings work
- [ ] notifications still render correctly

### Merge safety

- [ ] tracked `apps/web/src/**/*.tsx` files remain close to upstream
- [ ] localized build works after rerunning generation from a fresh checkout

### Desktop behavior

- [ ] desktop app starts Bun successfully
- [ ] desktop app waits for readiness
- [ ] desktop app exits without orphan child processes
- [ ] localized build is what the desktop shell serves

---

## Risks

### Pipeline complexity

- Generation scripts add build complexity
- Errors may point into generated files instead of tracked source

### Codemod limits

- Not every JSX string can be transformed safely without human review
- Some dynamic UI may need explicit handling rules

### Drift risk

- If upstream changes wording or component structure, generation rules may need adjustment

Even with those costs, this is still better for this repo than carrying broad long-lived manual translation edits in tracked React files.

---

## Recommended Next Steps

1. Restore tracked `tsx` files and package scripts that were changed for in-place i18n experiments
2. Keep `zh-CN.ts` as the translation work-in-progress source
3. Decide whether to keep or reset the current `localization/` prototype scripts
4. Implement `.generated`-based `l10n:prepare`
5. Add `vite.i18n.config.ts`
6. Add `dev:zh` and `build:zh`
7. Hook Wails to the localized build output

---

## Definition of Done

This strategy is successfully in place when:

- Chinese translations live primarily in resource files
- localized React source is generated, not hand-maintained in tracked views
- upstream merges do not routinely conflict with local translation work
- the desktop build can ship the Chinese UI without broad tracked source edits
