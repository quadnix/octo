# Documentation standards

How this repo writes documentation. Read this before writing or editing anything under
`apps/octo-docs/docs`.

These rules come from review feedback on real pages. When a correction arrives, fix the page and add
the rule here in the same session. Removing a rule needs permission.

Three pages have been through review. `introduction.mdx` is the reference for voice and for an
argument page, and is the closest thing here to a finished page.
`getting-started/static-website.mdx` is the reference for a walkthrough. `why-octo.mdx` passed
review but is the weaker model of the three; take the shape of it, not the sentences. Read the one
that matches what you are writing.

The docs share one running example: the shop application. An AWS account, a region, a staging
environment, a checkout server, and a receipts bucket that checkout can read and write. New pages
use it rather than inventing their own.

Its concrete values are fixed, because pages quote real output containing them. App `shop`, AWS
account `123456789012`, region `eu-west-1` with Octo region ID `aws-eu-west-1a` and CIDR
`10.0.0.0/16`, bucket `shop-receipts` with an `uploads` directory, server key `checkout`. Module IDs
are `app-module`, `account-module`, `region-module`, `receipts-module`, `checkout-server-module`.
When a page needs something the shop does not have yet, extend the shop rather than starting over:
the order queue in Building Modules is `ShopQueueServiceModule` under package `@shop`.

There is one deliberate exception, `getting-started/static-website.mdx`, and it comes first in
Getting Started. It runs the `aws-s3-website` scaffold end to end, because a reader should watch the
lifecycle produce something they can open in a browser before meeting a stack the size of the shop.
It is self-contained and no other page depends on it. A second exception needs the same
justification: a working result the shop cannot show, on a page nothing else builds on.

---

## The map

A code change ships with its doc change in the same commit. This section is how that is decided
without reading forty pages: find the surface you touched, update the page that owns it, and stop.

Ask one question first: **can a reader see or type the thing you changed?** A key in `octo.yaml`, a
CLI command or flag, what a command prints, a file octo writes, a module name or input, a field in a
report, an API a module author calls. If none of those moved, no page did either — an internal
refactor, a test, a private helper, or a bug fix that restores documented behaviour needs nothing
here. JSDoc needs nothing either: `apps/octo-docs` generates the API pages from it at build time.

If something did move, the row below names the page that **owns** it. An owner page explains the
surface, so it changes whenever the surface's meaning, spelling, or defaults change. The pages
beside it only **quote** the surface in captured output, so they change only when that output would
now come out different — and then by re-capturing, never by hand-editing.

