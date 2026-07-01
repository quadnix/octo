import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'path';
import { RefusingTfResource, TestModes } from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import { generate } from './generate.mode.js';

describe('generate()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  it('should write one folder per module with cross-module wiring', async () => {
    const { app } = await testModes.createResourceGraph();

    // generate returns the raw resource diffs (DiffMetadata[][]); octo-build consumes them directly.
    const resourceDiffs = await generate(app, { outputDir: testModes.outputDir });

    expect(
      resourceDiffs
        .flat()
        .filter((d) => d.action === 'add' && d.field === 'resourceId')
        .map((d) => d.node.getContext()),
    ).toEqual([expect.stringContaining('vpc-1'), expect.stringContaining('igw-1'), expect.stringContaining('sg-1')]);

    // One folder per module is written (verified further by the per-file reads below).
    expect(existsSync(join(testModes.outputDir, 'region-module'))).toBe(true);
    expect(existsSync(join(testModes.outputDir, 'sg-module'))).toBe(true);

    const regionMainTf = await readFile(join(testModes.outputDir, 'region-module', 'main.tf'), 'utf-8');
    expect(regionMainTf).toContain('resource "aws_vpc" "vpc-1"');
    expect(regionMainTf).toContain('resource "null_resource" "igw-1"');
    expect(regionMainTf).toContain('vpc-1.VpcId=${aws_vpc.vpc-1.id}');

    const regionOutputsTf = await readFile(join(testModes.outputDir, 'region-module', 'outputs.tf'), 'utf-8');
    expect(regionOutputsTf).toContain('output "vpc-1-VpcId"');
    expect(regionOutputsTf).toContain('output "igw-1"'); // External resource publishes whole response.

    const sgMainTf = await readFile(join(testModes.outputDir, 'sg-module', 'main.tf'), 'utf-8');
    expect(sgMainTf).toContain('igw_id = var.igw_1.igwId');

    const sgVariablesTf = await readFile(join(testModes.outputDir, 'sg-module', 'variables.tf'), 'utf-8');
    expect(sgVariablesTf).toContain('variable "igw_1" {\n  type = map(string)\n}');

    const sgTerragruntHcl = await readFile(join(testModes.outputDir, 'sg-module', 'terragrunt.hcl'), 'utf-8');
    expect(sgTerragruntHcl).toContain('dependency "region-module"');
    expect(sgTerragruntHcl).toContain('"igw-1" = { igwId = "mock-igw-1-igwId" }');
    expect(sgTerragruntHcl).toContain('igw_1 = dependency.region-module.outputs["igw-1"]');

    expect(existsSync(join(testModes.outputDir, 'region-module', 'terragrunt.hcl'))).toBe(true);
  });

  it('should preserve unrelated folders and state on regenerate', async () => {
    const { app } = await testModes.createResourceGraph();
    await generate(app, { outputDir: testModes.outputDir });

    // Terraform state and a hand-written file live alongside the generated folders.
    await writeFile(join(testModes.outputDir, 'stale-file.hcl'), 'stale', 'utf-8');
    await writeFile(join(testModes.outputDir, 'region-module', 'terraform.tfstate'), '{}', 'utf-8');

    // A regenerate is a second, fresh octo process — reset the shared terraform service to mirror it.
    await testModes.simulateFreshProcess();
    await generate(app, { outputDir: testModes.outputDir });

    expect(existsSync(join(testModes.outputDir, 'stale-file.hcl'))).toBe(true);
    expect(existsSync(join(testModes.outputDir, 'region-module', 'terraform.tfstate'))).toBe(true);
  });

  it('should refuse generation and write no files when a resource diff throws', async () => {
    RefusingTfResource.toHCLInvocations.length = 0;

    // Commit a graph whose resource refuses property updates, then re-stage it with a changed
    // property so the next diff throws.
    const { app } = await testModes.createRefusingResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    testModes.resourceDataRepository.addNewResource(new RefusingTfResource('refuse-1', { CidrBlock: '10.9.0.0/16' }));

    await expect(generate(app, { outputDir: testModes.outputDir })).rejects.toThrow(/Cannot update RefusingTfResource/);

    // The diff gated generation: toHCL never ran and no module folder was written.
    expect(RefusingTfResource.toHCLInvocations).toHaveLength(0);
    expect(existsSync(join(testModes.outputDir, 'region-module'))).toBe(false);
  });

  it('should not persist any octo state', async () => {
    const { app } = await testModes.createResourceGraph();

    await generate(app, { outputDir: testModes.outputDir });

    // A fresh repository diff still shows all adds - nothing was committed.
    const diffs = await testModes.resourceDataRepository.diff();
    expect(diffs.filter((d) => d.action === 'add' && d.field === 'resourceId')).toHaveLength(3);
  });
});
