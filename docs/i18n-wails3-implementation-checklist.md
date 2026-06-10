# i18n + Wails 3 Desktop Implementation Checklist

## Document Purpose

This document turns the current i18n + Wails 3 desktop plan into a repository-level implementation checklist for `omp-deck`.

Primary goals:

- Add Chinese UI translation support with minimal disruption to upstream merges
- Package the app as a desktop application with Wails 3
- Keep the desktop layer isolated from core web/server logic
- Prefer additive changes over large refactors

Non-goals for the first pass:

- Translating every server-generated error string
- Rewriting the Bun server into Go
- Replacing the existing web architecture
- Achieving perfect parity for every browser-only API on day one

---

## Current Repo Shape

Relevant areas in the current repository:

- `apps/web`: React + Vite frontend
- `apps/server`: Bun + Hono backend
- `packages/protocol`: shared protocol/types

Important implementation facts from the current codebase:

- The frontend assumes same-origin API access via `/api`
- The frontend assumes same-origin WebSocket access via `/ws`
- The Bun server already serves static frontend assets in production
- The Vite dev server already proxies `/api` and `/ws` to the Bun server

This is ideal for a low-intrusion desktop architecture:

- Keep the existing frontend behavior
- Keep the existing Bun server behavior
- Add a Wails desktop shell that starts the Bun server as a child process

---

## Guiding Principles

Use these rules to keep future upstream merges manageable.

- Prefer adding new files over rewriting existing ones
- Keep i18n concerns inside `apps/web`
- Avoid modifying `packages/protocol` unless truly necessary
- Avoid mixing translation work with unrelated UI refactors
- Keep Wails code in a separate top-level app directory
- Do not change API routes, WebSocket paths, or existing protocol shapes for v1
- Preserve English as the source-of-truth fallback locale
- Translate UI copy, but do not translate code, model IDs, env keys, API paths, or tool identifiers

---

## Recommended Target Architecture

### i18n

Recommended stack:

- `i18next`
- `react-i18next`

Recommended frontend structure:

- `apps/web/src/i18n/index.ts`
- `apps/web/src/i18n/resources/en.ts`
- `apps/web/src/i18n/resources/zh-CN.ts`
- `apps/web/src/i18n/useLocale.ts`
- `apps/web/src/i18n/format.ts`

### Desktop

Recommended desktop app location:

- `apps/desktop`

Recommended architecture:

- Wails launches a local Bun server child process
- Bun server serves API, WebSocket, uploads, and static frontend
- Wails opens a window to `http://127.0.0.1:<dynamic-port>/`

Why this architecture is preferred:

- Minimal changes to existing app logic
- Frontend keeps using `/api` and `/ws` unchanged
- Bun server remains the single HTTP entrypoint
- Wails stays isolated as a packaging and lifecycle layer

---

## Directory and File Plan

### New i18n files

Add:

- `apps/web/src/i18n/index.ts`
- `apps/web/src/i18n/resources/en.ts`
- `apps/web/src/i18n/resources/zh-CN.ts`
- `apps/web/src/i18n/useLocale.ts`
- `apps/web/src/i18n/format.ts`

Likely update:

- `apps/web/package.json`
- `apps/web/src/main.tsx`
- `apps/web/src/views/SettingsView.tsx`

### New desktop files

Add:

- `apps/desktop/go.mod`
- `apps/desktop/main.go`
- `apps/desktop/wails.json` or Wails 3 equivalent config files
- `apps/desktop/internal/app/app.go`
- `apps/desktop/internal/runtime/server_process.go`
- `apps/desktop/internal/runtime/ports.go`
- `apps/desktop/internal/runtime/health.go`
- `apps/desktop/README.md`

Optional later:

- desktop-specific icons
- installer resources
- platform-specific packaging overrides

### Root-level script updates

Possible updates:

- root `package.json` scripts for web i18n workflow
- root docs for desktop build flow

Avoid in v1:

- changing the existing `apps/server` startup contract unless required

---

## Phase Plan

## Phase 0: Preparation

Objective:

