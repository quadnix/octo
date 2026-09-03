# Octo Architecture

This document records Octo's architecture as it stands, package by package and section by section. It
is written for a reader — human or agent — who has never seen the code, and it should leave them with
the same understanding as someone who has read it. It describes what is, not what is planned.

---

# Part 1 — `packages/octo`

The base package. Its job is to provide a library for declaring *intent* about infrastructure, and the
machinery to act on that intent. It knows nothing about any cloud provider.

## 1.1 The vocabulary

Octo is a graph. Almost every concept in the package is either a node in that graph, a property of a
node, an edge between nodes, or a reaction to the graph changing.

### Nodes

`ANode` is the base class of every node. Three node types exist, named by the `NodeType` enum —
`model`, `overlay`, `resource`.

- **Models** are the units of intent. A model says *what you want*, in plain terms, with no cloud
  vocabulary in it. Twelve exist: Account, App, Deployment, Environment, Execution, Filesystem, Image,
  Pipeline, Region, Server, Service, Subnet. The set is closed and sufficient to describe any
  infrastructure — new intent is expressed by composing these, not by adding to them.

- **Overlays** are a kind of model. `AOverlay` extends `AModel`, and carries its own node type. An
  overlay exists to join together things declared elsewhere: it is how a concern that spans several
  models becomes a single node that can be diffed and acted on.

- **Resources** are the second root under `ANode`. `AResource` extends `ANode` directly, and represents
  a concrete piece of infrastructure. Resources are what intent is compiled into.

The hierarchy:

```
ANode
├── AModel ────── the twelve models
│   └── AOverlay ─ a model that joins other models' anchors
└── AResource ─── concrete infrastructure
```

### Anchors

An anchor is a property a model declares about itself. `AAnchor` stands outside the node hierarchy —
it is something a node carries, not something the graph holds.

An anchor is a model's public face. A model class is an implementation detail of the library that
defines it, and nothing outside that library depends on the class. What a model exposes instead is a
small, named set of properties — an anchor — that other modules match on by *schema* rather than by
type. That indirection is what lets a model change without breaking its consumers, and it is what
overlays join together.

### Dependencies

A `Dependency` is a directed edge between two nodes. It carries two things:

1. An optional **parent/child relationship**. A parent exists before its child and outlives it.
2. A set of **behaviors** — ordering rules of the form *"when this field of `from` is added, the
   matching action on `to` must have run first."*

Those behaviors are what let Octo order a transaction correctly rather than guess at it. Dependencies
are created through `addChild()` and `addRelationship()`; they are rarely constructed by hand.

### Actions

Actions stand outside the graph. They are reactions to it. Octo diffs the graph, and every change it
finds is offered to the registered actions; each action decides by `filter()` whether the change is its
concern, and the ones that accept it `handle()` it.

Two kinds exist, and the node an action is declared for decides which interface it implements:

- An action on a **model or overlay** implements `IModelAction`. Its job is to declare the resources
  that the change calls for. This is the only place intent becomes infrastructure.
- An action on a **resource** implements `IResourceAction`, and performs the change against the cloud
  provider. This kind belongs to external resources — the ones Octo drives itself through a provider
  SDK. A resource whose lifecycle Terraform owns (`ATerraformResource`) has no action, and registering
  one for it throws.

## 1.2 The two graphs

Octo maintains two graphs, and the boundary between them is the shape of the whole system.

- The **model graph** holds models and overlays. It is rooted at App, and is what serialization reads
  and writes.
- The **resource graph** holds resources. Its repository keeps three views side by side — the *actual*
  resources, the *old* ones, and the *new* ones — which is what makes drift and change detectable
  rather than assumed.

Model actions are the bridge between the two. Intent is diffed in the model graph; the resulting
changes are translated into the resource graph; resource changes are then either applied by Octo
itself through an SDK, or handed to Terraform.

## 1.3 The node contract — `functions/node/`

`ANode` is where everything common to a node lives: its identity, its serialized form, its edges, and
the traversals over them. Models and resources extend it and add their own rules on top.

### Identity — the context

Every node has a **context**: a string that uniquely addresses it in the graph. It is held privately,
filled lazily on first read from the abstract `setContext()` each node implements, and cached from
then on. A node that cannot produce one throws `ContextNodeError`.

The context is not an opaque key. It is a comma-separated chain of `key=value` pairs that encodes the
node's ancestry, which is why `hasAncestor()` can answer by parsing two contexts rather than by
walking the graph.

### Serialization

