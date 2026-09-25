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

## Parked: CodeBuild, CodePipeline and Lambda

Branch `ai/pipeline-and-lambda`, tip `1e31b2f2`, local only and never pushed. The design is
unsettled; `docs/pipeline-and-lambda-handoff.md` says what was built, what was decided without
review, and what is wrong with it.

Nothing under `apps/octo-docs/docs` on `main` mentions any of the three, so the published docs are
unaffected. Two of the branch's commits were later cherry-picked onto `main` — `036186eb` as
`015b4d8d`, and `ec148af7` split so only the `iam-role.resource.ts` fix landed, as `9fc7da90`. Both
sides now carry those changes under different hashes, so a rebase conflicts on both; the handoff
doc's instruction is to re-commit the branch tip as one tree instead of replaying it. The `iam-role`
fix on `main` has no test — its test stayed on the branch.

## Nice to have: lock part of the app

Two runs changing unrelated parts of the graph could hold separate locks: one run on server A,
another adding a Redis service. Today one run locks the whole app. It is a large piece of work, it
may not succeed, and nothing needs it yet.

The backend already supports it: a lock's scope is a list of opaque strings, and two locks conflict
only when they share one. Octo sends a single member covering the whole app. What Octo would need:

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

**Whether Octo's state has to be split first is an open question.** `models.json`,
`resources-actual.json` and `resources-old.json` each describe the whole app and are rewritten in
full by every run, so two runs holding separate locks would still overwrite each other's records.
Splitting them per module is one answer, and may not be the only one or a needed one. Decide it when
this work starts. If it is split, the model serializer is already boundary-based; the resource
record is where the work would be.
