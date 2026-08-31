# Octo Agent Governance

## Before you change any code

Read `@docs/CODING-STANDARDS.md`. Every change under `packages/` must follow it.

If the user corrects your code or your approach, update `@docs/CODING-STANDARDS.md` in the same
session so the correction sticks. You do not need permission to do this — you need permission only
to *remove* a rule.

## What is Octo

An IaC tool for writing clean infrastructure code as intent, rather than against cloud resources
directly. Fundamentals live in `@apps/octo-docs/docs/fundamentals`.

## Project structure

NX monorepo. NX controls `packages` only; `apps` manages its own dependencies.

- `packages/octo` — the base framework: decorators, services, transactions, modes, utilities.
- `packages/octo-aws-cdk` — AWS modules and resources built on octo.
- `packages/octo-build` — the octo CLI.
- `packages/octo-event-listeners` — logging and transaction reports.
- `packages/octo-templates` — pre-tested infrastructure templates.
- `apps/octo-docs` — Docusaurus documentation site.

`@package.json` has consolidated `build`, `format`, `lint`, and `test` scripts; each project has the
same scripts. `@nx.json` holds NX options and the release strategy.

## Pre-approved plans

`@docs/agent-plans` holds task recipes. Read the matching one before starting; it is also your
note-taking space — add what you learn.

## Workflow

1. **Initiate.** Small refactor: stay local. Large feature or hands-free run: create a worktree **with permission**.

   ```bash
   git worktree add ../ai-worktrees/octo-worktree-<branch-name> -b ai/<branch-name>
   ```

   Then symlink `node_modules` into it so NX and Jest resolve packages, and run lint and tests from
   inside the worktree:

   ```bash
   WORKTREE=../ai-worktrees/octo-worktree-<branch-name>
   find . -maxdepth 4 -name node_modules -type d ! -path "*/node_modules/*/node_modules" | \
     while read src; do
       mkdir -p "$WORKTREE/$(dirname $src)"
       ln -s "$(pwd)/$src" "$WORKTREE/$src"
     done
   ```

2. **Plan.** Research `@packages` and `@apps/octo-docs`. Write the plan in chat and wait for
   approval. Use a pre-approved plan when one fits.
3. **Execute.** Follow the coding standards. All unit tests pass, lint is clean. Do not ask for
   permission again once the plan is approved.
4. **Feedback.** Fold every correction back into `@docs/CODING-STANDARDS.md` or the relevant
   agent plan.
5. **Submit.** Push the branch, open a PR titled per `@.github/jobs/validate-pr-title.job.sh`, with
   a description of what changed and how it was verified.

## Documentation

Octo's docs grow with its feature set.

- Read `@docs/DOCUMENTATION-STANDARDS.md` before writing or editing anything under
  `@apps/octo-docs/docs`. Same rule as the coding standards: fold every correction back into it, and
  ask before removing a rule.
- `packages` use JSDoc for behavior, parameters, and examples.
- `apps/octo-docs` holds the high-level feature docs; `@apps/octo-docs/package.json` runs
  `plugin:pre-script`, `plugin:build`, and `plugin:post-script` to generate API docs from JSDoc.

## Releasing

`@nx.json` maps the commit *type* to the semver bump: `chore` releases nothing, and `patch`,
`minor`, and `major` bump as named. The scope is the category;
`@.github/jobs/validate-pr-title.job.sh` holds the matrix of which categories may carry which bump.

NX picks the project to bump from the files a commit touches, not from the package named in the
subject. A scoped commit touching only root files is ignored; an unscoped commit touching a root
file counts for every project.

The highest bump among the commits since a package's last tag wins. The `Manual Release` workflow
versions, tags, writes the changelog, and publishes; dependents' version ranges are rewritten for
you.
