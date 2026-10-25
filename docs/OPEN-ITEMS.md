# Open items

What is broken, undecided, or unbuilt. One entry per problem; delete it when the problem is gone.

The published docs describe the packages on npm. `main` running ahead of both is normal, and not an
item here.

---

## 1. To fix: the documentation site returns 404 to crawlers

Every clean URL on octo.quadnix.com (`/docs/introduction`, `/blog`, `/api`) answers **HTTP 404** with
the "Page Not Found" HTML; only `…/index.html` answers 200. A browser hydrates the real page, so
people never notice, but no page can be indexed and every shared link previews as an error.

The S3 REST origin behind CloudFront does not resolve a directory to its `index.html`, and
`cloudFront.notFoundBehavior` does not cover that. Fix it in `AwsS3StaticWebsiteServiceModule` —
a CloudFront Function rewriting `/path/` to `/path/index.html`, Docusaurus `trailingSlash`, or the S3
website endpoint as origin — because every site served this way has the same problem.

## 2. To fix: a failed apply can lose the provider a folder still needs

A folder keeps the provider block of an account or region it no longer uses until the next commit.
If the apply in between fails partway and is committed anyway, the commit records only the providers
still in use, the next generate drops the old one, and Terraform refuses to plan with `Provider
configuration not present`. Commit should keep a recorded provider while Terraform state still holds
anything of it.

## 3. To fix: a refused lock does not say how to finish the run that holds it

`App already locked with lock ID "…", taken by "…", held for 19s!` names the run holding the lock but
not the way out when that run died: take its lock back with `octo lock --lockId <id>`, then apply
and commit. A new user who never read Recovering a Failed Run is left with an id and no next step.
Found by `octo-examples`' `interrupted-apply` journey.

## 4. To fix: a failed apply's way out is printed, never journaled

When an apply fails, the CLI prints `octo commit --partial --terragruntDir … --lockId …`, but only
to the terminal. The journal records Terraform's error, so a person reading the run in the web app
sees why it failed and not what to run next. Found by `octo-examples`' `failed-apply` journey.

## 5. To check: a rename may recreate an ECS service or security group under its own name

Renaming anything a resource sits under changes its `resourceId`. Octo turns that into a `moved`
block only for classes with `uniqueProperties`. `EcsService` and `SecurityGroup` have none, so a
rename plans destroy-and-create of the **same AWS name**, which AWS may refuse. The ECS server
snapshot shows it for `deploymentTag`, `serverKey`, `environmentName`, the region's `name`, the
subnet's `subnetName` and the app's `name`; none has been applied.

Apply one live. If it fails, declare `uniqueProperties` on both (service name within its cluster,
group name within its VPC).

## 6. To decide: renaming the app rebuilds the whole stack

The app's name is in every resource's scope, so renaming it changes every id. In the ECS server
template it plans destroying and recreating the VPC, subnets, NAT gateway, ALB and service; only
resources with `uniqueProperties` move. Decide whether the app name belongs in the scope.

## 7. To decide: the journal's limits on remote state

- Journal files ride in the same save as Terraform state and count toward the backend's limits
  (20 MB a file, 1000 files a write, 100 MB in all). One over a limit fails that save and the command.
  Rahul 2026-10-11: raise the backend's limits rather than exempt the journal.
- A secret passed as a module input is journaled in plain text, uploaded with remote state and kept
  in `.octo/` locally. Nothing redacts it. E.g. `AwsCredentialsAccountModule` takes `secretAccessKey` as input.
- The Terraform log is uploaded whole at every save, so a long apply sends its growing output again
  at each Terraform state check-in, and an apply printing more than 20 MB fails the save that carries
  it.
- Archiving at release reads every journal file whole into memory (`StateManagementService.unlockApp`
  through `getState`), the Terraform log included. Every other path copies the log by its path.
- A failed Terraform command's message carries everything the command wrote to stderr, which the
  Terraform log already holds, so the `CommandFailedEvent` of a failed apply records that output a
  second time.

## 8. To decide: whether a run reads its state by its lock