| Changed in `packages/`                                                                               | Owner page                                   | Also quotes it                                                                                                                                     |
|------------------------------------------------------------------------------------------------------|----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| A key in `octo.yaml` — `octo-v1.schema.json`, `yaml-definition.utility.ts`                           | `using-octo/the-definition-file`             | `getting-started/shop-stack`, `getting-started/static-website`, and the `techniques/` page owning that key                                         |
| A CLI command, its flags, or what it prints — `octo-build/src/commands`                              | `reference/cli`                              | `getting-started/the-lifecycle`, `getting-started/installation`, `using-octo/destroying-infrastructure`, `techniques/github-actions-pipeline`      |
| An `octo-aws-cdk` module, its name, or its inputs                                                    | `reference/aws-module-catalog`               | `getting-started/shop-stack`, `fundamentals/shop-stack-explained`                                                                                  |
| A template in `octo-templates`                                                                       | `reference/templates`                        | `getting-started/static-website`                                                                                                                   |
| The validate report's shape or rendering — `validate.mode.ts`, `octo-event-listeners`                | `using-octo/reading-a-validate-report`       | `getting-started/the-lifecycle`, `getting-started/shop-stack`, `using-octo/troubleshooting`                                                        |
| A state provider or what it writes — `state-management/`                                             | `techniques/state-providers`                 | `fundamentals/state`, `getting-started/project-structure`                                                                                          |
| An event or listener                                                                                 | `techniques/events-and-listeners`            | `using-octo/the-definition-file`                                                                                                                   |
| A hook                                                                                               | `techniques/hooks`                           | `using-octo/the-definition-file`                                                                                                                   |
| A schema or validation decorator                                                                     | `techniques/schema`, `techniques/validation` | `building-modules/create-a-model`                                                                                                                  |
| Tag resolution — `registerTags`                                                                      | `using-octo/tagging-resources`               | —                                                                                                                                                  |
| The HCL or terragrunt octo generates for a resource — `terraform.service.ts`                         | `fundamentals/how-octo-works`                | `getting-started/shop-stack`, `getting-started/static-website`, `building-modules/create-a-module`, `building-modules/create-a-terraform-resource` |
| What a model, resource, module, anchor, overlay, action, or dependency *means*                       | `fundamentals/<that concept>`                | `building-modules/<the matching create- page>`                                                                                                     |
| An API a module author calls to build one                                                            | `building-modules/<the matching page>`       | `fundamentals/<that concept>`                                                                                                                      |
| The order the lifecycle runs in, or what a step does                                                 | `getting-started/the-lifecycle`              | `fundamentals/how-octo-works`                                                                                                                      |
| Which files a project holds, and which are committed                                                 | `getting-started/project-structure`          | `getting-started/installation`                                                                                                                     |
| What the `create-app` scaffold writes into a new project — `octo-build/.../generators/app/templates` | `getting-started/project-structure`          | `getting-started/static-website`, which reproduces the scaffold's files as the reader will find them                                               |
| A user-facing error message, new or reworded                                                         | `using-octo/troubleshooting`                 | —                                                                                                                                                  |

Two pages are deliberately absent. `introduction.mdx` and `why-octo.mdx` argue from problems rather
than from surfaces, so a surface change never reaches them; they change when the argument does.

The map is a shortcut, not the authority. When a change fits no row, or fits one badly, find the
pages by grepping for the thing you renamed and read what comes back — then add the row you needed.
A surface with no owner page is worth noticing on its own: it usually means the surface is
undocumented rather than that the map is wrong.

## The reader

- The audience is wide: a developer, a devops engineer, a CEO, a marketing person. Their knowledge
  ranges from none to expert. Write for the lower end, using situations the expert still recognizes.
- Assume they know nothing about Octo. Assume basic familiarity with infrastructure, and that anyone
  technical has most likely worked in Terraform.
- The reader's real position, stated plainly: they work in a codebase far too large to hold in one
  head, they add things by copying the last one that worked, and they approve plans they cannot
  fully account for. They will not admit that, and the docs must never make them.
- Show that situation as competence under constraint, never as ignorance. The gap belongs to the
  codebase and the tooling, not to the person reading.
- The docs are read top to bottom. A page may rely on what every page before it taught, and on
  nothing after it. It may never rely on where it sits: the knowledge carries forward, the position
  does not, and no sentence refers to the page before or the page after.
- Teach one idea at a time. Introduce a term before using it, and link to the page that owns the
  concept the first time it appears.
- Write for understanding, not for coverage. A page that teaches one idea well beats a page that is
  complete. Correctness the reader cannot absorb buys nothing.

## Names

- A page's file name is the kebab-case of its title, and its sidebar label is the title again.
  `reading-a-validate-report.mdx` is titled "Reading a Validate Report", and its sidebar label is
  "Reading a Validate Report". Three names for one page is two too many to keep in agreement.
- That constraint runs both ways. A title that will not kebab cleanly is the wrong title: "Events &
  Listeners" and "Pipeline - GitHub Actions" became "Events and Listeners" and "GitHub Actions
  Pipeline" for that reason.
- Renaming a page changes its URL, so rewrite every `/docs/...` link to it in the same change and
  rebuild before finishing. The generated `contributions/` pages are the exception: they set an
  explicit `slug`, so their URL does not follow the file name.