`synth()` writes a node to its serializable form; the static `unSynth()` reads one back, taking the
serialized form together with a `deReferenceContext()` callback that resolves the nodes it points at.
`ANode.unSynth()` throws — every derived class supplies its own. `toJSON()` is `synth()` with the
context prepended.

### Metadata

Four static properties describe a node class rather than an instance:

| | |
|---|---|
| `NODE_NAME` | The category. All nodes sharing a name are of the same kind. |
| `NODE_PACKAGE` | The package that declares it. |
| `NODE_SCHEMA` | The schema it is validated and matched against. |
| `NODE_TYPE` | `model`, `overlay`, or `resource`. |

### Edges

Three methods create dependencies, and they differ in kind:

- **`addChild()`** creates *two* edges — child-to-parent and parent-to-child — and pre-loads the
  lifecycle rule into them as behaviors: a child is added after its parent (on both ADD and UPDATE), a
  parent is deleted after its child. Ordering is therefore declared at the moment the relationship is,
  not computed later.
- **`addRelationship()`** creates a single sibling edge carrying no behaviors, and reuses the existing
  one where a sibling edge to that node is already there. Callers add their behaviors to whichever
  edge comes back, and a behavior already present on it is not added twice, so two callers relating
  the same pair converge on one edge rather than two equivalent ones.
- **`addFieldDependency()`** creates a *self* edge, where `from` and `to` are the same node. It carries
  only ordering behaviors, and exists to sequence one node's own actions against each other.
  `getSiblings()` excludes it explicitly — a node is not its own sibling.

`removeDependency()` drops one edge by index; `removeRelationship()` drops every edge between two
nodes, in both directions.

### Traversal, and the boundary

`getChild()`, `getChildren()`, `getParents()`, and `getSiblings()` read the local edges, keyed by
`NODE_NAME`. Two traversals go wider:

- **`getAncestors()`** returns the nodes self depends on for its existence: its parents, plus any
  sibling whose dependency behavior states that it must be added before self can be.
- **`getBoundaryMembers()`** returns the **boundary** — the sub-graph of nodes that belong together.
  It closes over ancestors, children, and non-parent/non-child dependents until nothing new is
  reached, giving parents, grandparents, children, grandchildren, and siblings.

Two things ride on the boundary beyond traversal. Circular dependencies are detected during its walk,
and throw there. And it is the default search scope for every schema matcher a model exposes — which
is what makes "what can this model see?" a question with a single, structural answer.

### `ANodeAction`

An optional base class for a model or resource action. It is a convenience, not a requirement — an
action need only implement `IModelAction` or `IResourceAction`. What extending it provides is the
`Container`, for resolving services and SDK clients, and a `log()` that emits an `ActionEvent` through
`EventService` so an action's output lands in the run's report rather than on the console.

## 1.4 The model layer — `models/model.abstract.ts`

`AModel` extends `ANode` with the three things that make a node a piece of intent: the anchors it
exposes, how it diffs, and how it finds what other modules have built.

### Anchors on a model

A model holds an `anchors` array containing either anchors it declared itself or `MatchingAnchor`
wrappers borrowed from another model. That is why anchor lookup is keyed by *anchor ID and parent*,
with the parent defaulting to self: the same anchor ID from two different models can sit side by side
on one model. `addAnchor()` rejects a duplicate; `removeAnchor()` on an unattached anchor is a no-op.

### Diffing

