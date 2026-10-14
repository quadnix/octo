# Octo Agent Governance

## Start here

Each file holds one thing, and none repeats another. A fact belongs to exactly one row; the others
link to it.

| File                               | Holds                                                    | Change it when                                              |
|------------------------------------|----------------------------------------------------------|-------------------------------------------------------------|
| `@README.md`                       | the developer's workflow, as procedures                  | a command, prerequisite, test setup or release step changes |
| `@AGENTS.md`                       | governance: what this repo is and the workflow to follow | the workflow or a constraint changes                        |
| `@CLAUDE.md`                       | the harness entry point and autonomy rules               | autonomy or permission rules change                         |
| `@docs/ARCHITECTURE.md`            | the pieces and how they fit                              | a package, a boundary, the lifecycle or CI changes          |
| `@docs/CODING-STANDARDS.md`        | the rules for writing code here                          | a correction lands, or a rule stops being true              |
| `@docs/DOCUMENTATION-STANDARDS.md` | the rules for writing `apps/octo-docs`                   | a correction to a docs page lands                           |
| `@docs/OPEN-ITEMS.md`              | what is broken, undecided, or unbuilt                    | one is found, fixed, or decided                             |
| `packages/<package>/README.md`     | what a maintainer must know before reading that code     | something non-obvious about it changes                      |
| `apps/octo-docs`                   | everything a user reads                                  | a change moves something a user can see or type             |

Read `@docs/CODING-STANDARDS.md` before changing anything under `packages/`, and update every file
above in the same change that makes it untrue.

## What this is

Infrastructure as code written as intent: models describe what an app needs, modules turn them into
Terraform, and the user's own Terragrunt applies it. `@docs/ARCHITECTURE.md` explains the pieces.

## Workflow

1. **Plan.** Research `@packages` and `@apps/octo-docs`. Write the plan in chat and wait for
   approval. A large or hands-free task runs in a worktree, with permission (`@README.md`).
2. **Execute.** Follow `@docs/CODING-STANDARDS.md`. Lint clean, unit tests pass, `tsc --noEmit` clean
   on every package the change reaches.
3. **Feedback.** Fold every correction into `@docs/CODING-STANDARDS.md` — only if it passes the bar
   at the top of that file. A structural fact goes to `@docs/ARCHITECTURE.md` instead. Adding or
   amending needs no permission; removing a rule does.
4. **Submit.** Push the branch and open a PR titled per `@.github/jobs/validate-pr-title.job.sh`.

## Decisions

Write the trade-offs into the relevant doc before asking for a decision. Never ask someone to choose
between options they cannot weigh.

## Verification

Run what `@README.md` prescribes for what you changed. Report the real numbers — if you did not run
something, say so, and never claim a live or e2e run you did not do.