- Create safe seams before translating or packaging anything

Checklist:

- [ ] Create this implementation branch separately from other feature work
- [ ] Decide whether desktop code will live under `apps/desktop` or top-level `desktop`
- [ ] Confirm Wails 3 version to pin for this repo
- [ ] Decide minimum supported desktop platforms for v1
- [ ] Decide whether Bun runtime will be bundled or treated as external during local development
- [ ] Create a short ADR or README note describing the chosen architecture

Acceptance:

- Team agrees that the desktop layer will wrap the existing Bun server instead of replacing it

---

## Phase 1: Add i18n Foundation

Objective:

- Introduce translation infrastructure without changing product behavior

Checklist:

- [ ] Install `i18next` and `react-i18next` in `apps/web`
- [ ] Create a small `i18n/index.ts` initializer
- [ ] Add `en` resource file with baseline strings
- [ ] Add `zh-CN` resource file with first-pass Chinese translations
- [ ] Initialize locale from `localStorage`, then browser language, then fallback to `en`
- [ ] Wrap the app in i18n initialization from `apps/web/src/main.tsx`
- [ ] Add locale helper hook to change language cleanly
- [ ] Add shared formatting helpers for date/time/number using `Intl`

Suggested code touch points:

- `apps/web/src/main.tsx`
- new `apps/web/src/i18n/*`

Rules:

- Do not refactor view structure in this phase
- Do not translate all screens yet
- Do not move existing store logic unless necessary

Acceptance:

- App boots normally in English
- Language can be switched programmatically
- Missing translations fall back cleanly to English

---

## Phase 2: Add Language Settings UI

Objective:

- Let users switch between English and Chinese

Checklist:

- [ ] Add a language selector to `SettingsView`
- [ ] Store the selected locale in `localStorage`
- [ ] Reflect the active locale in UI immediately without reload if practical
- [ ] Ensure the default locale is deterministic
- [ ] Add translation keys for the language selector itself

Suggested code touch points:

- `apps/web/src/views/SettingsView.tsx`
- `apps/web/src/i18n/useLocale.ts`

Recommended first version:

- Support only `en` and `zh-CN`
- Keep locale persistence purely frontend-side

Avoid in v1:

- adding locale persistence to the server
- adding locale to shared protocol types

Acceptance:

- User can switch language from Settings
- Language remains selected after refresh

---

## Phase 3: Translate App Shell First

Objective:

- Translate the highest-visibility UI with the lowest behavioral risk

Translate first:

- navigation labels
- settings section labels
- layout titles
- onboarding headings
- common button labels
- notification banners and toasts
- loading, empty, and generic status text

Priority files:

- `apps/web/src/components/Layout.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/NavRail.tsx`
- `apps/web/src/router.tsx`
- `apps/web/src/views/SettingsView.tsx`
- `apps/web/src/views/OnboardingView.tsx`
- `apps/web/src/components/NotificationPermissionBanner.tsx`
- `apps/web/src/components/NotificationToast.tsx`

Checklist:

- [ ] Replace visible hardcoded strings with `t(...)`
- [ ] Add semantic translation keys
- [ ] Avoid using full English sentences as keys
- [ ] Keep aria-labels translated where applicable
- [ ] Keep route paths unchanged

Naming guidance:

- Good: `settings.sections.env.label`
- Good: `common.actions.save`
- Bad: `Environment variables`
- Bad: `Save`

Acceptance:

- Main shell reads correctly in both English and Chinese
- No route, API, or state behavior changes

---

## Phase 4: Translate Core Views

Objective:

- Cover the screens users spend the most time in

Priority order:

1. Chat
2. Tasks
3. Routines
4. Inbox
5. KB
6. Marketplace
7. Skills
8. Integrations

Likely files:

- `apps/web/src/views/ChatView.tsx`
- `apps/web/src/views/TasksView.tsx`
- `apps/web/src/views/RoutinesView.tsx`
- `apps/web/src/views/InboxView.tsx`
- `apps/web/src/views/KbView.tsx`
- `apps/web/src/views/MarketplaceView.tsx`
- `apps/web/src/views/SkillsView.tsx`
- `apps/web/src/views/IntegrationsView.tsx`

