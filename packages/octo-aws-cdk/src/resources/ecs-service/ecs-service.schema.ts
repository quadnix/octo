import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcsServiceSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    desiredCount: number;
    serviceName: string;
  }>();

  override response = Schema<{
    serviceArn: string;
  }>();
}

export class EcsTaskDefinitionEcsClusterSchema extends BaseResourceSchema {
  override properties = Schema<{
    clusterName: string;
  }>();

  override response = Schema<{
    clusterArn: string;
  }>();
}
export type EcsTaskDefinitionEcsCluster = AResource<EcsTaskDefinitionEcsClusterSchema, any>;

export class EcsServiceTaskDefinitionSchema extends BaseResourceSchema {
  override response = Schema<{
    taskDefinitionArn: string;
  }>();
}
export type EcsServiceTaskDefinition = AResource<EcsServiceTaskDefinitionSchema, any>;

export class EcsServiceSecurityGroupSchema extends BaseResourceSchema {
  override response = Schema<{
    GroupId: string;
  }>();
}
export type EcsServiceSecurityGroup = AResource<EcsServiceSecurityGroupSchema, any>;

export class EcsServiceSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
export type EcsServiceSubnet = AResource<EcsServiceSubnetSchema, any>;