- Link text that reads as a page's name has to be that page's title. Four pages still said "Your
  First Stack" months after the page became "Shop Stack", because a rename rewrites URLs and leaves
  the words alone. Inline noun links, "[anchor](/docs/fundamentals/anchors)" inside a sentence, are
  exempt and should stay lowercase; the check below tells the two apart.

## Page shapes

- **The introduction** is the only page that opens with a definition. Problem in the reader's
  current world, then what Octo is and what changes because of it, then how it runs and what it
  leaves alone.
- **Argument pages**, meaning `why-octo.mdx`, open by re-establishing the example, linked to its
  diagram, and naming the one change the page follows. Not the sections it will follow it through.
  Then that change, worked all the way through, before any general point.
- **Concept pages**, meaning Fundamentals and Techniques, open with the problem the concept exists
  to solve, in one paragraph, then the concept. The reader has already committed by then, so they do
  not need winning over, but they still need the why before the what.
- **Walkthrough pages**, the Getting Started kind, are three moves and no more: what the reader
  will have built by the end, how it is going to be done, then the steps in order. Most pages are
  simple and stay simple. Do not inflate one into an argument because an argument reads as more
  substantial. https://docs.nestjs.com is the model: "we'll build a basic CRUD application", then
  "First, let's scaffold", then the commands.

## Openings

Every page. The introduction has its own section below, on top of these.

- Judge where the reader is before writing the first line. They have read every page before this
  one, so decide what they now understand and start explaining this page from there. An opening
  that assumes they already hold the page's idea reads as confirmation, not teaching.
- Do not tie the opening to the previous page. "Now that installation is done" pins the page to one
  slot in the sidebar and breaks the day it moves. Write the same fact about the world instead: "An
  Octo project sitting on disk has created nothing" tells the reader they have a project and that
  nothing has run, without naming the page that gave it to them.
- On a walkthrough, the first sentence names the result, in the reader's words: "This page builds a
  static website and puts it on the internet." Not the tool's machinery. Octo's four commands, the
  definition file, and the module names are how it gets done, and every one of them is meaningless
  to somebody who has not yet been told what is being built. Naming the lifecycle in the first line
  is the specific mistake to avoid.
- An opening is not a summary. Do not narrate the sections that follow: "you put two values in, run
  the four commands, open the site, then change a page" tells the reader what they are about to do
  anyway, and it spends their attention before the first step. Say what the page is about and stop.
  The sidebar and the headings carry the rest, one section at a time.
- Every noun in an opening is either one the reader already holds or one the sentence itself
  explains. A word the previous page used once is not the reader's yet: "the project the
  `aws-s3-website` scaffold writes" states two of them as known. Describe the thing by what it is
  and what it contains, "a folder holding `octo.yaml`, the file where you describe the
  infrastructure you want", and leave the template name and the flag beside the command that uses
  them.
- Never defend the page. Arguing why this example comes first, or why it is a website rather than a
  network, answers an objection the reader does not have and hands them a doubt they had not
  thought of. Say what the page builds, and build it.
- No commentary about documentation. "Reading about a framework tells you what it believes" is a
  sentence about pages, not about Octo, and the reader came for the task.
- When a page's example is smaller or narrower than the running one, frame it in one sentence near
  the top and name what it leaves out. "One service, no servers, and no relationship between
  services" sets an expectation; "so the first thing you build is a website" argues with an
  objection the reader has not made.
- Scenes and quoted sentences belong in the body sections, never above the fold.
- Never open on an inventory. Address ranges, load balancers, and file listings mean nothing to a
  reader who has not agreed there is a problem, and that vocabulary is the very thing they suspect
  they should not have to think about.
- No code before the reader has the concept the code demonstrates. Prose first; an example earns its
  place once it illustrates something already explained.

## The introduction

Only `introduction.mdx`. It is the one page that opens with a definition, and the one page a reader
may arrive at with no context at all.