Checklist:

- [ ] Translate headings, labels, hints, empty states, modal copy
- [ ] Translate button copy and inline helper text
- [ ] Keep identifiers like task IDs, env keys, commands, and file paths untranslated
- [ ] Keep server-returned raw error messages unchanged unless explicitly mapped

Acceptance:

- Core day-to-day flows are usable in Chinese
- No broken forms caused by translation changes

---

## Phase 5: Translate Component Long Tail

Objective:

- Finish lower-priority surfaces after the main UX is stable

Likely areas:

- `apps/web/src/components/tools/*`
- `apps/web/src/components/chat/*`
- `apps/web/src/components/routines/*`
- `apps/web/src/components/tasks/*`
- `apps/web/src/components/settings/*`

Checklist:

- [ ] Translate remaining modal labels and status copy
- [ ] Translate inspector/helper surfaces
- [ ] Normalize repeated strings into shared keys
- [ ] Identify strings that should remain English by design

Acceptance:

- No major untranslated shell text remains in normal usage

---

## Phase 6: Add Wails 3 Desktop Shell

Objective:

- Create an isolated desktop wrapper without changing the existing app contract

Recommended behavior:

- Wails chooses an open localhost port
- Wails starts the Bun server child process with environment overrides
- Wails waits for health readiness
- Wails opens the app URL in the desktop window
- Wails stops the child process on app shutdown

Checklist:

- [ ] Scaffold `apps/desktop`
- [ ] Add Wails 3 app bootstrap
- [ ] Add child-process manager for Bun server
- [ ] Add dynamic port selection
- [ ] Add health polling before opening the main window
- [ ] Inject `OMP_DECK_HOST=127.0.0.1`
- [ ] Inject `OMP_DECK_PORT=<selected-port>`
- [ ] Inject any desktop-specific data dir overrides if needed
- [ ] Ensure clean shutdown on app exit
- [ ] Capture server stdout/stderr for debugging

Preferred startup contract:

- Bun server remains authoritative for:
  - `/api`
  - `/ws`
  - `/uploads`
  - frontend static assets

Avoid in v1:

- moving HTTP routing into Go
- proxying every request through Wails manually
- reimplementing WebSocket behavior in the desktop shell

Acceptance:

- Desktop app launches the existing server and loads the app successfully
- Existing frontend network assumptions remain valid

---

## Phase 7: Desktop Packaging and Distribution

Objective:

- Produce installable desktop builds while keeping local dev practical

Checklist:

- [ ] Decide how Bun is provided in packaged builds
- [ ] Verify desktop app can find server assets in packaged layout
- [ ] Add platform-specific icons and metadata
- [ ] Add release build documentation
- [ ] Test packaged startup on a clean machine

Decision to make:

- Bundle Bun runtime and app assets together
- Or compile/package the Bun server into a more self-contained form first

Recommended first shipping model:

- Keep packaging simple and explicit, even if not yet perfectly minimal

Acceptance:

- A non-developer can install and run the desktop build without manually opening the web UI

---

## Translation Scope Rules

Translate:

- headings
- labels
- buttons
- hints
- empty states
- warnings
- success messages
- settings descriptions
- onboarding text

Do not translate:

- API endpoints
- route paths
- env var names
- task IDs
- model IDs
- code blocks
- shell commands
- file paths
- protocol field names
- raw server logs

Translate with caution:

- tool names
- provider labels
- marketplace metadata from external sources
- server-generated error strings

---

## Recommended Key Structure

Use semantic namespaces. Example:

- `common.actions.save`
- `common.actions.cancel`
- `common.status.loading`
- `nav.chat`
- `nav.tasks`
- `settings.title`
- `settings.sections.env.label`
- `settings.sections.env.description`
- `notifications.permission.enable`
- `onboarding.steps.kb.title`

Rules:

- Keep keys stable even if English wording changes
- Avoid giant flat key files
- Group by feature area
- Do not build keys dynamically unless necessary

