# Setting up, running, and recording

## The example repository

`../octo-examples`, relative to the octo repo. Never deleted, never pushed, no remote.

```text
octo-examples/
├── README.md            what it is, and why it must not be pushed
├── hooks/pre-push       the guard; reinstall it after any re-clone
├── runs/<date>.md       one per validation run
├── hello-website/       getting-started/static-website
└── shop-example/        getting-started/shop-stack, grown, plus the @shop library
```

If `.git/hooks/pre-push` is missing, put it back before doing anything else:

```bash
cp hooks/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

## Which packages a run exercises

Two modes, and the run record has to say which was used.

**Published**, which is what a reader gets. Use this to start a run, because the first thing you
are testing is whether a reader can follow the pages at all.

```bash
npm install --save --save-exact @quadnix/octo@<v> @quadnix/octo-build@<v> \
  @quadnix/octo-aws-cdk@<v> @quadnix/octo-event-listeners@<v>
```

**Symlinked**, once you are testing a fix that is not released:

```bash
cd ../octo-examples/shop-example
for p in octo octo-aws-cdk octo-event-listeners; do
  rm -rf node_modules/@quadnix/$p
  ln -s "$(cd ../../octo/packages/$p && pwd)" node_modules/@quadnix/$p
done
```

A symlinked package is the built `dist/`, so rebuild it after every source change:

```bash
(cd ../../octo/packages/octo && npm run build)
```

`@quadnix/octo-build` is the CLI and cannot be symlinked usefully, because the generated npm scripts
resolve `octo` from `node_modules/.bin`. Test CLI changes by running the built binary directly.

## The lifecycle

```bash
npm run octo:generate
npm run octo:validate

LOCK_ID=$(npm run --silent octo:lock)
npm run octo:apply -- --lockId $LOCK_ID     # add --auto-approve when anything is destroyed
npm run octo:commit -- --lockId $LOCK_ID
```

`apply` refuses without `--auto-approve` when anything would be destroyed, and prints what. That
refusal is a documented behaviour worth exercising, so hit it deliberately at least once per run
before passing the flag.

`octo lock` prints the id on stdout and nothing else, so `$(...)` captures it. If a run dies holding
the lock, follow `using-octo/recovering-a-failed-run` - running it for real is part of validating that
page. A run you abandon before the apply is released with `npm run octo:unlock -- --lockId $LOCK_ID`.

## Cost discipline

Nothing here should outlive the page that created it.

- Destroy at the end of each page group, not at the end of the run.
- A NAT gateway and a load balancer bill by the hour. Everything else in the shop is free or
  fractions of a cent.
- Verify teardown against the provider, never against octo's own report:

```bash
aws s3 ls
aws ec2 describe-vpcs --region eu-west-1 --filters Name=isDefault,Values=false --query 'Vpcs[].VpcId' --output text
aws ec2 describe-security-groups --region eu-west-1 --query 'SecurityGroups[?GroupName!=`default`].GroupName' --output text
aws ecs list-clusters --region eu-west-1 --query 'clusterArns' --output text
aws ecr describe-repositories --region eu-west-1 --query 'repositories[].repositoryName' --output text
aws iam list-roles --query 'Roles[?starts_with(RoleName,`ServerRole`)].RoleName' --output text
aws sqs list-queues --region eu-west-1 --output text
aws elbv2 describe-load-balancers --region eu-west-1 --query 'LoadBalancers[].LoadBalancerName' --output text
```

Internet gateways attached to the account's default VPCs are pre-existing. Their ids are short and
old-format, like `igw-7c114e1b`; one octo created looks like `igw-0e5962c11c801bb9e`.

## Recording the run

Write `runs/<date>.md` covering:

- The four package versions and how each was resolved, published or symlinked.
- The octo repo's branch and commit sha, and the node, terraform, and terragrunt versions.
- Which pages were run, and which were not.
- What was found, as a table, one row per defect.
- What infrastructure was created and destroyed.

Then commit and tag. The tag is how a later run knows what has already been proven.

```bash
git add -A
git commit -m "Record the <date> documentation validation run."
git tag -a validated/<date> -m "Documentation validation run, <date>.

<versions exercised>
<pages covered>
<what it found, and where the fixes went>"
```

Nothing about a run is reproducible from the working tree alone, because the working tree is only
ever the resting state of the last run. The tag message is the record.
