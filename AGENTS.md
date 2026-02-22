# Octo Agent Governance

## What is Octo
Octo is a IaC tool to help developers and devops write clean infrastructure code using intent,
rather than dealing directly with cloud resources.
Learn the fundamentals in `@apps/octo-docs/docs/fundamentals`.

## Project Structure
Octo is a NX monorepo with 2 main directories - `apps` and `packages`.
- `apps` contain websites.
  - `octo-docs`: A docusaurus documentation website. Here you will find wealth of knowledge on Octo.
- `packages` is where the source code lives.
  - `octo`: This is the base package that enables writing IaC for different cloud providers.
    It provides helpful methods, decorators, services, utilities, transactions, and much more.
  - `octo-aws-cdk`: This is a CDK package implemented using Octo for AWS infrastructure.
  - `octo-build`: This package exposes the Octo CLI tool.
  - `octo-event-listeners`: This package enables writing logs and generating transaction reports for users.
  - `octo-templates`: This exposes infrastructure templates written using Octo that are pre-tested and ready to use.

## Coding Standards
This is a TypeScript project using ES6 syntax.
We follow [Google Style Guide](https://google.github.io/styleguide/tsguide.html).

### NX
- NX workspaces only controls `packages` directory.
- `apps` directory separately manages its dependencies.
- @package.json has consolidated scripts to build, format, and lint. Individual projects also have the same scripts.
- @nx.json specifies NX options and release strategies.

### EsLint and Prettier
- No lint errors or warnings.
- No spelling errors. Maintain @dictionary.dic for unknown words.
- Prioritize EsLint and Prettier rules over Google Style Guide.

### TypeScript
- Apply best efforts to keep code alphabetically sorted - classes, methods, property and keys, imports, etc.
- Apply best efforts to use full and descriptive names over shorthand.
- Use A to start abstract classes, I to start interface names.
  Use pascal case when naming classes, interfaces, and types, camelCase otherwise.

### Tests
We strive to write tests not for code coverage, but based on functionality to avoid breakage between releases.
There are unit tests, integration tests, and e2e tests defined for each project.
- Do run all unit tests frequently. Add more tests wherever necessary to increase code confidence.
- Avoid writing integration and e2e tests unless necessary. Only the `octo-templates` package require
  dedicated integration and e2e tests.
- Avoid running `octo-templates` integration and e2e tests frequently. These tests create actual AWS resources,
  and might incur unnecessary AWS costs.

## Documentation
Octo's documentation must grow with its feature set, with code examples, API docs, and helpful blog posts.
- `packages` make heavy use of JSDoc to document code behavior with parameter details and code examples.
- `apps` contain high level documents explaining entire feature sets, and referencing API docs.
  - @apps/octo-docs/package.json can run `plugin:pre-script`, `plugin:build`, and `plugin:post-script`
    to generate API docs from JSDoc comments.

## Agent Context
There are pre-approved plans for many tasks under `@docs/agent-plans`.
You must reference appropriate instructions in those plans to gain more context.
This is also your personal note-taking space to build over time with feedbacks.
- Use `@docs/agent-plans/octo-aws-cdk-validate-resource.md` to validate a resource definition in octo-aws-cdk.
- Use `@docs/agent-plans/octo-aws-cdk-fix-resource.md` to fix a GitHub bug issue for an octo-aws-cdk resource.

## Agent Workflow
AI Agents must follow this workflow every time to keep the developer as hands free as possible.
1. **Initiate**: User might want a pair programming session or hands-free session. When in doubt, ask the user.
   - For small refactors, stay in local context.
   - For high autonomy tasks and large features,
     create a git worktree: `git worktree add ../ai-worktrees/octo-worktree-<branch-name> -b ai/<branch-name>`.
     Move your execution context to that directory.
   - After creating a worktree, symlink every `node_modules` directory from the main repo into the
     worktree so NX and Jest can resolve packages. Run from the main repo root:
     ```bash
     WORKTREE=../ai-worktrees/octo-worktree-<branch-name>
     find . -maxdepth 4 -name node_modules -type d ! -path "*/node_modules/*/node_modules" | \
       while read src; do
         mkdir -p "$WORKTREE/$(dirname $src)"
         ln -s "$(pwd)/$src" "$WORKTREE/$src"
       done
     ```
     Run lint and tests from within the worktree directory after this.
2. **Plan**: Research the code in `@packages` and documentation in `@apps/octo-docs`.
   Write a plan in the chat, and wait for approval. Use pre-approved plans in `@docs/agent-plans` when appropriate.
3. **Execute**: Complete the task following the Coding Standards. Ensure all UT passes, and no linter errors.
   Once the plan is approved, do not ask for user permissions. Run in loop until the task is completed.
4. **Feedback**: Users will provide feedback or correct your mistakes.
   You must enhance the appropriate plan with these feedbacks so that you never make the same mistake again.
5. **Submit**: Use GitHub.
   - Push the branch to origin.
   - Create a GitHub PR using guidelines in `@.github/jobs/validate-pr-title.job.sh` and with detailed description.
