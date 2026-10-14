# Open items

Things known to be broken, or waiting on something. One entry per problem. Delete an entry when the
problem is gone — this file records what is open, not what was fixed.

Started 2026-09-19.

The rule these entries are measured against: **the published docs describe the packages on npm.**
`main` runs ahead of both, and that is normal and not an item here.

## The documentation site returns 404 to crawlers

Every clean URL on octo.quadnix.com — `/docs/introduction`, `/blog`, `/api` — answers **HTTP 404**
with Docusaurus's "Page Not Found" as the served HTML. Only `/docs/introduction/index.html` answers
`200`.

A person browsing never notices: the 404 page ships the same JS bundle, so the router renders the
real page on hydration. A search engine sees a 404 status and an error page, so no documentation
page can be indexed, and every shared link previews as an error. The homepage's own "Get Started"
button points at one of these URLs.

The cause is the S3 REST origin behind CloudFront, which does not resolve a directory to its
`index.html`. `cloudFront.notFoundBehavior` does not cover this — both `error-document` and
`single-page-app` are about paths the bucket has nothing at, not about directory indexes. The fix is
a CloudFront Function rewriting `/path/` to `/path/index.html`, or Docusaurus `trailingSlash`, or
the S3 website endpoint as the origin. Whichever is chosen, `AwsS3StaticWebsiteServiceModule` should
carry it, because every static site served this way has the same problem.

## Parked: CodeBuild and CodePipeline

Branch `ai/pipeline-and-lambda`, tip `1e31b2f2`, local only and never pushed. The design is
unsettled; `docs/pipeline-and-lambda-handoff.md` says what was built, what was decided without
review, and what is wrong with it. Its Lambda half is superseded: Lambda was rebuilt on `main`
(2026-09-30) as the image-based Lambda family, so take nothing Lambda from the branch.

Nothing under `apps/octo-docs/docs` on `main` mentions CodeBuild or CodePipeline, so the published
docs are unaffected. Two of the branch's commits were later cherry-picked onto `main` — `036186eb` as
`015b4d8d`, and `ec148af7` split so only the `iam-role.resource.ts` fix landed, as `9fc7da90`. Both
sides now carry those changes under different hashes, so a rebase conflicts on both; the handoff
doc's instruction is to re-commit the branch tip as one tree instead of replaying it. The `iam-role`
fix's test has since landed on `main` too (`iam-role.resource.spec.ts`).

## Nice to have: lock part of the app

Two runs changing unrelated parts of the graph could hold separate locks: one run on server A,
another adding a Redis service. Today one run locks the whole app. It is a large piece of work, it
may not succeed, and nothing needs it yet.

The backend grants it today but cannot hold it. A lock's scope is a list of opaque strings, and two
locks conflict only when they share one, so two scoped runs are both granted. But the backend stores
each commit's state as one snapshot of the whole app, and the newest sealed snapshot is what every
run reads next. Octo sends a single member covering the whole app, which is why this has not bitten.
What Octo would need:

- **A scope from the graph.** `ANode.getBoundaryMembers()` is the starting point, but it mixes what
  a run changes with what it needs to exist, and every node's ancestors reach the app, so any two
  scopes would overlap. Split it: descendants and dependents are the **write set**, ancestors the
  **read set**. Two runs may share a read set, never a write set.
- **Resources, not only models.** `AResource.getBoundaryMembers()` throws, and what a run actually
  writes is per module: Terragrunt folders and `.tfstate` files. The write set has to be translated
  from models to `moduleId`s to folders, which `InputService` can map.
- **Deletions.** Deleting a node puts its previous boundary at risk, so the scope is the union of
  the old and the new write set.
- **The cloud.** Graph-disjoint is not cloud-disjoint: two scopes can still collide on a security
  group, an IAM policy, or an account quota.

**The state has to be split first, in Octo and in the backend.** Two runs that each upload a
snapshot of the whole app lose one run's change. Alice locks the bucket and Bob locks the VPC, both
starting from a state holding bucket v1 and VPC v1. Alice seals bucket v2 with VPC v1. Bob then
seals bucket v1 with VPC v2, which becomes the newest state, and Alice's change is gone: the next
run plans from Bob's snapshot and sees her bucket as drift. No state ever holds both changes.

Nothing in Terraform or Terragrunt merges two versions of one state either. Terraform locks a whole
state file for every write and refuses a saved plan whose state has moved; teams get parallel work
by splitting infrastructure into several roots, each with its own state and lock. Terragrunt makes
that split systematic: every unit is its own root with its own state file and lock, and units meet
only through each other's outputs.

Octo is halfway there. Its terraform state is already one `.tfstate` per module. But `models.json`,
`resources-actual.json` and `resources-old.json` each describe the whole app and are rewritten in
full by every run. Partial locks need those split per scope, so that a run writes only the part it
holds. The backend then needs a snapshot history per scope, each with its own newest state and its
own lock, rather than one per app. The model serializer is already boundary-based; the resource
record is where the Octo work would be.

## To do: rework every repo doc, then commit them

Bring each one up to date with `main`, then commit them together:

- `docs/CODING-STANDARDS.md`
- `docs/ARCHITECTURE.md`
- `docs/DOCUMENTATION-STANDARDS.md`
- the READMEs (root and `packages/octo`)
- this file
- the plans still open: `docs/module-catalog-plan.md` and `docs/serverless-backend-plan.md`

Several of them carry uncommitted edits as of 2026-10-06.

