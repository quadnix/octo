import {
  type Account,
  type App,
  DiffAssert,
  type Region,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert, type HclShape } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsEfsFilesystemModule } from './index.js';

const BASE_HCL_SHAPE: HclShape = {
  'output.efs-region-test-filesystem-FileSystemArn': {
    value: 'aws_efs_file_system.efs-region-test-filesystem.arn',
  },
  'output.efs-region-test-filesystem-FileSystemId': {
    value: 'aws_efs_file_system.efs-region-test-filesystem.id',
  },
  'resource.aws_efs_backup_policy.efs-region-test-filesystem_backup_policy': {
    backup_policy: {
      status: 'DISABLED',
    },
    depends_on: '[aws_efs_file_system.efs-region-test-filesystem]',
    file_system_id: 'aws_efs_file_system.efs-region-test-filesystem.id',
    provider: 'aws.123-us-east-1',
  },
  'resource.aws_efs_file_system.efs-region-test-filesystem': {
    encrypted: 'false',
    Name: 'test-filesystem',
    performance_mode: 'generalPurpose',
    provider: 'aws.123-us-east-1',
    tags: '{',
    throughput_mode: 'bursting',
  },
};

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsEfsFilesystemModule UT', () => {
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform, BASE_HCL_SHAPE);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['filesystem'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEfsFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureEfsResponseResourceAction",
       ],
     ]
    `);
    hcl.assert();
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasAdded('@octo/efs=efs-region-test-filesystem');
    hcl.assert();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    new DiffAssert(resultDelete.resourceDiffs).hasDeleted('@octo/efs=efs-region-test-filesystem');
    hcl.assertShape({});

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasAdded('@octo/efs=efs-region-test-filesystem');
    hcl.assert();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    new DiffAssert(resultUpdateTags.resourceDiffs).hasTagUpdate('@octo/efs=efs-region-test-filesystem', {
      add: { tag2: 'value2' },
      delete: [],
      update: { tag1: 'value1_1' },
    });
    hcl.assert();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    new DiffAssert(resultDeleteTags.resourceDiffs).hasTagUpdate('@octo/efs=efs-region-test-filesystem', {
      add: {},
      delete: ['tag1', 'tag2'],
      update: {},
    });
    hcl.assert();
  });

  describe('input changes', () => {
    it('should handle filesystemName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEfsFilesystemModule>({
        inputs: {
          filesystemName: 'test-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdateFilesystemName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEfsFilesystemModule>({
        inputs: {
          filesystemName: 'changed-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      });
      const resultUpdateFilesystemName = await testModuleContainer.commit(appUpdateFilesystemName, {
        enableResourceCapture: true,
      });
      new DiffAssert(resultUpdateFilesystemName.resourceDiffs)
        .hasDeleted('@octo/efs=efs-region-test-filesystem')
        .hasAdded('@octo/efs=efs-region-changed-filesystem');
      hcl.assertShape({
        'output.efs-region-changed-filesystem-FileSystemArn': {
          value: 'aws_efs_file_system.efs-region-changed-filesystem.arn',
        },
        'output.efs-region-changed-filesystem-FileSystemId': {
          value: 'aws_efs_file_system.efs-region-changed-filesystem.id',
        },
        'resource.aws_efs_backup_policy.efs-region-changed-filesystem_backup_policy': {
          backup_policy: {
            status: 'DISABLED',
          },
          depends_on: '[aws_efs_file_system.efs-region-changed-filesystem]',
          file_system_id: 'aws_efs_file_system.efs-region-changed-filesystem.id',
          provider: 'aws.123-us-east-1',
        },
        'resource.aws_efs_file_system.efs-region-changed-filesystem': {
          encrypted: 'false',
          Name: 'changed-filesystem',
          performance_mode: 'generalPurpose',
          provider: 'aws.123-us-east-1',
          tags: '{',
          throughput_mode: 'bursting',
        },
      });
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem-1',
      type: AwsEfsFilesystemModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.assert();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem-2',
      type: AwsEfsFilesystemModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    new DiffAssert(resultUpdateModuleId.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('validation', () => {
    it('should validate filesystemName length', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEfsFilesystemModule>({
          inputs: {
            filesystemName: '',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'filesystem',
          type: AwsEfsFilesystemModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "filesystemName" in schema could not be validated!"`);
    });
  });
});
