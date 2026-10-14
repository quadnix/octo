# @quadnix/octo

The base framework of [Octo](https://octo.quadnix.com/). Users read the site; this file holds what a
maintainer must know before reading this package's code. `docs/ARCHITECTURE.md` places it in the
repository.

## Resource scope

A module author names a resource with a `localResourceId`, unique within its **scope**: the models
above the node whose action created it. Octo appends a short hash of the scope to form the
`resourceId`, unique across the app.

```
table "accounts" in region us-east-1   →  dynamodb-accounts-3c1f9e
table "accounts" in region eu-west-1   →  dynamodb-accounts-a84d20
```

`resourceId` is used wherever one id across the app is needed: the context, Terraform addresses,
`octo run-action`, state. A module's lookups of its own resources use `localResourceId`, so one
module's resources need distinct `localResourceId`s even in different scopes.

`TransactionService.getResourceScope()` derives the scope:

- For a model, its parents.
- For an overlay, the parents of every model it joins that **its own module created**. Borrowed
  models are what it joins, so joining one more changes no id. An overlay joining only borrowed
  models takes all of theirs.
- A model another member already sits under is left out; the member's context names it.
- A resource built outside a model action has an empty scope: `resourceId` equals
  `localResourceId`.

### One model action at a time

The constructor needs the scope, because linking a resource to its parents fixes its context. The
author never passes it: the resource reads the static `AResource.constructionScope`, which
`runInScope()` sets around each model action and `constructInScope()` around each `new` in
`unSynth()`.

**That field is shared by the process, so only one model action may run at a time.** A second one
running alongside would overwrite it, and the first's resources would take the wrong `resourceId` —
silently. Keep model actions sequential, and wrap only a synchronous `new` in `constructInScope`,
never an `await`.

### One resource, one owner

A resource belongs to the module whose action created it: only that module's actions find it in
`actionInputs.resources`, and only its tags apply. Another module may change it through its own
methods and return it (`S3Storage.addPermission()`); it stays with its creator.

## The journal

The state in `.octo/` records where things ended up. The **journal** records how they got there:
every event each command emitted, what each Terraform process printed, and a copy of each state
file version a command overwrote. It exists when `octo.yaml` lists `JournalEventListener`.

```
journal.<commandId>.<command>.json             every event, in order
journal.<commandId>.<command>.terraform.json   Terraform and Terragrunt output
journal.<commandId>.<command>.<md5>.json       a copy of a state file the command wrote
```

`commandId` is a UTC timestamp plus 8 random hex, so ids sort by start. When the lock is released,
every journal file moves to `.octo/archives/<lockId>/`.

### Three packages, three lanes

- **`JournalEventListener`** (`octo-event-listeners`) only creates files, through
  `StateManagementService.saveStates`. It never moves, deletes or uploads one.
- **`StateManagementService`** decides the rest, the same for every provider: whether a lock may be
  taken over the files present, and archiving them.
- **The CLI** (`OctoUtility.runCommand`) emits `CommandStartedEvent` and then
  `CommandFinishedEvent` or `CommandFailedEvent`, awaiting the last before exit. The listener
  registers after the first is emitted and still receives it because `EventService` replays buffered
  events to a late listener.

### When it is written

Always as one `saveStates` call, at three moments:

1. **With every other state save**, through `StateFilesSavingEvent`, so it rides the same write — and,
   during an apply, the periodic Terraform state check-in.
2. **When the command ends.**
3. **Before the lock is released**, on `AppUnlockingEvent`. This is the only write that fails the
   command: the lock stays held, and re-running `commit` retries.

A command that needs a lock writes nothing without one; the commands that run before a lock are
`JOURNAL_COMMANDS_BEFORE_LOCK`. A killed process loses what it recorded since its last save.

### Release before moving

`unlockApp` emits `AppUnlockingEvent`, checks the lock id, **releases the lock, then moves the
files**. While a lock is held, a remote save uploads `.octo/` as it stands, so moving first would
seal a run with no journal. A failed move is reported, not thrown: the run is already sealed.

### Refusing a new lock

Taking a new lock (not resuming one) refuses with `AppLockError` reason `unfinished` when `.octo/`
holds a journal file of any command but `generate`, `validate` or `lock`. Those three run before a
lock and belong to the run it starts. Any other file belongs to a run whose archive move failed, and
taking a lock over it would file it under the wrong lock id. With local state, these files are the
journal's only copy.

### Remote state

A name holding `/` (an archived file) is the machine's own: never uploaded, never counted toward the
backend's limits. Other journal files are always uploaded, in the same save as Terraform state, and
so count toward those limits. They are downloaded only when resuming the lock that uploaded them.
