# aws-ecs-server

## Tests

| File                | Covers                                                                                                         | Cost    |
|---------------------|----------------------------------------------------------------------------------------------------------------|---------|
| `main.e2e-spec.ts`  | Full stack: applies everything (NAT gateway + ALB), asserts HTTP 200, 22 `input changes` plan cases, teardown. | ~25 min |
| `drift.e2e-spec.ts` | Infrastructure changed outside octo, intent untouched. Region + subnets, NAT off.                              | ~3 min  |

Both create real AWS resources. They need `.env` (see `.env.defaults`) and credentials for that
account. Build octo first — this package imports `@quadnix/octo` from **dist**.

```bash
npx nx run-many -t build --projects=octo
cd packages/octo-templates

NODE_OPTIONS=--experimental-vm-modules npx jest --testRegex "drift\.e2e-spec\.ts$"
NODE_OPTIONS=--experimental-vm-modules npx jest --testRegex "aws-ecs-server/main\.e2e-spec\.ts$" --runInBand
```

**Do not use `pnpm test:e2e`.** It matches all four template e2e specs and builds three unrelated
stacks at once.

`main.e2e-spec.ts` is one sequence sharing a single state provider: the first test applies the stack,
the 22 `input changes` tests plan against it, the last tears it down. Filtering with `-t` plans
against an empty stack and records meaningless snapshots. Run the whole file — and if the applied test
fails, discard the run rather than the snapshots it wrote, because the plan tests still "pass"
against empty state. Abort the run, and the stack stays applied; re-run the teardown test, or use
`incremental.e2e-harness.ts`'s teardown phase.

## Debugging harnesses

`*.e2e-harness.ts` files are debugging tools, not tests. They match no test script — `test` is
`\.spec.ts$`, `test:e2e` is `\.e2e-spec.ts$` — because they create real AWS infrastructure and are
meant to be run by hand. Keep the suffix if you add one.

They exist because `main.e2e-spec.ts` takes ~20 min per iteration, dominated by NAT gateway and ALB
create/delete, which is unusable when bisecting a bug. Each harness strips a different part of that
cost.

Same prerequisites as the tests above, and every command below runs from `packages/octo-templates`.

### `diff-probe` — octo's raw diffs, no terraform, no AWS (~10 s)

Drives `Octo` directly and stops after `generate()`. Prints `action / field / resource`, which the
digest does not show. Use it to tell whether octo's diff or the terraform correlation is at fault.

```bash
OCTO_PROBE_STATE=/tmp/probe-state \
  NODE_OPTIONS=--experimental-vm-modules npx jest --testRegex "diff-probe\.e2e-harness\.ts$"
```

`OCTO_PROBE_STATE` is required: point it at a state dir written by `incremental`
(`.octo-incremental/<work>/state`) for a real baseline, or an empty dir to see everything as add.
Cases are the hardcoded `PROBES` array.

### `incremental` — a subset of the stack, state on disk

Applies a cumulative slice of the module graph with `LocalStateProvider`, so apply, inspect, and
teardown are separate processes, and you can poke at live resources in between.

```bash
OCTO_STAGE=subnets OCTO_PHASE=apply OCTO_WORK=drift \
  NODE_OPTIONS=--experimental-vm-modules npx jest --testRegex "incremental\.e2e-harness\.ts$"

aws ec2 disassociate-route-table --association-id rtbassoc-...    # break something by hand

OCTO_STAGE=subnets OCTO_TARGET=plan OCTO_WORK=drift ...           # report now shows DRIFT
OCTO_STAGE=subnets OCTO_PHASE=teardown OCTO_WORK=drift ...        # clean up
```

| Var           | Default  | Meaning                                                                                               |
|---------------|----------|-------------------------------------------------------------------------------------------------------|
| `OCTO_STAGE`  | `region` | `region` → `subnets` → `server` → `execution` → `alb` (or `full`). Each is a superset of the last.    |
| `OCTO_PHASE`  | `apply`  | `apply`, or `teardown` (keeps only `app-module` + `account-module`, which own no cloud resources).    |
| `OCTO_NAT`    | off      | `on` re-enables the NAT gateway, at ~2 min up and ~2 min down. Leave off unless you need real egress. |
| `OCTO_TARGET` | `apply`  | `plan` re-plans an applied stack without changing it — this is how you get a validate report.         |
| `OCTO_WORK`   | `hunt`   | Work dir under `.octo-incremental/`. Stages share it so the stack grows; set it to isolate a stage.   |

Timings with NAT off: region 23 s, subnets 98 s, server 59 s, execution ~60 s, alb ~90 s. It prints
the resource diffs, the responses, and the validated report as JSON. The stack is left applied on
purpose — run the `teardown` phase when done.

### `plan-cases` — replay the 22 input-change cases (plan only, creates nothing)

Runs `main.e2e-spec.ts`'s `input changes` cases against an already-applied stack, in source order in
one process, so their sequential contamination matches the real spec. This is the instrument for
"how many are failing, and did my fix help?"

```bash
OCTO_WORK=hunt \
  NODE_OPTIONS=--experimental-vm-modules npx jest --testRegex "plan-cases\.e2e-harness\.ts$"

OCTO_CASE="AwsEcsExecutionModule/executionId" ...   # one case only
```

Requires the `alb` stage of `incremental` applied into the same `OCTO_WORK` dir. Its `CASES` array is
copied from `main.e2e-spec.ts` and nothing keeps the two in sync — if they disagree, the spec is
right.
