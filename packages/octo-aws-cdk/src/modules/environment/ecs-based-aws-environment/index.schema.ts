import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsClusterAnchorSchema } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.schema.js';
import { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import { AwsEnvironmentSchema } from './models/environment/aws.environment.schema.js';

export { AwsEnvironmentSchema, EcsClusterAnchorSchema, EcsClusterSchema };

export class AwsEnvironmentModuleSchema {
  @Validate({ options: { minLength: 1 } })
  environmentName = Schema<string>();

  @Validate([
    {
      destruct: (value: Record<string, string>): string[] => Object.keys(value),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: Record<string, string>): string[] => Object.values(value),
      options: { regex: /^.+$/ },
    },
  ])
  environmentVariables? = Schema<Record<string, string>>({});

  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();
}
