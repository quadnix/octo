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