The backend's `GET /lock/:lockId` (`getStateByLock`, 3 credits) answers the record a live lock is
writing, for the lock's holder or an administrator. No client calls it: not `RemoteStateProvider`,
not the web app, only the backend's own end-to-end suite.

`RemoteStateProvider.resumeAppLock` reaches the same record in two requests instead: `GET /locks`
(2 credits) to find the lock's commit and confirm it is held, then `GET /commit/:commitId/files`
(3 credits) for the record and its files — 5 credits. Swapping the first for `GET /lock/:lockId`
saves nothing, since it answers the record without its files and costs 3. It saves a request and
2 credits only if the backend answers the record **and its files** by lock, as
`GET /commit/:commitId/files` does, with a 404 for a lock not held that is told apart from a record
nothing was written to yet. The other reads of `GET /locks` need every lock, to name a conflicting
holder or see whether any is held, and gain nothing.

Decide whether Octo resumes by lock, and the backend widens the endpoint to answer the files, or
the backend removes it.

## 9. To do: switch state providers safely

Rahul 2026-10-11: a user must be able to move between state providers — local, remote, and back —
safely. There is no path for it today.

## 10. To do: create-app and the templates have drifted apart

`octo create-app` keeps its own `.ejs` copies of three templates (`aws-dynamodb-service`,
`aws-ecs-server`, `aws-s3-website`) and hardcodes them as its `--template` choices. `octo-templates`
has seven, and nothing checks a copy against its tested template. Either generate `create-app`'s
choices from `octo-templates`, or remove `--template`.

Either way, open a **use cases** section in `apps/octo-docs`, one page per use case.

## 11. To do: finish the repository docs rework

Still to rework, as the rest of the repository docs were on 2026-10-14:

- `docs/DOCUMENTATION-STANDARDS.md`, with the `apps/octo-docs` pass it governs.
- The open plans, `docs/module-catalog-plan.md` and `docs/serverless-backend-plan.md`: verify each
  against `main` and delete what is done.

## 12. To explore: every e2e written in `octo.yaml`

`aws-cloudfront-website`, `aws-ecr-image` and `aws-lambda-api` drive `octo.yaml` through the CLI.
`aws-dynamodb-service`, `aws-ecs-server`, `aws-s3-website` and the module e2es in `octo-aws-cdk`
build modules in TypeScript through `TestModuleContainer`. Find out whether all can be written in
`octo.yaml`, the surface users write, and what `TestModuleContainer` would still be for.

## 13. To explore: write the journal from outside the process

A killed `octo` process (SIGKILL, closed terminal, cancelled CI job) loses its journal entries since
the last state save, and the running Terraform process's output. Rahul 2026-10-10: record from a
separate process, so a dying command cannot take its journal with it. That is a redesign of how
events leave the process.

## 14. Nice to have: lock part of the app

Two runs on unrelated parts of the graph could hold separate locks. Today one run locks the whole
app, and the backend could grant scoped locks but stores each commit as one snapshot of the whole
app — so two scoped runs would each overwrite the other's change.

What it would take:

- **Split state first**, in octo and the backend. Terraform state is already one file per module;
  `models.json`, `resources-actual.json` and `resources-old.json` are not. The backend would need a
  snapshot history and a lock per scope.
- **A scope from the graph.** Split `getBoundaryMembers()` into a write set (descendants,
  dependents) and a read set (ancestors); two runs may share a read set, never a write set.
- **Translate to folders.** What a run writes is per module, so map models to `moduleId`s through
  `InputService`. A deletion's scope is the union of the old and new write sets.
- **The cloud is not the graph.** Two disjoint scopes can still collide on a security group, a
  policy, or a quota.

## 15. Parked: CodeBuild and CodePipeline

Branch `ai/pipeline-and-lambda` (tip `1e31b2f2`, local only). The design is unsettled;
`docs/pipeline-and-lambda-handoff.md` on that branch says what was built and what is wrong with it.
Take nothing Lambda from it — Lambda was rebuilt on `main`. Two of its commits were cherry-picked
onto `main` under new hashes, so re-commit the branch tip as one tree instead of rebasing.
