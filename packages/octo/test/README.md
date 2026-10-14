# Octo tests

Build fixtures through the shared framework, never by hand:

- **`TestContainer`** — an isolated `Container` per test file. Create it in `beforeAll()`, reset it
  in `afterAll()`, and override factories with mocks through it.
- **`TestModuleContainer`** — drives the real module lifecycle and mints model, overlay, resource
  and anchor mocks. Most tests go through here; consumers outside octo use it too.
- **`test-helpers`** — the dynamic factories `TestModuleContainer` is built on.

`test-classes.ts` and `test-modes.ts` hold handwritten classes, for where a decorator must be applied
to a real class or a test needs one class identity shared across calls. Reach for them only when a
dynamic factory cannot work.