---

## Merge-Friendly Workflow

This is the most important section for long-term maintenance.

### Branching and PR strategy

Split work into small PRs:

1. i18n foundation
2. settings language switcher
3. app shell translation
4. core views translation
5. long-tail translation
6. desktop shell scaffold
7. desktop packaging

### Editing rules

- Only replace strings when possible
- Avoid reordering unrelated code
- Avoid broad formatting churn
- Keep per-file diff size modest
- Do not mix translation changes with behavior changes

### Upstream sync strategy

- Rebase frequently while the translation rollout is in progress
- Keep `apps/desktop` isolated so upstream web/server changes rarely conflict
- Prefer local wrappers and helper utilities over modifying shared protocol or server contracts

### Conflict hotspots to expect

- `apps/web/src/views/SettingsView.tsx`
- `apps/web/src/views/OnboardingView.tsx`
- major page views with lots of UI copy

Mitigation:

- touch them in focused PRs
- do not combine multiple large concerns in the same change

---

## Testing Checklist

## i18n testing

- [ ] English renders normally
- [ ] Chinese renders normally
- [ ] Locale persistence survives reload
- [ ] Missing keys fall back to English
- [ ] Dates and numbers format correctly under `zh-CN`
- [ ] Buttons, labels, banners, and modals remain aligned after translation
- [ ] Long Chinese text does not overflow key layouts

## Functional regression testing

- [ ] Chat session creation still works
- [ ] WebSocket streaming still works
- [ ] Task CRUD still works
- [ ] Routine CRUD still works
- [ ] Inbox flows still works
- [ ] KB open/edit flows still works
- [ ] Settings save flows still works
- [ ] OAuth flows still works
- [ ] Notifications/toasts still works

## Desktop testing

- [ ] Desktop app launches reliably
- [ ] Bun child process starts reliably
- [ ] App waits for readiness before showing main UI
- [ ] App exits cleanly without orphan process
- [ ] WebSocket works inside desktop runtime
- [ ] Uploads work inside desktop runtime
- [ ] OAuth flow is verified in desktop context
- [ ] Packaged build works on target OS versions

---

## Known Risks

### i18n risks

- Some strings are deeply embedded in large view files
- Some server-originated messages will remain English in v1
- Chinese copy may affect spacing in dense UI areas

### Desktop risks

- Wails 3 is still evolving quickly, so pinning and isolation matter
- Desktop WebView behavior may differ from browser behavior for notifications and auth
- Process lifecycle bugs can leave orphan Bun processes if shutdown is not handled carefully

### Integration risks

- OAuth flows may need special handling in desktop packaging
- Desktop notification behavior may differ from browser notification behavior

---

## Deferred Items

Reasonable to defer until after the first working release:

- server-side locale persistence
- translating server-originated error payloads by code mapping
- locale-aware markdown content in KB or onboarding generated assets
- more than two locales
- full desktop-native notification replacement
- desktop auto-update flow

---

## Suggested Implementation Order

If executed as actual work items, use this order:

1. Add `i18next` foundation
2. Add locale persistence and switcher
3. Translate shell and settings
4. Translate onboarding
5. Translate chat/tasks/routines/inbox
6. Translate KB and remaining views
7. Scaffold Wails desktop shell
8. Make desktop shell start and stop Bun cleanly
9. Add desktop packaging docs and release flow

---

## Definition of Done

The initiative is considered successfully landed when all of the following are true:

- Chinese can be selected from the UI
- Main product workflows are usable in Chinese
- English remains the fallback locale
- Translation changes are isolated mostly to `apps/web`
- Desktop code is isolated mostly to `apps/desktop`
- Desktop app starts the existing Bun server and opens successfully
- No major API or protocol rewrites were required
- Upstream syncing remains practical

---

## Practical Next Step

Start with a narrow first PR:

- add i18n dependencies
- add `apps/web/src/i18n/*`
- initialize i18n in `main.tsx`
- add a language switcher in `SettingsView`

That gives the repo a stable foundation before large-scale translation or desktop packaging begins.