- It states what Octo is, why it exists, and what it solves, then takes each idea in turn: the
  problem it addresses, and the solution at a high level. It is not a tour of the product.
- First paragraph is the problem, in the reader's current world: the tools they already use, what
  those tools do well, and the gap that comes with it. No story, no scene, no atmosphere.
- Second paragraph introduces Octo, and it is the one line most readers will judge the project on.
  "Octo is an infrastructure-as-code framework" is not enough on its own. Say what changes because
  of it: intent is what you write, cloud resources are encapsulated behind it, and the description
  lines up with the services people already talk about.
- Third paragraph says how it runs and what it leaves alone. https://docs.nestjs.com is the
  reference for this whole shape.
- No declarations of victory and no claims that the current way is broken. "Infrastructure as code
  won" is the wrong first line, and so is anything shaped like it.
- The pain is real but unadmitted. Terraform is the industry standard, so nobody files a ticket
  saying the model is wrong. Name the pain as an observation the reader recognizes, and let them
  agree on their own. Never argue them into it.
- Name no package, no file, no class, and no module of ours, and never our AWS layer. Explain each
  idea from outside the product.
- The exception is Octo's own three words, model, resource, and module, which the introduction
  defines against the diagram, because a reader given a stand-in word has to unlearn it later. Never
  invent a synonym for a concept the product already names: "building block" for a module cost a
  full rewrite of two pages.
- Write it as if the reader has to explain it back to a colleague who does not write code. If a
  sentence only works for someone who already knows the product, it does not belong.
- No vocabulary dumps on the first screen. No lists of model names, no package tables, no API
  surface.

## Tone

- Sound like a colleague explaining something, not like a founder pitching. No pride in the product,
  no superlatives, no talking down, no hype and no apologies. State what is true and move on.
- Be boring, in everyday language, to the point. A sentence exists to explain the thing, not to show
  that the writer understood it first. "The container has a 2 GB memory limit because a load test
  showed it needed one" does the job that "capped at 2 GB because a load test in March said so" was
  performing.
- No punchlines, no aphorisms, no knowing asides. "Terraform checks that the text is text", "a name
  is a string somebody typed", "the model's edge is a wall", and "whoever is on call has to work out
  which half" are all the same move: a clever closing beat where a plain statement belongs.
- Cut the colour that is doing no work. Not "a load test in March", not "at three in the morning",
  not "instead of asking whoever has been there longest". The example should carry the point on its
  own; decoration on top of it reads as a performance for the reader's benefit.
- Explain what the section is about and nothing else, once. An aside explaining a thing the section
  does not turn on, such as a paragraph on what an app produces when the section is about a diagram,
  is content the reader did not ask for and has to carry anyway. Circling the same idea from three
  angles is the same waste, and Octo has far more to cover than any one idea deserves.
- Never challenge the reader. No "try to answer this", no "you cannot", no rhetorical questions set
  up to prove them wrong. Describe the situation plainly and let them recognize it on their own.
- Prefer describing what teams experience over telling the reader what they do. "Teams", "somebody",
  "the next person to read it" land better than "you" in an argument.
- That rule is for arguments only. On a walkthrough, address the reader directly: "You put two
  values into `octo.yaml`, run the four commands, and open the site" is the right voice for
  instructions.
- Never attack the tools the reader uses and likes. Describe what Octo adds, and let the comparison
  happen in the reader's head.
- Do not talk the reader out of Octo in an introduction. Limits, missing coverage, and non-goals
  belong on the pages that weigh tradeoffs, not in the first thing someone reads.

## Writing

- Finish the thought. A section that says intent is independent of the provider has to say what
  actually changes when you move: which modules the project names, that the models keep their names
  and relationships, and what it still costs. Stopping at the promise leaves the reader to guess the
  mechanism.
- Every claim gets a concrete instance. "The reason every line looks the way it does" says nothing;
  "the address range is split into four because there are two regions, each needing a public and a
  private half" says it. If a sentence cannot be given an example, it is not yet a sentence. This
  matters most in an opening, where a specific picture earns the first ten seconds and a general
  observation about the industry does not: "teams have been doing this for years and it works" is
  filler.
