import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'path';
import type { UnknownResource } from '../src/app.type.js';
import { AResource, type App, type DiffMetadata } from '../src/index.js';
import {
  ExternalIgwResource,
  TestModes,
  TfSgResource,
  TfVpcResource,
} from '../src/utilities/test-helpers/test-modes.js';

describe('App Modes E2E Test', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  // The tfstate a successful apply of the baseline graph would leave behind, per module folder.
  const REGION_TFSTATE = { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' };
  const SG_TFSTATE = { 'sg-1-SgId': 'sg-0real' };

  // Commits the standard vpc -> igw -> sg graph as the baseline, leaving octo state (model, resource,
  // and terraform mapping) persisted — the starting point for a re-run.
  async function commitBaseline(): Promise<App> {
    const { app } = await testModes.createResourceGraph();
    testModes.writeTfState('region-module', REGION_TFSTATE);
    testModes.writeTfState('sg-module', SG_TFSTATE);
    await testModes.commit(app, { outputs: testModes.outputs });
    return app;
  }

  // Re-declares the desired graph in memory after a commit (the repository's new graph is empty post
  // commit). Mutating the inputs makes the next boot compute the intended add/update/delete/noop.
  function setDesiredGraph({
    igwType = 'internet-gateway',
    vpcCidrBlock = '10.0.0.0/16',
    withChildren = true,
  }: { igwType?: string; vpcCidrBlock?: string; withChildren?: boolean } = {}): { vpc: TfVpcResource } {
    const vpc = new TfVpcResource('vpc-1', { CidrBlock: vpcCidrBlock });
    testModes.resourceDataRepository.addNewResource(vpc);
    if (withChildren) {
      const igw = new ExternalIgwResource('igw-1', { Type: igwType }, [vpc]);
      const sg = new TfSgResource('sg-1', {}, [igw]);
      testModes.resourceDataRepository.addNewResource(igw);
      testModes.resourceDataRepository.addNewResource(sg);
    }
    return { vpc };
  }

  // Summarizes a resource-diff transaction as a sorted set of `action:resourceId` (add/delete diffs
  // carry the `resourceId` field, updates carry `properties`/`parent`, so we key off the node).
  function resourceChanges(diffs: DiffMetadata[][]): string[] {
    const changes = new Set<string>();
    for (const diff of diffs.flat()) {
      if (diff.node instanceof AResource) {
        changes.add(`${diff.action}:${(diff.node as UnknownResource).resourceId}`);
      }
    }
    return [...changes].sort();
  }

  it('runs generate -> validate -> run-action -> commit as a user would', async () => {
    // The standard graph: vpc (terraform) -> igw (external) -> sg (terraform), spread across two
    // module folders so cross-folder wiring is part of the workflow.
    const { app } = await testModes.createResourceGraph();
    const tfDir = testModes.outputDir;

    // ------------------------------------------------------------------------------------------
    // Mode 1: generate. Runs the resource sweep and writes one terragrunt folder per module.
    // Asserts the real files on disk, including the cross-folder variable/dependency wiring.
    // ------------------------------------------------------------------------------------------
    const resourceDiffs = await testModes.generate(app, { outputDir: tfDir });

    expect(resourceChanges(resourceDiffs)).toEqual(['add:igw-1', 'add:sg-1', 'add:vpc-1']);

    // region-module owns the terraform vpc and the external igw wrapper.
    const regionMainTf = await readFile(join(tfDir, 'region-module', 'main.tf'), 'utf-8');
    expect(regionMainTf).toContain('resource "aws_vpc" "vpc-1"');
    expect(regionMainTf).toContain('resource "null_resource" "igw-1"'); // external resource wrapper
    expect(regionMainTf).toContain('data "external" "igw-1"');
    expect(regionMainTf).toContain('vpc-1.VpcId=${aws_vpc.vpc-1.id}'); // octo invoked with parent input

    const regionOutputsTf = await readFile(join(tfDir, 'region-module', 'outputs.tf'), 'utf-8');
    expect(regionOutputsTf).toContain('output "vpc-1-VpcId"'); // per-key terraform output
    expect(regionOutputsTf).toContain('output "igw-1"'); // external publishes its whole response

    // sg-module's terraform sg references the external igw across the folder boundary, so generate
    // wires a variable + terragrunt dependency for it.
    const sgMainTf = await readFile(join(tfDir, 'sg-module', 'main.tf'), 'utf-8');
    expect(sgMainTf).toContain('igw_id = var.igw_1.igwId');
    const sgVariablesTf = await readFile(join(tfDir, 'sg-module', 'variables.tf'), 'utf-8');
    expect(sgVariablesTf).toContain('variable "igw_1" {\n  type = map(string)\n}');
    const sgTerragruntHcl = await readFile(join(tfDir, 'sg-module', 'terragrunt.hcl'), 'utf-8');
    expect(sgTerragruntHcl).toContain('dependency "region-module"');
    expect(sgTerragruntHcl).toContain('"igw-1" = { igwId = "mock-igw-1-igwId" }');
    expect(sgTerragruntHcl).toContain('igw_1 = dependency.region-module.outputs["igw-1"]');

    // Every folder is written with the four terragrunt files.
    for (const moduleId of ['region-module', 'sg-module']) {
      for (const file of ['main.tf', 'variables.tf', 'outputs.tf', 'terragrunt.hcl']) {
        expect(existsSync(join(tfDir, moduleId, file))).toBe(true);
      }
    }

    // ------------------------------------------------------------------------------------------
    // Mode 2: validate. The user has run `terragrunt plan` to produce plan.json per folder; octo
    // re-derives its diff and checks the plan matches it (every add accounted for, nothing extra).
    // ------------------------------------------------------------------------------------------
    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    const validation = await testModes.validate(app, { plans: testModes.plans });
    expect(validation.errors).toEqual([]);
    expect(validation.pass).toBe(true);

    // A plan that disagrees with octo's diff fails validation.
    testModes.writePlan('region-module', [
      { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    const badValidation = await testModes.validate(app, { plans: testModes.plans });
    expect(badValidation.pass).toBe(false);
    expect(badValidation.errors.some((e) => e.message.includes('aws_vpc.vpc-1'))).toBe(true);

    // ------------------------------------------------------------------------------------------
    // Mode 3: run-action. Terraform shells back into octo mid-apply for the external resource.
    // Octo recomputes the diff (add), injects the parent's value, runs the action, returns JSON.
    // ------------------------------------------------------------------------------------------
    const actionResult = await testModes.runAction(app, {
      inputs: { 'vpc-1.VpcId': 'vpc-0real' },
      resourceId: 'igw-1',
    });
    expect(actionResult.action).toBe('add');
    expect(actionResult.resourceId).toBe('igw-1');
    expect(actionResult.response).toEqual({ igwId: 'igw-0real' });

    // The action ran with the injected parent response.
    expect(testModes.igwActionHandledDiffs.length).toBeGreaterThan(0);
    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    expect((handledNode.parents[0] as UnknownResource).response['VpcId']).toBe('vpc-0real');

    // A terraform resource cannot be driven by run-action.
    await expect(testModes.runAction(app, { resourceId: 'vpc-1' })).rejects.toThrow(
      'Resource "vpc-1" is a terraform resource and cannot be run via run-action!',
    );

    // ------------------------------------------------------------------------------------------
    // Mode 4: commit. The user has run `terragrunt apply`; octo reads each folder's tfstate, maps
    // outputs back onto resource responses, and persists state. The igw value matches what
    // run-action produced above — the same value terraform would have captured to tfstate.
    // ------------------------------------------------------------------------------------------
    testModes.writeTfState('region-module', REGION_TFSTATE);
    testModes.writeTfState('sg-module', SG_TFSTATE);

    await testModes.commit(app, { outputs: testModes.outputs });

    // commit persisted state and reloaded it, so the committed graph (with tfstate-sourced
    // responses) is now octo's actual resource state.
    const actualResources = testModes.resourceDataRepository.getActualResourcesByProperties();
    expect(actualResources.find((r) => r.resourceId === 'vpc-1')!.response['VpcId']).toBe('vpc-0real');
    expect(actualResources.find((r) => r.resourceId === 'igw-1')!.response['igwId']).toBe('igw-0real');
    expect(actualResources.find((r) => r.resourceId === 'sg-1')!.response['SgId']).toBe('sg-0real');
  });

  describe('re-running the loop after a commit', () => {
    it('with no changes computes no diffs and runs no actions', async () => {
      const app = await commitBaseline();
      setDesiredGraph(); // identical desired state

      // generate: nothing to add, update, or delete.
      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual([]);

      // validate: a plan that changes nothing matches the (empty) octo diff.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);

      // run-action: the external resource is unchanged, so the action does not run.
      const actionResult = await testModes.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });
      expect(actionResult.action).toBe('noop');
      expect(testModes.igwActionHandledDiffs).toHaveLength(0);
    });

    it('with an updated external resource cascades the update across module folders', async () => {
      const app = await commitBaseline();
      // Change the external igw own property. igw updates, and the change cascades onto its direct
      // child sg — which lives in a different module folder, so this is a cross-folder update.
      setDesiredGraph({ igwType: 'internet-gateway-v2' });

      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['update:igw-1', 'update:sg-1']);

      // validate: vpc unchanged; igw updates in region-module; sg updates in sg-module.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['update'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['update'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);

      // run-action: octo determines this is an update from the property change and runs the action.
      const actionResult = await testModes.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });
      expect(actionResult.action).toBe('update');
      expect(actionResult.response).toEqual({ igwId: 'igw-0real' });
    });

    it('with an updated terraform resource updates it and cascades onto its child', async () => {
      const app = await commitBaseline();
      // Change the terraform vpc cidr. vpc updates and cascades onto its direct child igw.
      setDesiredGraph({ vpcCidrBlock: '10.1.0.0/16' });

      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['update:igw-1', 'update:vpc-1']);

      testModes.writePlan('region-module', [
        { actions: ['update'], address: 'aws_vpc.vpc-1' },
        { actions: ['update'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);

      // A terraform resource still cannot be driven by run-action, even when it is the thing changing.
      await expect(testModes.runAction(app, { resourceId: 'vpc-1' })).rejects.toThrow(
        'Resource "vpc-1" is a terraform resource and cannot be run via run-action!',
      );
    });

    it('with a new resource added to an existing folder runs the add through the loop', async () => {
      const app = await commitBaseline();
      const { vpc } = setDesiredGraph(); // existing vpc, igw, sg unchanged

      // A brand-new external resource, contributed into the existing region-module folder the way a
      // model action would add one on a re-run.
      const igw2 = new ExternalIgwResource('igw-2', { Type: 'internet-gateway' }, [vpc]);
      await testModes.addResource('region-module', igw2);

      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['add:igw-2']);

      // The new resource is wrapped into region-module's main.tf alongside the unchanged ones.
      const regionMainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
      expect(regionMainTf).toContain('resource "null_resource" "igw-2"');

      // validate: everything already applied is no-op; only igw-2 is created.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['no-op'], address: 'null_resource.igw-1' },
        { actions: ['create'], address: 'null_resource.igw-2' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['no-op'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);

      // run-action: octo determines igw-2 is an add and runs the action.
      const actionResult = await testModes.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-2',
      });
      expect(actionResult.action).toBe('add');
      expect(actionResult.resourceId).toBe('igw-2');
      expect(actionResult.response).toEqual({ igwId: 'igw-0real' });
    });

    it('keeps the committed response value out of the consumer mock_outputs on regenerate', async () => {
      // Baseline applied + committed: octo state now holds the real tfstate-sourced responses
      // (igw-1's igwId is 'igw-0real'). Re-declaring the identical desired graph clones those
      // responses onto the fresh new graph via addNewResource.
      const app = await commitBaseline();
      setDesiredGraph();

      await testModes.generate(app, { outputDir: testModes.outputDir });

      // renderTerragrunt seeds mock_outputs from the producer schema's declared default, never the live
      // applied response. igw-1's (test) schema declares no default, so the mock stays the synthetic
      // placeholder — the real committed value never reaches the generated, on-disk terragrunt.hcl.
      const sgTerragruntHcl = await readFile(join(testModes.outputDir, 'sg-module', 'terragrunt.hcl'), 'utf-8');
      expect(sgTerragruntHcl).toContain('"igw-1" = { igwId = "mock-igw-1-igwId" }');
      expect(sgTerragruntHcl).not.toContain('igw-0real');
    });

    it('with deleted resources runs the deletes and validates against the persisted mapping', async () => {
      const app = await commitBaseline();
      // Drop igw and sg from the desired state; only vpc remains. igw and sg are deletes.
      setDesiredGraph({ withChildren: false });

      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['delete:igw-1', 'delete:sg-1']);

      // region-module (vpc) is regenerated filled. sg-module was deleted from intent, so its
      // committed folder is emptied — no resources, but terragrunt still discovers it, so the
      // next apply destroys sg-1 instead of orphaning it.
      expect(existsSync(join(testModes.outputDir, 'region-module'))).toBe(true);
      const sgMainTf = await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8');
      expect(sgMainTf).toContain('terraform {');
      expect(sgMainTf).not.toContain('resource "');

      // validate: the igw delete is checked in region-module (still filled); the sg delete is
      // checked in the emptied sg-module plan — the folder is recognized from the committed folder
      // record, and the destroy is verified against the addresses the last commit persisted.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toEqual([]);
      expect(validation.pass).toBe(true);

      // run-action: octo determines igw is a delete and runs the delete action (empty response).
      const actionResult = await testModes.runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });
      expect(actionResult.action).toBe('delete');
      expect(actionResult.response).toEqual({});
    });
  });

  describe('user journeys around deletion and unrecognized folders', () => {
    it('runs the full committed-delete cycle: verified destroy, destroy commit, benign leftover, re-add', async () => {
      // Committed baseline, then the user deletes igw and sg from the yaml.
      const app = await commitBaseline();
      setDesiredGraph({ withChildren: false });

      // generate: region-module is rewritten filled (vpc only); sg-module is emptied.
      const deleteDiffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(deleteDiffs)).toEqual(['delete:igw-1', 'delete:sg-1']);

      // validate: both destroys are verified — igw in the still-filled region-module, sg in the
      // emptied sg-module's plan, against the addresses the baseline commit persisted.
      testModes.writePlan('region-module', [
        { actions: ['no-op'], address: 'aws_vpc.vpc-1' },
        { actions: ['delete'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);
      const deleteValidation = await testModes.validate(app, { plans: testModes.plans });
      expect(deleteValidation.errors).toEqual([]);
      expect(deleteValidation.warnings).toEqual([]);
      expect(deleteValidation.pass).toBe(true);

      // The user applies (destroying igw and sg), then commits. Outputs exist only for the filled
      // folder — nothing is demanded for the emptied one — and the destroyed module drops out of
      // the committed state.
      testModes.outputs.clear();
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      const { warnings: destroyCommitWarnings } = await testModes.commit(app, { outputs: testModes.outputs });
      expect(destroyCommitWarnings).toEqual([]);
      const { terraformFolders } = await testModes.getCommittedTerraformState();
      expect(terraformFolders).toEqual([{ hasExternalResources: false, moduleId: 'region-module', providers: [] }]);

      // Next run: the emptied folder is now a benign leftover. Octo no longer tracks it, does not
      // rewrite it, and never deletes it; validate merely warns when given its (empty) plan.
      const { vpc } = setDesiredGraph({ withChildren: false });
      const noopDiffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(noopDiffs)).toEqual([]);
      expect(existsSync(join(testModes.outputDir, 'sg-module', 'terragrunt.hcl'))).toBe(true);

      testModes.plans.clear();
      testModes.writePlan('region-module', [{ actions: ['no-op'], address: 'aws_vpc.vpc-1' }]);
      testModes.writePlan('sg-module', []);
      const leftoverValidation = await testModes.validate(app, { plans: testModes.plans });
      expect(leftoverValidation.errors).toEqual([]);
      expect(leftoverValidation.pass).toBe(true);
      expect(
        leftoverValidation.warnings.some(
          (w) => w.moduleId === 'sg-module' && w.message.includes('does not track'),
        ),
      ).toBe(true);

      // The user brings igw and sg back (vpc is still staged from the run above — only a commit
      // resets the staged graph): generate fills sg-module again, and the commit after the apply
      // re-tracks it — the leftover warning clears itself.
      const igw = new ExternalIgwResource('igw-1', { Type: 'internet-gateway' }, [vpc]);
      testModes.resourceDataRepository.addNewResource(igw);
      testModes.resourceDataRepository.addNewResource(new TfSgResource('sg-1', {}, [igw]));
      const reAddDiffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(reAddDiffs)).toEqual(['add:igw-1', 'add:sg-1']);
      const sgMainTf = await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8');
      expect(sgMainTf).toContain('resource "aws_security_group" "sg-1"');

      testModes.outputs.clear();
      testModes.writeTfState('region-module', REGION_TFSTATE);
      testModes.writeTfState('sg-module', SG_TFSTATE);
      const { warnings: reAddCommitWarnings } = await testModes.commit(app, { outputs: testModes.outputs });
      expect(reAddCommitWarnings).toEqual([]);
      const reAddState = await testModes.getCommittedTerraformState();
      expect(reAddState.terraformFolders.map((f) => f.moduleId)).toEqual(['region-module', 'sg-module']);
    });

    it('empties an uncommitted module on the next generate; its destroy can only be warned about', async () => {
      // The user generated (and possibly applied), but never committed.
      const { app, sg } = await testModes.createResourceGraph();
      await testModes.generate(app, { outputDir: testModes.outputDir });

      // The user deletes sg from the yaml and reruns. A fresh boot stages vpc + igw only — octo has
      // no committed record of sg, so there is no delete diff for it anywhere.
      testModes.resourceDataRepository.removeNewResource(sg);
      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['add:igw-1', 'add:vpc-1']);

      // sg-module is emptied from the previous generate's memory (models.json): if the user had
      // applied it, the next apply destroys sg; if not, the apply is a no-op — either way a
      // `run-all apply` can no longer redeploy the deleted module.
      const sgMainTf = await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8');
      expect(sgMainTf).not.toContain('resource "');
      const sgTerragruntHcl = await readFile(join(testModes.outputDir, 'sg-module', 'terragrunt.hcl'), 'utf-8');
      expect(sgTerragruntHcl).toContain('remote_state {');

      // validate: with no committed addresses for sg, the destroy in the emptied folder's plan
      // cannot be verified — it is warned about, never an error.
      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['delete'], address: 'aws_security_group.sg-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);
      expect(
        validation.warnings.some((w) => w.moduleId === 'sg-module' && w.message.includes('does not track')),
      ).toBe(true);
    });

    it('destroys a module whose provider was deleted from intent in the same edit', async () => {
      testModes.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      testModes.registerTerraformProvider('aws', '111111111', 'us-east-1');
      const { app } = await testModes.createProviderBoundResourceGraph({
        accountId: '111111111',
        regionId: 'us-east-1',
      });
      await testModes.generate(app, { outputDir: testModes.outputDir });
      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      await testModes.commit(app, { outputs: testModes.outputs });

      // The user deletes the module AND its provider from octo.yml in one edit. The emptied folder
      // still renders the provider — from the committed record, not from octo.yml.
      testModes.clearTerraformRegistrations();
      const diffs = await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(resourceChanges(diffs)).toEqual(['delete:vpc-1']);
      const mainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
      expect(mainTf).toContain('provider "aws"');
      expect(mainTf).toContain('alias = "_111111111-us-east-1"');
      expect(mainTf).not.toContain('resource "');

      // validate: the destroy is verified via the committed addresses.
      testModes.plans.clear();
      testModes.writePlan('region-module', [{ actions: ['delete'], address: 'aws_vpc.vpc-1' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toEqual([]);
      expect(validation.pass).toBe(true);

      // The destroy commit demands nothing (no filled folders); supplying the emptied folder's
      // (empty) outputs is tracked, not warned. The committed state ends empty.
      testModes.outputs.clear();
      testModes.writeTfState('region-module', {});
      const { warnings } = await testModes.commit(app, { outputs: testModes.outputs });
      expect(warnings).toEqual([]);
      const { terraformFolders, terraformResources } = await testModes.getCommittedTerraformState();
      expect(terraformFolders).toEqual([]);
      expect(terraformResources).toEqual([]);
    });

    it('preserves a hand-written folder, only warning about it in validate and commit', async () => {
      const { app } = await testModes.createResourceGraph();

      // The user keeps their own terragrunt folder next to octo's.
      const handWrittenDir = join(testModes.outputDir, 'hand-written-module');
      await mkdir(handWrittenDir, { recursive: true });
      const handWrittenHcl = 'resource "aws_s3_bucket" "mine" {}\n';
      await writeFile(join(handWrittenDir, 'main.tf'), handWrittenHcl, 'utf-8');

      // generate never touches it.
      await testModes.generate(app, { outputDir: testModes.outputDir });
      expect(await readFile(join(handWrittenDir, 'main.tf'), 'utf-8')).toBe(handWrittenHcl);

      // validate: its plan is excluded from diffing — a warning, never an error.
      testModes.writePlan('region-module', [
        { actions: ['create'], address: 'aws_vpc.vpc-1' },
        { actions: ['create'], address: 'null_resource.igw-1' },
      ]);
      testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);
      testModes.writePlan('hand-written-module', [{ actions: ['create'], address: 'aws_s3_bucket.mine' }]);
      const validation = await testModes.validate(app, { plans: testModes.plans });
      expect(validation.errors).toEqual([]);
      expect(validation.pass).toBe(true);
      expect(
        validation.warnings.some((w) => w.moduleId === 'hand-written-module' && w.message.includes('does not track')),
      ).toBe(true);

      // commit: its outputs are ignored with the same warning; the tracked modules commit fine.
      testModes.writeTfState('region-module', REGION_TFSTATE);
      testModes.writeTfState('sg-module', SG_TFSTATE);
      testModes.writeTfState('hand-written-module', { mine: 'bucket-0real' });
      const { warnings } = await testModes.commit(app, { outputs: testModes.outputs });
      expect(warnings).toEqual([
        { message: expect.stringContaining('"hand-written-module", which octo does not track'), moduleId: 'hand-written-module' },
      ]);
      const actualVpc = testModes.resourceDataRepository
        .getActualResourcesByProperties()
        .find((r) => r.resourceId === 'vpc-1')!;
      expect(actualVpc.response['VpcId']).toBe('vpc-0real');
    });
  });
});
