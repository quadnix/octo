# Octo Agent Governance

## What is Octo
Octo is a IaC tool to help developers and devops write clean infrastructure code using intent,
rather than dealing directly with cloud resources.
- **Models & Overlays**: Base Octo component that users can use to define infrastructure intent
  from an application perspective. Use `@packages/octo/src/models/*`
  to declare any infrastructure. Models help revisualize infrastructure from developer's POV.
- **Resources**: Define a cloud resource, like a VPC, with actions on how to create, delete, update, and verify.
- **Modules**: A CDK package that wraps models, overlays, resources, anchors, factories, and utilities for a single
  unit of infrastructure work, such as adding a Region, or a Service. A module works on a single model,
  but may use multiple resources.
- **Templates**: This keeps common infrastructure patterns that users can start using now with confidence.
  They are pre-tested e2e tests, that also serve as examples for users to cross-reference.

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

## Agent Workflow
AI Agents must follow this workflow every time to keep the developer as hands free as possible.
1. **Initiate**: Create a git worktree: `git worktree add ../ai-worktrees/octo-worktree-<branch-name> -b ai/<branch-name>`.
   Move your execution context to that directory.
2. **Plan**: Research the code and @apps/octo-docs.
   Write a plan in the chat, and wait for approval.
3. **Execute**: Complete the task following the Coding Standards. Ensure all UT passes, and no linter errors.
   Once the plan is approved, do not ask for user permissions. Run in loop until the task is completed.
4. **Submit**: Use GitHub.
   - Push the branch to origin.
   - Create a GitHub PR with detailed description.
5. **Notify**: Let the user know when to review the PR in the chat window.