- Define a term the first time it appears, positively. "There is no region here, because a region is
  a piece of network to sit inside" only reads to somebody who already holds the term; it teaches
  nobody and it answers a question a newcomer did not ask.
- One word per concept, across every page. Octo's words are model, resource, and module; a page
  that wants a friendlier one for a reader's benefit is about to cost somebody a rewrite of every
  page that used the other word.
- The reader is on a documentation site. "The book" is how these standards talk about the docs
  among ourselves; on a page it names something the reader does not have.
- Name the thing exactly, and leave no room for interpretation. "A system", "your setup", "things",
  and "the way it all fits together" are not descriptions. Octo describes infrastructure; say
  infrastructure.
- Where the distinction between the two vocabularies matters, spell both out: infrastructure
  components are applications, accounts, regions, environments, servers, and services; cloud
  components are virtual networks, subnets, security groups, and task definitions.
- Plain hyphens only. Never an em dash or an en dash.
- Backticks are for identifiers, file names, commands, and code. If every other word is in
  backticks, none of them stand out.
- Banned phrases: "load-bearing", "under the hood", "leverage", "seamless", "it's worth noting",
  "simply", "just", "the whole point".
- Vary sentence length. Three-item lists in every paragraph, and the "not X, but Y" construction on
  repeat, are the clearest signs a machine wrote the page.
- Bold a term once, where it is defined. Italics and bold sprinkled for emphasis read as noise.
- Wrap prose at 100 columns.

## Structure

- No "Where to go next", "Summary", or "Recap" sections, and no sentence anywhere naming what comes
  next. "The next page is the case in full" and "the website on the last page" both break the day a
  page moves, and the sidebar already carries the order. Link to a page by its title when the reader
  needs it, "[Shop Stack](/docs/getting-started/shop-stack) builds the application the other pages
  use", which stays true wherever either page sits.
- Prefer a plain English heading to the technical term for the same thing. "Wiring" and "Swapping"
  tell a newcomer what the section is about; "Composition" and "Substitution" only work for a reader
  who already has the concept. The prose underneath still uses Octo's real word for the thing: the
  introduction's section is headed "Building blocks" and defines models, resources, and modules in
  its first paragraph. Plain heading, exact vocabulary.
- Headings are short. One to three words, a landmark the reader can scan and click, never the first
  half of a sentence. "The graph" and "Beyond one cloud" work; "Where our AWS layer fits in" and
  "What comes of keeping both halves" do not.
- Each section states its problem, then the high-level solution, in that order. A section that only
  describes a feature has skipped the half the reader needs.
- On an argument page, a section may add what the standard tool already does about that problem and
  where it stops. Use it where it earns its place, not as a template: running the same three beats
  through every section is what makes `why-octo.mdx` read as a formula.
- Link to the anchor, not the page. `/docs/introduction#an-example` puts the reader on the diagram;
  `/docs/introduction` makes them hunt for it. Verify the anchor exists in the built HTML.
- Argument pages are built bottom-up from one worked change, not top-down from principles. Take a
  single small task, show what it takes today with the real artifacts, say precisely what a reader
  cannot learn from them, then show Octo's version of the same task. The general point comes after
  the reader has seen it happen, and every later section refers back to that one change.
- Every section opens on something that happens, not on a property. "Two months later the invoices
  service needs the same thing, except it only reads" is an opening; "module contracts are untyped
  relative to the consumer's domain" is a summary of an experience the reader may never have had.
  Name the moment, walk through what goes wrong, then name the problem.
- One example per page, given early, carried the whole way through, and that includes the captured
  output. `testing-a-module` explained the harness with the shop's queue module and then pinned down
  an S3 bucket in all three snapshots, because those were the snapshots that already existed. Run
  the example the page is about and capture its output, even when a near-enough one is to hand.