`AModel.diff()` describes self and its subtree: the children it holds, its siblings as `sibling`
diffs, self on the field derived by `deriveDependencyField()` (`name` for App, `overlayId` for an
overlay, otherwise the parent relationship's field), and finally whatever `diffProperties()` returns.

The model side is **pure ADD**. `AModel.diff()` accepts no previous version and diffs its children
against an empty set; `AOverlay` behaves the same way, and `OverlayDataRepository.diff()` emits only
ADDs for the overlays a run declared. No model or overlay overrides `diffProperties()`; only
`AResource` does.

So a run's model transaction is the *entire desired graph*, restated from scratch, as additions.
Comparison against what already exists — and therefore UPDATE and DELETE — happens exclusively in the
resource graph. Intent is declared; change is derived downstream of it.

### Matchers

Four methods let a model find things: `getAnchorsMatchingSchema()`, `getModelsMatchingSchema()`,
`getOverlaysMatchingSchema()`, and `getResourcesMatchingSchema()`. They are one pattern applied four
times:

1. Resolve the requested schema through `SchemaTranslationService`, so a consumer written against an
   older version of a schema still matches.
2. Walk the boundary — or self alone, when `searchBoundaryMembers` is false.
3. Validate each candidate's `synth()` against the schema, and apply the property filters.
4. Return `Matching*` wrappers that carry the translator alongside the node, so the consumer keeps
   reading the match through the schema it was written against.

A candidate that fails the schema is **skipped, not reported as an error**. Matching is by shape, and
a shape that does not fit is simply not a match.

`getResourcesMatchingSchema()` differs in scope: rather than searching resources directly, it resolves
each matched model to its owning module through `InputService` and searches that module's resources.
What it returns is another module's output, not every resource in the run.

### `IModelAction`

The shape of a model action: a `filter(diff)` that decides whether a diff is this action's concern,
and a `handle(diff, actionInputs, actionOutputs)` that declares the resources the change calls for.

The interface is generic over the *module*, not the model — `actionInputs` is the module's inputs,
metadata, and the nodes it produced. `actionOutputs` carries the resources declared by earlier actions
in the same transaction, and is returned with this action's own added to it, so a transaction's
resources accumulate across its actions rather than being produced in isolation.

## 1.5 Anchors and overlays — `overlays/`

### The anchor

An anchor is small on purpose: an `anchorId`, a bag of `properties`, and the node that declared it.
It carries no behavior of its own beyond `getParent()` and `synth()`.

**Location and parent.** An anchor carries two independent facts, and holding them apart is what the
rest of the design rests on.

- Its **parent** is whoever declared it, and may be a model or an overlay. An overlay as parent is
  how one overlay comes to depend on another: the second overlay joins the anchor, and `addAnchor()`
  builds its edges to that anchor's parent, which is the first overlay.
- Its **location** is whichever node holds it in `anchors`. An overlay holds every anchor it joins,
  but a model holds it as well — a location is never an overlay alone.

The asymmetry comes from serialization. An anchor is written out only from the model holding it,
while an overlay stores no more than a reference — its parent's context and the `anchorId` — to be
resolved on the way back in. An anchor no model holds is never written, and its reference then
resolves to nothing. Both ends refuse that rather than let it through: `serialize()` checks every
anchor an overlay joins against the anchors it harvested from models, and deserialization throws on a
reference it cannot resolve.

An overlay anchoring to itself is rejected.

The `anchorId` is unique **within its parent**, not globally, which is why every lookup is keyed by
both. `synth()` writes the parent as a context reference plus its node type. `unSynth()` looks for the
anchor already present on the rehydrated parent and overwrites its properties in place, constructing a
new one only when none is found; an anchor's identity therefore survives a serialize/deserialize round
trip rather than being duplicated.

`@Anchor(packageName)` stamps `NODE_PACKAGE` onto the class and registers it with
`ModelSerializationService` under `package/ClassName`, which is how a stored anchor finds its class
again.

An anchor schema narrows `properties` to the fields the anchor exposes. That shape is the contract
other modules match on, so changing it is a breaking change.

### The overlay

`AOverlay` is constructed from an `overlayId`, its own `properties`, and the anchors it joins. It
inherits everything in `AModel`, and diverges in four overrides.

**`addAnchor()`** is where joining an anchor becomes a graph edge. Beyond attaching the anchor, it
creates a **pair of sibling edges** between the overlay and the anchor's parent — through
`addRelationship()`, not through `addChild()` — and loads them with behaviors: the overlay is added
after the model (on ADD and UPDATE), and the model is deleted after the overlay. An overlay is
therefore never a child of what it joins; it is a peer, ordered behind it in the lifecycle.
`removeAnchor()` reverses this, dropping both edges as well as detaching the anchor.

**`diff()`** does not perform `AModel`'s children-and-siblings walk. It emits one `ADD anchor` diff per
joined anchor, plus properties. The `ADD overlayId` diff for the overlay itself comes from the
repository rather than from the overlay.

**`setContext()`** is flat — `package/name=overlayId`. A model composes its context from its parent's,
so a model's address carries its ancestry; an overlay's stands alone, because `overlayId` is unique
across the infrastructure. An overlay is addressable without reference to where it sits.

**`getAnchor()` and `getAnchorIndex()`** make `parent` required rather than defaulting to self, since
an overlay's anchors are always declared elsewhere.

`unSynth()` resolves each stored anchor through its parent's context and throws when the parent does
not already carry it. Overlays can only be rehydrated after the models they join, which fixes the
order of model deserialization.

### `OverlayDataRepository`

A single list holding the overlays of the current run — where `ResourceDataRepository` keeps three
lists side by side. That difference follows from the model side being pure-ADD: there is no previous
overlay graph to compare against.

`add()` rejects anything that is not an overlay, and rejects an overlay whose context is already
present. Beyond that the repository offers lookup by context and by property filters, and the `diff()`
that contributes each overlay's diffs plus its `ADD overlayId` to the transaction.

Overlays enter the run in one place: `ModuleContainer` inspects what a module's `onInit()` returned,
and routes an overlay here as well as registering it against the module's ID in `InputService`, while
a plain model goes only to `InputService`. On model deserialization the list is replaced wholesale
through the factory's `forceNew`.

## 1.6 Resources — `resources/`

Where a model says what you want, a resource says what exists. Resources are never constructed
directly; a model action declares them, and Octo diffs the declared graph against the last committed
one to decide what to create, change, or destroy.

`AResource` extends `ANode` directly rather than `AModel`, so none of the model layer reaches it —
there are no anchors on a resource, and no schema matchers. It is a far larger class than `AModel`,
because a resource is the node that has to survive a round trip to a cloud provider.

### Identity and state

A resource holds four things: `parents`, the resources it is built on top of, held either raw or as
`MatchingResource` wrappers; `properties`, the configuration asked for; `response`, what the provider
reported back, empty until the thing exists; and `tags`. A private delete marker sits alongside them.

The constructor takes `resourceId`, `properties`, and `parents`. It validates the ID against
`/^[\w-/]+$/` and throws `ResourceError` on anything else, then adds itself as a child of every parent.
Parentage is fixed at construction.

`setContext()` returns `package/name=resourceId`. Like an overlay and unlike a model, a resource's
address carries no ancestry, because `resourceId` is unique across the infrastructure.

### A graph of parents and children, and nothing else

Four inherited methods are refused outright, each throwing `ResourceError`: `addFieldDependency()`,
`addRelationship()`, `getBoundaryMembers()`, and `getSiblings()`. A resource graph has exactly one
kind of edge — parent to child — and no notion of a boundary.

`addChild()` extends the base with two additions. It registers a behavior ordering the child's
`ADD 'parent'` behind the parent's own ADD; the base only orders the child's `resourceId` ADD, which
covers a child created alongside its parent but not one that already exists and is gaining a parent,
where an `ADD 'parent'` is the only diff there is. It then records the parent in the child's `parents`
list. `MatchingResource.addChild()` wraps this and replaces the raw entry with the wrapper, so the
child keeps reading its parent through the schema it matched on.

### Serialization

`synth()` writes each parent as a context reference. Where the parent was a `MatchingResource`, it
also writes `parentSchemaTranslator` — the translator function's **source text**, falling back to the
source of an identity function when the wrapper carries none. Properties, response, and tags are
deep-copied through JSON.

`unSynth()` de-references every parent context and rebuilds each wrapper by evaluating that stored
source back into a function. It follows that a resource cannot be deserialized before its parents,
which is a constraint the repository has to honour whenever it carries resources between graphs.

`AResource.cloneResource()` is `unSynth(synth())`: a deep copy taken through the serialization path,
so a clone is exactly what a reload would have produced.

### Diffing

`diff(previous)` is where Octo compares a node against its previous version — the resource graph is
the only place that happens. It runs in three parts:

- `diffProperties(previous)` delegates to `DiffUtility.diffObject` over `properties`.
- `diffTags(previous)` computes what was added, deleted, and changed, and emits **one** `UPDATE 'tags'`
  diff carrying all three sets, or nothing at all when they are empty.
- Parent comparison emits `DELETE 'parent'` for a parent that went, `ADD 'parent'` for one that
  arrived, and `UPDATE 'parent'` for one present in both but not deep-equal. That last comparison is
  of the parent's whole object, tags excluded, rather than of its `diffProperties()`: a parent that
  excludes a field its child renders would otherwise produce no diff anywhere, while terraform plans
  a change on the child that `validate` then reports as drift.

`diffUnpack(diff)` splits one diff into the diffs an action will actually receive, for a change that
has to be applied as several ordered steps. The default returns the diff unchanged, and the repository
passes every diff it emits through it — whole-resource adds and deletes included.

`DiffAction` carries five members: `ADD`, `DELETE`, `UPDATE`, `REPLACE`, and `VALIDATE`. The base class
never produces `REPLACE`; a resource raises it from its own `diffProperties()`, with a reason, to say
that a field changed which cannot be changed in place.

### `diffInverse` — carrying the actual graph forward

`diffInverse()` does not compute a diff. It applies one, to the *actual* graph, after the action for
that diff has succeeded. The transaction runs the resource action, finds the matching actual resource,
and calls it; where no actual resource exists yet, it clones one from the diff's node instead.

It dispatches on the diff's field. A `VALIDATE` returns at once. A `DELETE` of `resourceId` removes the
resource by force. `ADD` or `DELETE` of `parent` clones the whole resource in place, copying every
parent in one shot — a resource needing per-parent handling overrides the method — while an `UPDATE` of
`parent` is deliberately nothing, the change having been the parent's rather than this resource's. A
`properties` change writes or deletes the one key and then refreshes `response`, since the provider's
answer may have moved with it. A `tags` change applies the compound value. Anything else throws
`DiffInverseResourceError`.

Underneath it sits the clone family. `cloneResourceInPlace()` drops self's parent relationships and
empties `parents`, rebuilds each parent from the source — re-establishing the edge and copying the
behaviors from both directions of the source's dependency — then replaces properties, response, and
tags. `clonePropertiesInPlace()`, `cloneResponseInPlace()`, and `cloneTagsInPlace()` each clear the
target's keys before copying, so a key absent from the source does not survive the copy.

### `merge` — one resource, several intents

Two modules may declare the same resource. When a model action returns a resource whose context is
already in the new graph, the transaction merges rather than adds.

The merge writes the newly declared values into the already-registered instance: properties, response,
and tags are deep-merged with the newcomer winning, and arrays union by value rather than
concatenating. Dependencies the newcomer has that the incumbent lacks are re-pointed at the incumbent.
The newcomer is then made a view of the incumbent, and the incumbent is what the graph keeps. The
surviving object is the one that was already there; the surviving data is the newcomer's.

### Deletion and equality

`remove(force)` refuses while the resource still has children, throwing `RemoveResourceError` naming
them, unless forced. It then removes the edges pointing back at this resource from each neighbour and
sets the delete marker, which `isMarkedDeleted()` reports. The resource stays in the graph until the
transaction ends.

`isDeepEquals(other)` compares three things: the two `synth()` outputs, the two delete markers, and
every parent dependency in both directions. It is what decides whether a resource has gone dirty.

### The two kinds of resource

A resource's lifecycle belongs either to terraform or to Octo, and which one decides the rest of its
shape.

`ATerraformResource` adds `toHCL(terraform)`, which contributes terraform blocks and outputs into the
module folder the resource belongs to. It overrides `diffInverse()` to skip the field-by-field
dispatch: barring a `resourceId` delete, it clones the whole resource, because terraform applied the
whole thing at once. It cannot carry a resource action, and registering one for it throws.

An **external** resource is one Octo drives itself through a provider SDK. It keeps the base
`diffInverse()` and carries an `IResourceAction`: `filter(diff)` to claim a diff, `handle(diff)` to
perform the change and return what the provider reported, and `actionTimeoutInMs`, defaulting to
90000. The timeout exists because this is the one method in the package that reaches the network.

An external resource still appears in terraform, as a `null_resource` whose `local-exec` provisioner
calls `octo run-action --resourceId=…`. Its `triggers` carry `octo_properties_hash`, a hash of
`getExternalTriggerProperties()` — every property by default. That is how terraform decides to call
back, and it is why a resource whose `diffProperties()` ignores a property must exclude it here too:
otherwise terraform plans a replacement that Octo reports no change for.

### `ResourceDataRepository`

Three graphs are held side by side — **actual**, **old**, and **new** — and a fourth set is derived
from them at construction: **dirty**, being every old resource that is not deep-equal to its actual
counterpart, plus every actual resource missing from old. A dirty resource is one the world moved
underneath since the last commit.

Three comparisons run over those graphs:

| | compares | answers |
|---|---|---|
| `diff()` | old → new | what the change in intent asks for |
| `diffDirty()` | actual → new | what the live world needs |
| `diffValidate()` | — | one `VALIDATE` diff per actual resource |

`diff()` and `diffDirty()` are one algorithm over different left-hand sides: drop everything marked
deleted from both sides, emit `DELETE resourceId` for what is gone, `diff(previous)` for what is in
both, `ADD resourceId` for what is new, and pass every result through `diffUnpack()`.

Around them sit the graph's write operations. `addNewResource()` rejects a non-resource and a
duplicate, and copies the response across from the old graph, so a re-declared resource keeps what the
provider already reported. `addActualResource()` rejects duplicates. `removeNewResource()` marks the
resource deleted before dropping it. `ensureDiffsNotOperatingOnDirtyResources()` throws when a diff's
node has a dirty ancestor.

`syncActualToNew()` is what commit calls once terraform has applied the desired state: the actual graph
becomes the new graph, and nothing is left dirty. Two sets qualify it. `excludeResourceContexts` names
resources a partial commit could not confirm, which are left out of the actual graph so the next run
plans them again — terraform reconciles that as a no-op if they do exist. `retainResourceContexts`
names deletions that did not run; each is carried into both graphs, so the actual graph records it as
present and the next run plans its deletion again. The rule behind both is that recording less than
reality is recoverable, and recording more is not. `collectWithParents()` closes a retained set over
its parents, because a resource cannot be deserialized without them.

## 1.7 Modules — `modules/`

A module is the unit infrastructure is assembled from. It takes typed inputs and produces models,
overlays, and anchors; everything it needs from another module it finds by schema, so modules compose
without importing each other's classes.

### `AModule`

Three members carry the contract. `onInit(inputs)` is abstract and is the work — construct models,
attach anchors, create overlays, and return them all, overlays included, because they are what later
modules resolve against. `registerMetadata(inputs)` derives values that both `onInit` and this
module's actions need, and what it returns reaches every action of the module as
`actionInputs.metadata`. `registerHooks()` returns callbacks for six lifecycle points.

Two statics describe the class — `MODULE_PACKAGE` and `MODULE_SCHEMA`, both stamped by the `@Module`
decorator — and one instance field, `moduleId`, scopes everything the module produces. The same class
can be loaded more than once under different IDs.

### The registry has two levels

`ModuleContainer` holds module *classes*, and each class holds the *instances* it was loaded as:

```
modules[] = { hidden, module, properties, instances: [{ applied, inputKeys, moduleId }] }
```

`register()` is called by `@Module` at import time and files the class as hidden. Importing a module
makes it known, not active.

`load(module, moduleId, inputs)` throws when the class was never registered, clears the hidden flag,
and appends an instance record keyed by `moduleId`, deduplicated. The instance's input keys come from
the schema, and each input value is deep-copied into `InputService` under `<moduleId>.input.<key>`.

`unload()` sets the hidden flag and leaves the instance records in place. `reset()` hides every class
and empties every instance list.

`order()` sorts the registry by each class's position in the list it is given. A registered class the
list omits sorts ahead of every class the list names.

### `apply()`

Composition is this one method, and it takes two paths.

A **hidden** class is instantiated with an empty module ID, has its hooks registered, and is then
skipped. A hidden module still contributes its hooks while never running — which is what the hidden
flag is for.

A **loaded** instance that has not already been applied goes through, in order:

1. Each input key is resolved through the input service.
2. The resolved inputs are turned into a schema instance, which both validates them and fills in
   defaults for the optional properties.
3. Every entry of that resolved schema is registered back into the input service, so the filled
   defaults are visible to everything downstream.
4. The module is constructed with its ID.
5. Its hooks are registered — before metadata and before `onInit`, so a module's hooks are live for
   its own actions.
6. `registerMetadata()` runs, and each key it returns is filed as metadata.
7. `onInit()` runs, and its result is normalized to a list.
8. Each output is routed by kind. An overlay goes to the overlay data repository *and* the input
   service; a model goes to the input service alone.
9. The module instance itself is registered, and the instance is marked applied.

That applied flag makes composition idempotent per instance: composing a second time re-runs nothing.

### Hooks

Three singletons — a commit hook, a model action hook, and a resource action hook. Each collects pre
and post callbacks into a map keyed by the **action class name**.

They install themselves by wrapping. A hook's `registrar()` replaces the target's `handle` with a
function that runs the pre-callbacks, then the original, then the post-callbacks, emitting an event
around each. The wrapping happens at two points: `@Action` registers a newly declared action with the
model or resource hook as it goes into the container, and `@EnableHook('CommitHook')` decorates the
commit path directly.

The collected hooks are global and keyed by action name. Nothing scopes them to the module that
supplied them, and unloading a module does not withdraw them.

### `TestModuleContainer`

The harness for testing a module. It seeds fixtures, but it is not a simulation: it owns a real
`Octo` and drives the real lifecycle, and at its highest setting it creates real infrastructure.

**Seeding.** A universal test module with a no-op `onInit`, plus a universal model action and resource
action that accept every diff and do nothing, stand in for whatever a fixture would otherwise need.
Every seeding method — for models, overlays, resources, and anchors — loads the universal module under
the caller's module ID and then immediately unloads it. The ID then exists for attribution in the
input service while the module itself never runs, which is what the instance records surviving an
unload makes possible. Seeded nodes are given a no-op action so they appear in a transaction without
doing work, with the action renamed after the node so a snapshot reads clearly. Terraform-owned
resources are skipped, having no actions of their own.

**Isolation.** Initialization refuses any state provider other than the local, local-encrypted, and
test ones, so a test can never write shared state.

**Running.** `runModules()` yields once, and its `terraformTarget` decides what the test costs:

| | does | cost |
|---|---|---|
| `skip` | composes and commits in memory | a unit test |
| `plan` | generates the module folders, plans, validates | terraform, no cloud change |
| `apply` | generates, plans, applies, commits | **real infrastructure** |

Production runs generate, validate, and commit as three separate processes, each deriving the resource
graph from intent itself. The harness is one process, so it derives the model transaction once and
hands the same result to all three. Responses are collected again after the commit, because it is
commit that maps terraform outputs onto the actual resource graph.

**Assertion surface.** `digestDiffs()` reduces a transaction to one line per diff — `+` create, `-`
delete, `^` replace, `*` update — classified exactly as validate aggregates, so a digest and a report
of the same transaction cannot disagree. `mapTransactionActions()` gives the action names that ran, by
level. `isResourceStateEqual()` compares the actual and old resource state to check the run settled
without leaving a pending change. A retained render of the previous run is what makes the reported HCL
diff a diff against committed state.

## 1.8 Terraform generation — `services/terraform/`

`TerraformService` collects what every resource emitted, wires the references between module
folders, and prints the terragrunt files that `generate` writes to disk. One folder is produced per
octo **module**, and one octo resource becomes as many terraform blocks as it needs.

Rendering happens in two phases, and that split is what the rest of the class is organized around.
Phase one resolves every deferred reference and may throw; phase two prints, and makes no decisions.

### What it holds

| | |
|---|---|
| `modules` | One `TerraformModule` per folder: its resources, data sources, variables, provider keys, and two flags for whether it has external resources and whether it named a local file. |
| `resourceRegistry` | Every resource, flat, keyed by resource ID. A reference resolves through this, which is how it can cross a folder boundary without its author knowing. |
| `providers`, `requiredProviders` | Registered once per process. |
| `sanitizedResourceIds` | The collision guard. |
| `pendingExternalResourcesInputWiring` | The deferral queue for external resources. |

Two resets exist because those lifetimes differ. `reset()` drops everything, providers and config
included. `resetTransactionState()` drops only what a sweep contributed. A real process runs one
transaction and never resets; a test harness running several in one process resets between them.

### The authoring surface

`scope(moduleId)` returns the `TerraformModuleScope` handed to a resource's `toHCL()`, bound to one
folder. Driving it is the transaction service's sweep, which takes every non-deleted resource in the
new graph, looks up the module that produced it — a resource with no module attribution is a hard
error — and calls either `toHCL()` or, for an external resource, the external wrapper. It always
sweeps the full desired state; terraform works out creates, updates, and deletes against its own.

An author's plain object is expanded into HCL by one heuristic: an HCL expression becomes an
attribute, a plain object becomes a *block*, an array of plain objects becomes repeated blocks, and
anything else becomes an attribute. `mapAttr()` exists to override it, for where a provider's schema
wants a map attribute and the heuristic would emit a block.

### Registering a resource

Registration does four things beyond bookkeeping.

It **guards against collisions** by sanitizing the resource ID as an environment variable and
refusing a second resource that lands on the same string. That sanitization merges strictly more
characters than the identifier form, so one check covers output names, identifiers, and variable
names together.

It **binds a provider**, when one was given, resolving the alias and recording the provider key on
the folder — so a folder declares only the providers its own resources use.

It **reads the response defaults** off the resource's schema. These seed terragrunt's mock outputs
later, and they are the *declared* defaults rather than the live response, so regenerating after a
commit cannot inline real applied values.

It then files the resource into both the folder and the flat registry.

Each block emitted on the returned scope chains onto the previous one with `depends_on`. Outputs are
declared per response key and published as `<resourceId>-<key>`; every response key must be declared,
because commit reads exactly these outputs back to reconstruct a resource's response.

### External resources

An external resource is wrapped rather than described: a `null_resource` shell, and a
`data "external"` block that runs `octo get-response` and depends on it. Its response shape is
unknown at generation time — the action has not run — and the `data "external"` contract guarantees a
flat map of strings, so it is never enumerated per key. It publishes one whole-result output, and a
reference into it resolves by indexing that single expression.

Its triggers and its create and destroy commands need every parent's outputs, which only all exist
once registration finishes, so they are queued and resolved at the head of phase one. That deferral
is what lets the sweep contribute resources in any order rather than parents first.

When the wiring runs, each native parent contributes one input per output key and each external
parent its whole result as one input. The triggers carry a hash of the resource's external trigger
properties, plus one trigger per input. The create command interpolates the references directly; the
destroy command reads the triggers instead, because at destroy time the resources referenced may
already be gone.

### Three kinds of dependency

| kind | declared by | renders as |
|---|---|---|
| value reference | `getRef(resource, key)` | an inline expression, or `var.*` across folders |
| explicit parent | the resource's registration options | `depends_on` in-folder, a terragrunt dependency across |
| intra-resource | successive blocks on one resource | `depends_on` on the following block |

`getRef` returns a node carrying only a resource ID and a key. It does not know where the producer
lives; that is filled in at render time.

The distinction between the first two reaches beyond rendering. The referrer graph is built from
value references alone, because that is the graph terraform cascades replacement along — an ordering
edge carries no value and forces no replacement. Validate reads it to attribute terraform's
transitive recreations as expected rather than as unexplained drift. External resources are added to
that graph explicitly, since their triggers embed each parent's values.

### Phase one — wiring

For each folder, every reference made from it is collected and resolved. A producer in the same
folder resolves to its output expression, inlined. A producer in another folder resolves to a
variable name, with three recorded consequences: declare the variable, depend on the producer's
folder, and wire the input in terragrunt.

Variable naming differs by producer. A native producer yields `<resourceId>_<key>` and an untyped
variable. An external producer yields one variable carrying its entire response object, which must be
typed as a string map — untyped, terraform coerces the object to a JSON string and key access fails
at plan. The set of keys actually consumed is recorded, so terragrunt can shape the mock as an object.

Explicit parents resolve the same way, to `depends_on` addresses in-folder or to a folder dependency
across. A depth-first search then throws on the first cross-folder cycle, naming its path and the
references or parents forming each edge.

Every failure lives here: an unknown producer, an undeclared reference key, one variable name mapping
to two outputs, a cycle. Phase two cannot fail.

### Phase two — rendering

Four files per folder, each a lookup rather than a decision.

`main.tf` carries the config block — scoped to the providers this folder uses, plus the null and
external providers when it has external resources — then provider blocks, data sources, and each
resource's blocks with their merged `depends_on`. `variables.tf` carries the project-root variable if
needed, the auto variables, then user variables. `outputs.tf` carries every declared output.

`terragrunt.hcl` carries three sections. A `remote_state` block pins the local backend to a fixed
path inside the module folder: terragrunt copies each module into a per-invocation cache directory,
so without it the state would land in a throwaway copy and a later `output` could not read what an
earlier `apply` wrote. Then a `dependency` block per producer folder, with mock outputs so a
plan-everything run works before the first apply, merged shallowly over any applied state. Then an
`inputs` map wiring each auto variable to its producer's output.

A module removed from intent is not deleted. `renderEmptyModule()` rebuilds an emptied folder from a
recorded one — the config block and the provider blocks, nothing else — so the next apply destroys
the infrastructure rather than orphaning it.

### Providers

Config registration sets the minimum terraform version and the `required_providers` sources. Provider
registration refuses a type that config does not name, then builds an alias from the account and
region, prefixing an underscore when it would otherwise start with a digit. An account may be given a
name to use in place of its ID — the generated terraform is committed, so a name is also how a
repository keeps an account number out of itself. Two accounts colliding on one name is an error.

A `region` argument is written unless the provider is one of the utility providers that accept no
arguments at all, and would fail the plan outright.

Resolution runs the other way at use: a resource names an account and a region, never a provider
type. Without a region, any provider of that account matches and the first wins. With a region, more
than one provider *type* matching is an error, which asks for each type to be given its own account
ID rather than threading a provider type through every resource.

### Marking a value sensitive

Terraform refuses to plan a root output that carries a sensitive value without the flag, so declaring
an output takes an optional list of sensitive keys, and each marked output renders `sensitive = true`.
An author-declared variable takes the same flag.

The marking reaches exactly that far. The auto variable generated for a cross-folder reference is
declared without it, and an external resource's whole-response output is always unmarked. Mock
outputs cannot carry a real value at all, being seeded from schema defaults.

Terraform's plan output carries its own sensitivity marks, which validate reads to print `(sensitive)`
in place of a value in a report. That is redaction of what a report shows, and is unrelated to what is
generated.

### What the rest of Octo reads back

`getOctoTerraformResourceMappings()` gives, per resource, its folder, its terraform addresses, and
either its per-key outputs or its single whole-response output. Validate matches plan entries back to
resources through it; commit maps outputs onto responses. `getResourceReferrers()` gives the
value-reference graph. `getFolderRecords()` gives one entry per folder that has resources, carrying
the rendered provider blocks verbatim, which is what a later run rebuilds an emptied folder from.
