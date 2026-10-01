import { DependencyRelationship, DiffAction, MatchingResource } from '@quadnix/octo';
import { EcrImage } from '../ecr/index.js';
import type { EcrImageSchema } from '../ecr/index.schema.js';
import { EcrImageTag } from '../ecr-image-tag/index.js';
import type { EcrImageTagSchema } from '../ecr-image-tag/index.schema.js';
import { IamRole } from '../iam-role/index.js';
import type { IamRoleSchema } from '../iam-role/index.schema.js';
import { EcsTaskDefinition } from './ecs-task-definition.resource.js';

const IMAGE_URI = '123456789012.dkr.ecr.us-east-1.amazonaws.com/family/image:0.0.1';

function createEcrImageTag(): EcrImageTag {
  const ecrImage = new EcrImage('ecr-us-east-1-family/image', {
    awsAccountId: '123456789012',
    awsRegionId: 'us-east-1',
    imageId: 'family/image',
  });

  return new EcrImageTag(
    'ecr-image-tag-us-east-1-family/image-0-0-1',
    {
      architecture: 'x86_64',
      awsAccountId: '123456789012',
      awsRegionId: 'us-east-1',
      dockerfileDirectory: 'images/nginx',
      dockerfileName: 'Dockerfile',
      imageId: 'family/image',
      imageTag: '0.0.1',
    },
    [new MatchingResource<EcrImageSchema>(ecrImage)],
  );
}

function createIamRole(): IamRole {
  return new IamRole('iam-role-ServerRole-backend', {
    awsAccountId: '123456789012',
    policies: [{ policy: 'ecs-tasks.amazonaws.com', policyId: 'assume-role', policyType: 'assume-role-policy' }],
    rolename: 'ServerRole-backend',
  });
}

function createEcsTaskDefinition(
  parents: [MatchingResource<IamRoleSchema>, ...MatchingResource<EcrImageTagSchema>[]],
): EcsTaskDefinition {
  return new EcsTaskDefinition(
    'ecs-task-definition-backend',
    {
      architecture: 'x86_64',
      awsAccountId: '123456789012',
      awsRegionId: 'us-east-1',
      cpu: 256,
      deploymentTag: '0.0.1',
      environmentVariables: [],
      family: 'qa-private-backend',
      images: [{ command: [], essential: true, name: 'backend', ports: [], uri: IMAGE_URI }],
      memory: 512,
    },
    parents,
  );
}

describe('EcsTaskDefinition UT', () => {
  describe('constructor()', () => {
    it('should order itself against the published images it runs', () => {
      const ecrImageTag = createEcrImageTag();
      const ecsTaskDefinition = createEcsTaskDefinition([
        new MatchingResource<IamRoleSchema>(createIamRole()),
        new MatchingResource<EcrImageTagSchema>(ecrImageTag),
      ]);

      const taskDefinitionToImageTag = ecsTaskDefinition.getDependency(ecrImageTag, DependencyRelationship.CHILD)!;
      const imageTagToTaskDefinition = ecrImageTag.getDependency(ecsTaskDefinition, DependencyRelationship.PARENT)!;

      // The image is published before the task definition names it.
      expect(
        taskDefinitionToImageTag.hasMatchingBehavior('resourceId', DiffAction.ADD, 'resourceId', DiffAction.ADD),
      ).toBe(true);
      expect(
        taskDefinitionToImageTag.hasMatchingBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD),
      ).toBe(true);
      expect(
        taskDefinitionToImageTag.hasMatchingBehavior('resourceId', DiffAction.REPLACE, 'resourceId', DiffAction.ADD),
      ).toBe(true);

      // The task definition stops naming the image before the image is deleted.
      expect(
        imageTagToTaskDefinition.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE),
      ).toBe(true);
      expect(
        imageTagToTaskDefinition.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.REPLACE),
      ).toBe(true);
      expect(
        imageTagToTaskDefinition.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.DELETE),
      ).toBe(true);
    });
  });

  describe('diff()', () => {
    it('should not report a task definition update when an image it runs arrives or leaves', async () => {
      const previous = createEcsTaskDefinition([new MatchingResource<IamRoleSchema>(createIamRole())]);
      const current = createEcsTaskDefinition([
        new MatchingResource<IamRoleSchema>(createIamRole()),
        new MatchingResource<EcrImageTagSchema>(createEcrImageTag()),
      ]);

      expect(await current.diff(previous)).toEqual([]);
    });
  });
});
