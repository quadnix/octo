# @quadnix/octo

The base framework of [Octo](https://octo.quadnix.com/): models, resources, modules, transactions,
and the modes that turn them into Terraform. Cloud-specific modules live in other packages, such as
`@quadnix/octo-aws-cdk`.

This file is for people working on this package. Users read the docs site.

## Resource scope

### The scope of a resource

Every resource is created by a model action, and every model sits somewhere in the model graph. A
resource's **scope** is that place: the models above the node whose action created it.

A module author names a resource with a **`localResourceId`**, the first argument of its
constructor. That name only has to be unique within its scope. Octo adds a short hash of the scope
to it, and the result is the resource's **`resourceId`**, which is unique across the whole app.

```
table "accounts" in region us-east-1   →  localResourceId  dynamodb-accounts
                                           resourceId       dynamodb-accounts-3c1f9e
table "accounts" in region eu-west-1   →  localResourceId  dynamodb-accounts
                                           resourceId       dynamodb-accounts-a84d20
```

Everything that needs one id per resource across the app uses `resourceId`: the context, Terraform
addresses, `octo run-action`, and state. A module's own lookups of its resources use
`localResourceId`.

How the scope is worked out (`TransactionService.getResourceScope()`):

- For a model, the scope is the models it sits under, its parents.
- For an overlay, it is the parents of every model the overlay joins, put together.
- A model that another member already sits under is left out, because the member's context names it.
- A resource created outside a model action, such as one a test builds, has an empty scope, and its
  `resourceId` is its `localResourceId`.

### How a resource gets its scope

The author never passes the scope. A resource reads it while it is being constructed, from one
static field on `AResource`: `constructionScope`. It has to be known then, because the constructor
links the resource to its parents, and that fixes the resource's context.

Two methods set the field around the code that builds resources and put the previous value back
afterward:

- `AResource.runInScope(scope, run)` around each model action, called by the transaction. It is
  async, because actions are.
- `AResource.constructInScope(scope, construct)` around one `new`, called by `AResource.unSynth()`
  when a resource is rebuilt from its saved form. The scope comes from what was saved. It is
  synchronous on purpose: state is loaded with many `unSynth` calls in flight at once, and nothing
  can run between setting the field and calling the constructor.

### Limitation: one model action at a time

`constructionScope` is shared by the whole process. **Only one model action may run at a time.** If
two ran together, the second would overwrite the field while the first is still building resources,
and the first's resources would take the wrong scope, and so the wrong `resourceId`. Nothing raises
an error when that happens.

The transaction runs model actions one after another today. Keep it that way or replace the field
before running them in parallel. The same goes for any new code that builds resources inside an
`await`: wrap only the synchronous `new` in `constructInScope`, never an `await`.

### One resource, one identity, one owner

Two resources with the same `resourceId` are an error. An action may return a resource that already
exists only when it is the same object, one it found and changed through the resource's own methods,
such as `S3Storage.addPermission()`. Anything else throws `Resource "…" already exists, and action
"…" created it again!`.

A resource belongs to the module whose action created it. Only that module files it, so only that
module's actions find it in `actionInputs.resources`, and only that module's tags are applied to it.
A resource stays with its creator when another module's action changes and returns it: module B
attaching a load balancer to module A's ECS service leaves the service filed under A, with A's tags.

A module finds its own resources by `localResourceId`, so a module's resources need distinct
`localResourceId`s even when they sit in different scopes. Two with the same one throw `Module "…"
creates two resources named "…"!`.

## The journal

### What it is

The state in `.octo/` records where things ended up. The **journal** records how they got there:
every event each `octo` command emitted, what each terraform and terragrunt process printed, and a
copy of every state file version a command wrote, which the next command would otherwise overwrite.

Two words are used throughout:

- A **command** is one `octo` process, such as one `octo apply`. Its id, the `commandId`, is a UTC
  timestamp to the millisecond and 8 random hex (`20261010T190051184Z-fac00463`), so ids sort in the
  order commands started.
- A **cycle** is one lock: the `generate` and `validate` commands before it, and every command under
  it, until it is released. A cycle has no id of its own. Its lock id names it.

The journal is optional. It exists when `octo.yaml` lists `JournalEventListener`, and the
`create-app` templates list it.

### The files

Each command writes up to three kinds of file, directly in `.octo/`:

```
journal.<commandId>.<command>.json             every event, in order
journal.<commandId>.<command>.terraform.json   what each terraform/terragrunt process printed
journal.<commandId>.<command>.<md5>.json       a copy of a state file the command wrote
```

`<command>` is the CLI command (`generate`, `validate`, `lock`, `apply`, `run-action`, `commit`,
`unlock`), or the mode's name under `runModules`, which runs each mode as a command of its own.
Copies are taken of `models.json`, `resources-actual.json`, `resources-old.json` and every
`resource-state-*.json`, once per command per content.

When the cycle's lock is released, every journal file moves, names unchanged, to
`.octo/archives/<lockId>/`.

### Who does what

The work is split across three packages, and each part stays in its lane:

- **The listener** (`JournalEventListener`, in `@quadnix/octo-event-listeners`) only creates files.
  It holds the command's events in memory and writes them through
  `StateManagementService.saveStates`. It never moves, deletes or uploads a file, and never decides
  which cycle a file belongs to.
- **`StateManagementService`** decides everything else, the same way for every provider: whether a
  new lock may be taken over the journal files present, and moving them into the archive.
- **The CLI** (`OctoUtility.runCommand`, in `@quadnix/octo-build`) announces each command with
  `CommandStartedEvent`, then `CommandFinishedEvent` or `CommandFailedEvent`, and awaits the last
  before the process exits.

Nothing else is remembered between commands. The lock is the cycle, and the journal files present in
`.octo/` are its record.

The listener is registered while octo boots, after `runCommand` has already emitted
`CommandStartedEvent`. It still receives it because `EventService` replays the events it buffered,
up to 50 of each class, to a listener registered late.

### When it is written

The journal is written at three moments, always as one `saveStates` call. It never fails a command:
a failure in the first two is reported on stderr and the command carries on.

1. **With every other state save.** `saveStates` first emits `StateFilesSavingEvent` and awaits its
   listeners, which may push files onto the list. The journal pushes its current files, so they go
   in the same write, and with remote state the same upload. During `apply` this rides on the
   terraform state check-in every `checkInIntervalInSeconds` (10s by default), which keeps a long
   apply's journal current. The listener skips the saves it made itself.
2. **When the command ends**, on `CommandFinishedEvent` or `CommandFailedEvent`, or at the end of
   each mode under `runModules`.
3. **Before the lock is released**, on `AppUnlockingEvent`. This is the one write that fails loudly:
   if it fails, `unlockApp` throws before releasing, the lock stays held, and re-running `commit`
   retries. After this write the listener records and writes nothing more.

`saveStates` also emits `StateFilesSavedEvent` afterward, with each file's md5. The journal reads it
to pick up new state file versions to copy.

A command that runs under a lock writes nothing when no lock is held, because its files would belong
to no cycle. `octo apply` before `octo lock`, or `octo unlock` on an unlocked app, leaves no file.
The commands that run before a lock are listed once, in `JOURNAL_COMMANDS_BEFORE_LOCK`, which the
listener and `StateManagementService` share. A lock that cannot be read counts as held, so a failure
is still recorded.

A process that is killed loses what it recorded since its last save, and terraform's output for the
process that was running, which is recorded only when that process exits. State and terraform state
are unaffected.

### Releasing the lock

`StateManagementService.unlockApp` runs in a fixed order, which `commit` and `unlock` both end with:

1. Emit `AppUnlockingEvent` and await it: the journal's last write.
2. Read the held lock. None held: stop. A different lock held: throw `Invalid lock ID!`, before
   anything moves.
3. Release the lock. With remote state, this seals the cycle's record as last uploaded, journal
   included.
4. Move every `journal.*` file to `archives/<lockId>/`, on disk only. A failure is reported on
   stderr, not thrown: the cycle is already sealed.
5. Emit `AppUnlockedEvent`.

The release must come before the move. While a lock is held, a remote save uploads `.octo/` as it
stands. A move under the open lock would upload a folder with no journal, and the backend would seal
that.

### Taking a new lock

Before taking a new lock, and only then (not when resuming one with `lockId`, not while one is held),
`lockApp` lists the journal files in `.octo/` and reads the command from each name. A file of any
command but `generate`, `validate` or `lock` throws an `AppLockError` with reason `unfinished`,
naming the files: "Move or delete these files, then lock again."

- `generate` and `validate` files are expected. They are written before the lock and belong to the
  cycle it starts.
- `lock` files are allowed because a refused `lock` writes one too, and counting them would let one
  refusal block every lock after it.
- Every other command writes only while a lock is held, so one present with no lock held belongs to
  a cycle whose step 4 failed. Taking a lock over it would archive it under the wrong lock id.

With local state, these files are the journal's only copy. Remote state already holds them, sealed.

### Names holding `/`

The archive move is a `saveStates` call that writes `archives/<lockId>/<name>` and deletes `<name>`.
Every provider writes a name holding `/` into a directory beneath its state directory. To the remote
provider, such a name is the machine's own: it is left out of the size and count checks, never
uploaded, and a save made only of such names makes no request to the backend.

### Remote state

A journal file is always uploaded, and downloaded only when resuming the lock it belongs to:

|                                               | journal files in `.octo/`          | journal files the backend holds                                  |
|-----------------------------------------------|------------------------------------|------------------------------------------------------------------|
| refresh (`generate`)                          | kept                               | not taken: they are the previous cycle's                         |
| resume in the directory the lock was taken in | kept, and uploaded with the record | nothing is downloaded                                            |
| resume a lock that uploaded something         | kept, and uploaded with the record | taken: they are this cycle's                                     |
| resume a lock that uploaded nothing           | kept                               | not taken: the newest sealed state is read as a refresh reads it |

`RemoteStateProvider.unlockApp` uploads nothing before releasing. The record it seals is the one
step 1 of the release last wrote.

Journal files count toward the backend's limits of 200 files and 5 MB a file. Since they ride in the
same save as terraform state, a journal file over a limit fails that save.
