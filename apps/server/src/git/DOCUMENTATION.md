# Git Module Documentation

## Purpose
Git repository operations for the omp-deck server runtime: detection, status/diff,
stage/unstage/revert, commit, branch CRUD, checkout, log, stash, merge/rebase/cherry-pick,
worktrees, remotes, push/pull/fetch, and identity management.

## Entry points
- `apps/server/src/git/runGit.ts` — single helper for every `git` invocation
  with hardened env, timeout, error classification, and the `GitError` class.
- `apps/server/src/git/mutation-lock.ts` — per-cwd async mutex plus stale-lock
  detection so concurrent mutations don't race on `.git/index.lock`.
- `apps/server/src/git/git-service.ts` — public service functions (one per
  route endpoint). Each is thin: 1–2 git calls + porcelain parsing.
- `apps/server/src/git/identity-storage.ts` — global + local identity helpers
  and the `git-identities.json` registry.
- `apps/server/src/git/git-routes.ts` — Hono route registration for every
  `/api/git/*` endpoint.

## Public API

### Repository
- `isGitRepository(cwd)`: boolean
- `getToplevel(cwd)`: `string | null`

### Status / diff
- `getStatus(cwd, { includeUntracked? })`: `GitStatusResponse` (porcelain-v2)
- `getDiff(cwd, { path?, staged?, contextLines? })`: `GitDiffResponse`
- `getRangeDiff(cwd, { base, head, path? })`: `GitDiffResponse`
- `getFileDiff(cwd, path, { staged? })`: `{ original, modified, isBinary }`

### Mutations (serialized through `withGitLock`)
- `stageFiles(cwd, paths[])`
- `unstageFiles(cwd, paths[])`
- `revertFile(cwd, path, scope: "all" | "working")`
- `commit(cwd, message, { signOff?, stageFiles? })`: `{ sha }`
- `createBranch(cwd, name, { startPoint?, checkout? })`: `{ branch, checkedOut }`
- `deleteBranch(cwd, name, { force? })`
- `renameBranch(cwd, oldName, newName)`: `{ name }`
- `checkoutBranch(cwd, branch, { autoStash? })`
- `getLog(cwd, { maxCount?, from?, to?, path?, cursor? })`: `GitLogResponse`
- `getCommitFiles(cwd, sha)`: `{ files[] }`
- `listStashes(cwd)`: `{ entries[] }`
- `stashPush(cwd, { message?, includeUntracked? })`: `{ ref }`
- `stashApply(cwd, ref)`
- `stashPop(cwd, ref)` — `git stash pop` in one atomic step
- `stashDrop(cwd, ref)`
- `merge(cwd, branch, { noFf?, message? })`
- `abortMerge(cwd)` / `continueMerge(cwd, { message? })`
- `rebase(cwd, onto)`
- `abortRebase(cwd)` / `continueRebase(cwd)`
- `cherryPick(cwd, sha, { noCommit? })`
- `revertCommit(cwd, sha, { noCommit? })`: `{ sha }`
- `resetToCommit(cwd, sha, mode: "soft" | "mixed" | "hard")` — caller must gate `mode: "hard"`
- `getWorktrees(cwd)`: `{ worktrees[] }`
- `createWorktree(cwd, { path, mode: "new" | "existing", branch?, startRef? })`
- `removeWorktree(cwd, { path, deleteBranch? })` — caller must gate `deleteBranch: true`
- `getRemotes(cwd)`: `{ remotes[] }`
- `addRemote(cwd, name, url)`
- `removeRemote(cwd, name)` — refuses `name === "origin"`
- `deleteRemoteBranch(cwd, branch, remote?)`
- `push(cwd, { remote?, branch?, force?: "lease" | "no" })`: `{ setUpstream?, rejected?, reason? }`
- `pull(cwd, { remote?, branch?, rebase?, allowMergeCommit? })`
- `fetch(cwd, { remote?, prune? })`

### Identity
- `getGlobalIdentity()`: `{ userName, userEmail, sshCommand }`
- `getLocalIdentity(cwd)`: `{ userName, userEmail }`
- `setLocalIdentity(cwd, { userName, userEmail, sshKeyPath? })`
- `listIdentities(agentDir?)`, `saveIdentity(agentDir?, identity)`, `deleteIdentity(agentDir?, id)`
- `validateSshKey(path)`: `boolean` — checks the path is an OpenSSH key file

### Status response shape
```ts
{
  ok: true,
  cwd, branch, tracking?: { remote, branch, ahead, behind },
  files: [{ path, index, workingDir }],
  isClean,
  diffStats?: { [path]: { insertions, deletions } },
  mergeInProgress?: { head, message },
  rebaseInProgress?: { headName, onto },
}
```

`index` and `workingDir` are single-letter porcelain-v2 codes normalized so
`.` (unmodified, no index entry) maps to ` `. `?` denotes untracked.

### Conflict response
Merge, rebase, cherry-pick, and revert return `{ ok: false, code: "conflict", conflicts: { operation, head, files[] } }` with status 409.

### Identity response shape
```ts
{
  id, userName, userEmail,
  authType: "https" | "ssh",
  sshKeyPath?: string,
  isGlobal: boolean,
  updatedAt: string,
}
```

## Security notes

- `runGit` sets `LC_ALL=C`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`,
  and `GIT_SSH_COMMAND=ssh -o BatchMode=yes`. These prevent blocking on
  credential prompts (which would deadlock the request thread) and ensure
  stable output for parsing.
- All routes enforce `isCwdAllowed(cwd, allowedRoots)` from `fs-allow.ts` —
  the loopback transport isn't the authorization model.
- Destructive ops (`branch -D`, `reset --hard`, `worktree remove` with branch
  deletion) require `confirm: true` on the request body in addition to the
  UI's confirmation modal. The route layer rejects without it.
- `removeRemote` refuses `name === "origin"` (returned as 400 with a stable
  `code: "cannot_remove_origin"`).

## Concurrency

- Every mutation runs through `withGitLock(cwd, fn)` so the index is never
  touched concurrently from this process. The lock is per-cwd — different
  cwds run in parallel.
- If a stale `.git/index.lock` from another process is detected, the route
  surfaces `409 conflict` rather than auto-deleting; openchamber's approach
  of waiting 3 s for byte-identical locks is implemented in `detectStaleLock`
  for future use.

## Testing

- `apps/server/src/git/git-service.test.ts` — 20 tests covering every public
  service function end-to-end with real git in tmp dirs.
- `apps/server/src/git/git-routes.test.ts` — 17 tests covering the Hono
  router (status, mutations, validation, identity registry).
- `apps/server/src/git/mutation-lock.test.ts` — 9 tests for the lock queue
  and stale-lock detector.
- `apps/server/src/git/runGit.test.ts` — 6 tests for error classification
  and the GitError exception variant.

## Notes for contributors

- `git-service.ts` is intentionally a *lean subset* of simple-git; we
  expose only the calls the deck UI uses. Add new functions one at a time
  with their own test.
- Always go through `runGit` for spawning — never call `git` from the
  route layer directly. That keeps env/timeout/error-mapping in one place.
- When parsing git output, normalize `.` → ` ` for porcelain-v2 status
  codes (already done in `parseStatus`).
- For destructive operations the route requires an explicit `confirm`
  flag; don't bypass this in tests either.