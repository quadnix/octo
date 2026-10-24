# Octo

Infrastructure as code written as intent: you describe an app and what it needs, modules turn that
into Terraform, and your own Terragrunt applies it. Users start at
[octo.quadnix.com](https://octo.quadnix.com/).

> Octo is in `0.x`. Version `1.x` will mark it ready for production.

**This README is a set of procedures for working on the repository.** `docs/ARCHITECTURE.md`
explains what exists, and `docs/CODING-STANDARDS.md` how to add to it.

Requires Node 20 or newer, Terraform or OpenTofu 1.6 or newer, and Terragrunt 0.78 or newer. The
integration suites also need Docker, and the e2e suites AWS credentials.

---

## A — Set up this machine

Once.

```sh
corepack enable
pnpm install
pnpm run prepare
```

`prepare` installs the pre-commit hook, which runs the format check, lint, the build with its type
check, the circular-dependency check, the secrets spec and the docs code-block check.

## B — Build, lint and test

```sh
pnpm run build
pnpm run lint
pnpm test
```

`octo-aws-cdk`, `octo-event-listeners`, `octo-build` and `octo-templates` import `octo` from its
`dist`, and `octo-templates` imports `octo-aws-cdk` the same way. **Rebuild what you changed before
testing what depends on it**, or the suite runs against the old code and still passes.

`pnpm run build` also type-checks every package, tests included, through each package's
`check:types`.

`pnpm run format` writes what `pnpm run format:check` checks. Lint does not check formatting.

`pnpm run lint:fix` sorts imports, members and keys. A flag passed through `pnpm run` is written
without `--`: pnpm forwards the separator, and the script then drops the flag.

## C — Run integration tests

Integration specs run real Terraform; `octo-templates`' start LocalStack in Docker.

```sh
pnpm run test:integration
```

## D — Run an e2e suite

**Every e2e suite reaches a live AWS account.** `octo-aws-cdk`'s plan and apply nothing;
`octo-templates`' create real resources and tear them down.

1. Copy the `.env.defaults` beside the suite to `.env` and fill in real values. `.env` is ignored.
2. Build the packages the suite imports:

   ```sh
   npx nx run-many -t build --projects=octo,octo-event-listeners,octo-aws-cdk
   ```

3. Run one spec, by path, from its package:

   ```sh
   cd packages/octo-templates
   NODE_OPTIONS=--experimental-vm-modules npx jest --runTestsByPath src/<template>/main.e2e-spec.ts
   ```

Never `pnpm run test:e2e` — it runs every suite live at once. Never combine `-u` with `-t`: jest then
deletes the snapshots of every test it skipped. A template's own `README.md`, where it has one,
holds what is particular to it.

## E — Work in a worktree

For a large change or a hands-free agent run:

```sh
git worktree add ../ai-worktrees/octo-worktree-<branch> -b ai/<branch>
WORKTREE=../ai-worktrees/octo-worktree-<branch>
find . -maxdepth 4 -name node_modules -type d ! -path "*/node_modules/*/node_modules" | \
  while read src; do
    mkdir -p "$WORKTREE/$(dirname $src)"
    ln -s "$(pwd)/$src" "$WORKTREE/$src"
  done
```

The symlinks let Nx and Jest resolve packages. Run lint and tests from inside the worktree.

## F — Release

1. Merge to `main` with PR titles per `.github/jobs/validate-pr-title.job.sh`. The commit type sets
   the bump: `chore` releases nothing.
2. Run the **Manual Release** workflow on `main`. It versions every changed package, tags, writes
   the changelog, and publishes to npm.

## Environment variables

Everything outside the code that governs how this repository behaves. A suite's `.env` is read
through `env-smart`, falling back to the `.env.defaults` beside it.

| Variable                                                                                            | Set by                                        | What it does                                                                                                                                                                                                        |
|-----------------------------------------------------------------------------------------------------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `AWS_ACCOUNT_ID`                                                                                    | a suite's `.env`                              | The account every e2e suite plans or applies into.                                                                                                                                                                  |
| `AWS_REGION_ID`                                                                                     | `packages/octo-aws-cdk/test/.env`             | The region the module e2es plan into. Template suites hardcode `us-east-1`.                                                                                                                                         |
| `OCTO_DEFINITION_FILE_PATH`                                                                         | the user, or a `create-app` project's scripts | The `octo.yaml` every lifecycle command boots from. `OctoCliUtility` sets it for the CLI-driven template suites. A relative path is resolved once against the working directory, so `run-action` callbacks find it. |
| `OCTO_JOURNAL_COMMAND_ID`                                                                           | `JournalEventListener`                        | The running command's id, set for every process it starts, so a `run-action` that Terraform starts mid-apply names that apply as `parentCommandId` in its journal.                                                  |
| `TF_VAR_OCTO_PROJECT_ROOT`                                                                          | `TerraformUtility`, unless already set        | The working directory, so `terraform.localPath()` paths resolve inside Terragrunt's cache copy of a folder.                                                                                                         |
| `TG_LOG_CUSTOM_FORMAT`                                                                              | `TerraformUtility`, always                    | Terragrunt's log line layout, its default without the time, since the journal records when each line arrived.                                                                                                       |
| `TG_LOG_FORMAT`                                                                                     | `TerraformUtility`, always unset              | Unset for every Terragrunt process, so it cannot override `TG_LOG_CUSTOM_FORMAT`.                                                                                                                                   |
| `TG_PROVIDER_CACHE`                                                                                 | `TerraformUtility`, unless already set        | `1`, so Terragrunt shares one provider cache across folders.                                                                                                                                                        |
| `TG_TF_PATH`                                                                                        | `TerraformUtility`, from `--terraformBinary`  | Which Terraform or OpenTofu binary Terragrunt runs.                                                                                                                                                                 |
| `NODE_OPTIONS`                                                                                      | every package's test scripts                  | `--experimental-vm-modules`, which Jest needs to run ESM. Set it yourself when running `jest` directly.                                                                                                             |
| `OCTO_STAGE`, `OCTO_PHASE`, `OCTO_NAT`, `OCTO_TARGET`, `OCTO_WORK`, `OCTO_CASE`, `OCTO_PROBE_STATE` | you, by hand                                  | Drive the `aws-ecs-server` debugging harnesses; that template's `README.md` describes each.                                                                                                                         |
| `GH_TOKEN`                                                                                          | a repository secret                           | Checkout and push in **Manual Release**, and the tags and GitHub releases `nx release` creates.                                                                                                                     |
