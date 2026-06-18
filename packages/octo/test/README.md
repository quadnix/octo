# Octo Tests

## Test Framework

Tests should never hand-roll their own test artifacts (models, overlays, resources, or container
wiring). Instead, use the shared test framework below. This keeps tests consistent and lets the
framework own the boilerplate of registration, serialization, and cleanup.

### Core pieces

- **`TestContainer`** — an isolated `Container` for a single test file. Create it in `beforeAll()`
  and reset it in `afterAll()`. Use it to override factories with mocks, so a test can swap any
  internal service/repository for a fake.

- **`TestModuleContainer`** — the exposed entry point for working with modules, both for tests
  inside Octo and for consumers outside it. It drives the full module lifecycle (commit, generate
  HCL, diff, run) and exposes helpers to fabricate model, overlay, and resource mocks. Most tests
  go through here.

- **`test-helpers`** — the low-level building blocks that build mocks **dynamically**, so a test
  needs no concrete class of its own. `TestModuleContainer` is built on top of these.

  - `test-models`, `test-overlays`, `test-resources` — mint model, anchor, overlay, and resource
    mocks. These are pure shells carrying no behavior.

  - `test-modules` — mint module mocks. Unlike the shells above, a module carries real behavior and
    a typed schema, so these factories stay typed (the module's inputs and outputs keep their types)
    rather than collapsing to `any`.

### Concrete fixtures (the exception)

`test-classes.ts` and `test-modes.ts` hold handwritten concrete classes. Reach for these only when
the dynamic helpers truly cannot express what a test needs. The fixtures in `test-classes.ts`
are all still required; the table below lists every place that depends on a concrete class and why a
dynamic factory cannot serve it.

| Usage file                                         | Fixture(s)                               | Why a dynamic factory cannot serve it                                                                                         |
|----------------------------------------------------|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `decorators/model.decorator.spec.ts`               | `TestModelWithoutUnsynth`                | `@Model` is applied to the class itself, and the test mutates and reads its typed `static` members.                           |
| `decorators/resource.decorator.spec.ts`            | `TestResource`                           | `@Resource` is applied to the class itself, and the test mutates and reads its typed `static` members.                        |
| `decorators/overlay.decorator.spec.ts`             | `TestOverlay`, `TestModelWithoutUnsynth` | `@Overlay` is applied to and mutates `TestOverlay`; the model is the "not an overlay" class for the rejection check.          |
| `decorators/anchor.decorator.spec.ts`              | `TestAnchor`, `TestModelWithoutUnsynth`  | `@Anchor` is applied to and mutates `TestAnchor`; the model is the "not an anchor" class for the rejection check.             |
| `decorators/action.decorator.spec.ts`              | `TestAction`, `TestModelWithoutUnsynth`  | `TestAction` is the class `@Action` decorates and the container resolves; the model is a concrete node to bind the action to. |
| `services/transaction/transaction.service.spec.ts` | `TestOverlay`                            | Must be the same class identity that `createAppOverlayModule`'s `onInit` instantiates and `registerOverlayActions` targets.   |
| `modules/test-module.container.ts`                 | `TestAnchor`                             | `createTestAnchor` needs one stable, shared anchor class across calls, since serialization registers by class name.           |
| `test/models/model.e2e-spec.ts`                    | `TestModelWithoutUnsynth`                | Calls the inherited `static unSynth()` on a model that deliberately does not override it.                                     |

## Test Variable Naming Convention

```
<variable><number1>_<number2>
```

where,

* `variable` is the name of the variable.
* `number1` starting from 0, are the different instances.
* `number2` starting from 0, is the total times this variable has been deserialized.
* If `number1` or `number2` does not exist, they are automatically assumed to be 0.