- One example per page, given early, carried the whole way through. Where the subject has structure,
  give it as a diagram and refer back to it in every section after: sections that argue in general
  terms go vague fast, and the same sentence written against a picture the reader is holding does
  not. Switching from a cache to a bucket halfway down costs the reader the anchor they built. Every
  page that uses the shop re-establishes it, because the reader does not remember it from two pages
  ago, and one sentence with a link to the diagram costs nothing.
- Diagrams are mermaid, and must be true to what the modules actually produce. Check the resources
  in `packages/` before drawing, and mark clearly what the diagram leaves out.

## The problems Octo addresses

These are the problems the docs are allowed to claim, and the shape each claim takes.

- Infrastructure code records consequences and never reasons, so every change starts with
  reconstructing why the current code is the way it is.
- One group holds the whole picture: account layout, network decisions, which rules exist for an
  audit. Everyone else copies the nearest example and reads the plan for the name they expect.
  Requests travel by ticket and neither side can check the other's half. Intent gives both sides one
  file: developers work in terms they can judge, the platform team owns what those terms become.
- The request that caused a change is thrown away once it is translated into cloud resources.
- Answers to "what is a region here" are rewritten per company and cannot be shared.
- Provider choices are spread through every line, so mixing or moving providers is a rewrite.
- Nothing in a repository can be drawn, diffed, or queried at the level people think in.

## Instructions

For pages the reader runs, not only reads.

- Show the file as they will find it, not as it ends up. Where a block has to show the finished
  state, mark the lines they change with a comment saying what goes there.
- Never print a value that is guaranteed to fail when copied. A globally unique name the docs
  already deployed under is one, and a walkthrough is an invitation to copy.
- Name the failures that actually happen, each at the step where it surfaces: credentials at
  validate, a taken bucket name at apply, an account-level control that leaves the result broken
  after an apply that succeeded. Captured error output is best, prose is acceptable, invented output
  is not.
- Say which command first needs credentials, which first changes something, and whether any of them
  stops to ask. A reader who cannot tell what is about to happen stops typing.
- Say why a step exists, not only what it does and what breaks without it. "Commit records what
  apply created, and skipping it breaks the next run" is a threat; "apply is pure Terragrunt and
  knows nothing about Octo, so reading the results back is a step of its own" is a reason.
- Describe the shape of any command that changes infrastructure: what scrolls past, roughly how long
  it runs, and what to do when it stops part way. A command with no sample output is the one the
  reader is most nervous about running.
- Explain the artifacts in the output you show. Two file uploads chained by `depends_on` teach a
  false rule if they sit under a paragraph about ordering that is genuinely required.

## Facts

- Everything on a page must be true of the code in `packages/` on the day it is written. Check names
  in the source before writing them down.
- Sample output is produced by the real tool, never typed by hand. Write the Terraform and run
  `terraform plan`; build the report input and run it through the renderer in
  `packages/octo-event-listeners`. Resource ids and Terraform addresses come from the module and
  resource classes that generate them. The best arguments on a page come out of details that real
  output contains and invented output never would: `policy = (known after apply)` was found by
  running the plan, not by reasoning about it.
- State a limit inside the section that makes the claim, in one clause, and keep going. "Swapping"
  in `why-octo.mdx` says migration is not sequenced for you; that belongs beside the promise, not in
  a closing section that spends the page's credibility undoing it.
- `@quadnix/octo-aws-cdk` is our own implementation layer for AWS. It is a usable library and a
  worked example of how to build one. Never present it as part of the framework, and never imply it
  is the only way to run Octo.
- Watch the verb. "Octo ships two region modules" claims we solved regions for everybody. "Somebody
  on your team writes a region module, and our AWS library happens to contain two as examples" is
  the same fact without the claim. The capability is the module boundary; whatever we publish is one
  team's use of it.