## To do: create-app and the templates have drifted apart

`octo create-app` keeps its own copies of three definitions, as `.ejs` files under
`packages/octo-build/src/commands/create-app/generator-octo-app-template/generators/app/templates/src/`:
`aws-dynamodb-service`, `aws-ecs-server` and `aws-s3-website`. Its `--template` choices are hardcoded
to those three (`create-app.command.ts`). `octo-templates` has seven: `aws-cloudfront-website`,
`aws-ecr-image` and `aws-lambda-api` are not offered, and `aws-codepipeline` holds nothing but an
ignored `.env`. Nothing checks that a copy still matches the tested template.

Do one of these:

- **Generate from the templates.** `create-app` carries `octo-templates`' tested definitions
  automatically, so a new template is offered without a second copy.
- **Remove the `--template` option** altogether.

Either way, open a **use cases** section in `apps/octo-docs`. Each use case is explained in detail on
a page of its own, not spread across blog posts and documentation pages.

## To explore: every e2e written in `octo.yaml`

Some e2e suites drive a definition file through the `octo` CLI (`OctoCliUtility`):
`aws-cloudfront-website`, `aws-ecr-image` and `aws-lambda-api`. The older ones build modules in
TypeScript through `TestModuleContainer`: `aws-dynamodb-service`, `aws-ecs-server`, `aws-s3-website`,
and the 33 module e2es under `packages/octo-aws-cdk/test`. Find out whether all of them can be written
in `octo.yaml`, the surface users write, and what `TestModuleContainer` would still be needed for.

## To check: a rename may recreate an ECS service or security group under its own name

Found reviewing the ECS server snapshot, 2026-10-06. Every resource id ends in a hash of its scope,
so renaming something a resource sits under gives that resource a new id and a new terraform
address. Octo turns that into a terraform `moved` block only for classes that declare
`uniqueProperties` (the AWS name). `EcsService` and `SecurityGroup` declare none, so they are planned
as destroy-and-create of the **same AWS name**: an ECS service named after its execution in the
same cluster, a security group of the same name in the same VPC. Both names must be unique, so the
create may fail, or the old one has to be gone first.

It shows in the snapshot cases for `deploymentTag`, `serverKey`, `environmentName`, the region's
`name`, the subnet's `subnetName` and the app's `name`. The suite only plans these cases, so none has
been applied. Before this, `deploymentTag` and `serverKey` updated the service in place.

Apply one of them live to find out. If it fails, declare `uniqueProperties` on both classes
(service name within its cluster, group name within its VPC), so they move instead.

## To decide: renaming the app rebuilds the whole stack

The app's name is part of every resource's scope, so renaming it changes every id. In the ECS server
template, `SimpleAppModule`'s `name` change used to plan nothing; it now plans destroying and
recreating the VPC, subnets, NAT gateway, ALB and service. Resources with `uniqueProperties` move
instead (the cluster, the ALB, the role, the task definition); the VPC and the rest do not.
Decide whether the app name belongs in the scope.

## To fix: a failed apply can lose the provider a folder still needs

A folder keeps the provider block of an account or region it no longer uses until the next commit,
so the apply in between can destroy what that provider created. If that apply fails partway and is
committed anyway, the commit records only the providers still in use, and the next generate no
longer writes the old one: terraform then refuses to plan with `Provider configuration not
present`. Committing should keep a recorded provider while terraform state still holds anything of
it.

## To explore: write the journal from outside the process

The journal listener runs inside each `octo` process and writes with every state save (the terraform
state check-in every interval among them), when a command ends, and before the lock is released.
Every failure that reaches Octo's own error handling is recorded. A process that is killed (SIGKILL,
a closed terminal, a cancelled CI job, an out-of-memory kill) loses its entries since the last state
save, and the killed terraform process's output; state and Terraform's state are unaffected.
Rahul's ask (2026-10-10): record from a separate process, so a dying run cannot take its journal
with it. That is a redesign of how events leave the process, so it was not attempted.

## To decide: the journal's limits on remote state

- Journal files count toward the limits the backend holds an app to — by default 20 MB a file and
  1000 files a write, and 100 MB of state in all, checked when a lock is taken — and ride in the
  same save as terraform state, so a journal file over a limit fails that save and the command with
  it. Rahul 2026-10-11: that is the signal to raise the backend's limits, not to bypass them for the
  journal. An apply printing more than 20 MB, or a run of many retries, hits this first.
- Module inputs are journaled as each module ran with them. A secret passed as a module input
  (from `env`, say) lands in plain text in the journal, which remote state uploads with the run and
  local state keeps in `.octo/` (gitignored). Nothing redacts it.
- A refused `octo apply` ("would DESTROY") is journaled as `Exited with code 1.`; the destroy list it
  printed is only in the plan output in the terraform log, not an event of its own.

## To do: switch state providers safely

Rahul 2026-10-11: a user must be able to start on one state provider and move to another (remote to
local, local to remote, plain to encrypted, and back) safely, within reason. Today there is no path
for it. Build one.

## To fix: the `aws-s3-website` integration test expects an old bucket response

`packages/octo-templates/src/aws-s3-website/main.ispec.ts` "should create the website" expects the
bucket response `{ Arn, awsRegionId }`; the bucket also reports `RegionalDomainName` since the
CloudFront series (`8a53050f`..`e622c564`). Seen 2026-10-10 against LocalStack; the other two cases
pass.