- Capture output by running the tool, not by adapting output from a similar run. Link a scratch
  project's `node_modules/@quadnix/*` at the repo's packages, write an `octo.yaml`, and run the real
  lifecycle; `generate` needs no credentials, and `validate` is plan-only. Where a page needs an
  apply, apply and then tear down, and verify the teardown against the provider before moving on.
- A missing capability is documented as missing. The previous tagging page offered `default_tags`
  through `terraform.providers[].spec` as a workaround, and that renders `tags` as an HCL block, so
  Terraform rejects it. Say what does not exist yet, in an admonition, and stop; a workaround that
  was never run is worse than the gap.
- An admonition carries a fact about Octo that the section needs, and every `:::caution` in the docs
  names a capability that does not exist yet. It never disclaims our own confidence in the page.
  "These workflows are assembled from the pieces this page explains rather than lifted from a
  running pipeline" defended the page above the fold and handed the reader a doubt they did not
  have. Where a page carries configuration our own CI cannot run, name what the reader should prove
  and how, down in the section that owns the risk.
- The card verb in a validate report says whether a piece of intent is present, not whether it
  changed: everything still in the definition file reads as `added`. A page showing a report must
  describe the per-resource markers as the change indicator, and must not read the verb as one.
- Count before you write a number. "Ten modules", "seventy-seven exports", "around forty events"
  are claims, and three of them were wrong at once because each was written from memory of the
  source rather than from the source. `grep -c`, or count the keys, every time.
- A JSON excerpt from a state file is captured output like any other. Keep the real key set and the
  real nesting: a reader compares it against their own `.octo/models.json`, and an excerpt missing
  `"type": "model"` reads as a version mismatch rather than as an abridgement. Trimming whole
  entries is fine; reshaping one is not.
- When two pages describe the same mechanism, read both before changing either. `how-octo-works`
  said intent is rebuilt from scratch every run and `the-lifecycle` said it is diffed against the
  last one; only the first was true, and a reader meeting both learns nothing.

## Redaction

Output is captured from a real account, and the docs are public. Redact before the output lands in
a page, not afterwards.

- The AWS account number is always `123456789012`, in prose, in YAML, in captured output, and in
  every ARN and provider alias built out of it. It is twelve digits like a real one, so report
  columns and provider aliases keep their width. Terragrunt's own mock ARNs already read
  `000000000000`; leave those exactly as the tool wrote them. Where a page needs a visibly different
  second account, as `the-definition-file.mdx` does when it overrides an env var on the command
  line, that one is `999999999999`.
- Redact anything else that identifies the account or the person running the command: IAM user and
  role ARNs that carry a human name, access key ids, session tokens, account aliases, a `profile`
  that is not `default`, private IP ranges that are not the shop's `10.0.0.0/16`, and any bucket
  name that is not the one the page declares.
- Provider-assigned resource ids such as `vpc-0d8d555c656b950ad` stay as captured. They are not
  reachable without credentials, and invented ones read as invented.
- A page that quotes real output says so once, in an admonition, and names the redaction. Never
  write a sentence that points at the unredacted value as proof the run was real: the old
  `shop-stack.mdx` note read "the AWS account number in it is a real one", which advertised the
  leak it was explaining.
- Absolute local paths leak the machine the capture ran on, and Octo puts them in `source` and
  `filemd5()` on every `aws_s3_object`, and in every `dir:` line the logger prints. Shorten them to
  the project-relative form the reader would have, or to `/home/you/<project>/...` where the tool
  needs an absolute one.
- Log lines are shown without their timestamp and pid prefix, as `INFO: ...`, and without the
  structured fields that repeat what the message already said. That is the only reformatting a
  captured block gets; the words are the tool's.
- The rule covers everything a page is built from, not the page alone. Scratch projects, captured
  report JSON, and any file committed alongside the docs go through the same check.

## Checks before a page is done

Prose wraps at 100; captured output and code blocks are left exactly as the tool produced them,
even when a line is longer.

Never point a formatter at a page. A `.mdx` file looks formattable and is not: a fenced snippet is
usually a class member or an object literal rather than a whole file, so a TypeScript-aware
formatter reflows it into something nobody could have typed — `Promise < Diff[] > {`, a modifier
alone on a line — which parses, renders, and destroys a reader's trust in the prose around it. A
code block is written by hand, from the source it quotes.

```sh
# every typescript block parses, and none carries a formatter's damage — also runs in CI
pnpm run check:docs-code

# wraps at 100, code blocks, table rows, and diagram node lines excluded
awk '/^```/{c=!c} !c && length>100 && $0 !~ /^\|/ {print FNR": "length}' <page>

# em dashes and en dashes, allowed only inside real captured output
grep -n '—\|–' <page>

# banned phrases
grep -nE "load-bearing|under the hood|leverage|seamless|it's worth noting|simply|just " <page>

# no page-order references, and no calling the docs a book to the reader
grep -rnE "next page|last page|previous page|next section|the book" apps/octo-docs/docs

# no real account number: only these three 12-digit runs are allowed
grep -roE '\b[0-9]{12}\b' apps/octo-docs/docs | grep -vE '123456789012|000000000000|999999999999'

# no absolute local paths from the capture machine; /home/you/ is the sanctioned stand-in
grep -rn '/Users/\|/home/\|/private/tmp\|/var/folders' apps/octo-docs/docs | grep -v '/home/you/'

# no credentials or named principals
grep -rnE 'AKIA|ASIA[A-Z0-9]{8}|aws_secret|arn:aws:iam::' apps/octo-docs/docs | \
  grep -vE 'arn:aws:iam::(000000000000|123456789012):'

# link text that names a page must match that page's title. Over-reports on proper nouns
# ("Terraform resource") and on table cells naming a concept; read each hit rather than obeying it
python3 - <<'EOF'
import re, glob
titles = {'/docs/' + f[:-4]: re.search(r'^title:\s*(.+)$', open(f).read(), re.M).group(1).strip()
          for f in glob.glob('apps/octo-docs/docs/**/*.mdx', recursive=True)}
titles = {k.replace('apps/octo-docs/docs/', ''): v for k, v in titles.items()}
for f in glob.glob('apps/octo-docs/docs/**/*.mdx', recursive=True):
    for m in re.finditer(r'\[([^\]]+)\]\((/docs/[a-z0-9/-]+)\)', open(f).read()):
        text = ' '.join(m.group(1).split())
        want = titles.get(m.group(2))
        if want and text[0].isupper() and text.lower() != want.lower():
            print(f, text, '->', want)
EOF

# the site compiles, and every anchor a page links to exists in the built HTML
cd apps/octo-docs && npx docusaurus build --out-dir <scratch>
grep -o 'id="an-example"' <scratch>/docs/introduction/index.html
```

Mermaid renders in the browser, so a build passing does not prove a diagram parses. Parse it
directly with the site's own mermaid: `mermaid.parse(code)` under jsdom, importing
`apps/octo-docs/node_modules/mermaid/dist/mermaid.core.mjs`.

## The fresh-reader review

Read the finished page first as somebody who has never seen Octo: if a paragraph needs knowledge
the page has not given yet, it is not grounding, it is name-dropping. Then have it read by somebody
who has not been writing it. Hand it to an agent told to be a
junior engineer, given only the pages that come before it, and ask what the page taught them, where
they stopped following, and what they would have to look up. An idea that does not click for that
reader will not click for a human one. Fix what they trip on, and if the fix is a rule, it belongs
in this file.

Take what comes back as evidence, not as instructions. Reviewers oscillate: on `static-website.mdx`
one pass asked for a paragraph framing the example and the next pass called that same paragraph
defensive. Both were reporting the same thing, that the paragraph was too long, and the fix was to
shorten it rather than to obey whichever reviewer spoke last. A reviewer is reliable about where
they stumbled and unreliable about what should replace it.
