import { BaseResourceSchema, Schema } from '@quadnix/octo';

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

export class EcsServiceEcsClusterSchema extends BaseResourceSchema {
  override properties = Schema<{
    clusterName: string;
  }>();

  override response = Schema<{
    clusterArn: string;
  }>();
}

export class EcsServiceTaskDefinitionSchema extends BaseResourceSchema {
  override response = Schema<{
    taskDefinitionArn: string;
  }>();
}

export class EcsServiceSecurityGroupSchema extends BaseResourceSchema {
  override response = Schema<{
    GroupId: string;
  }>();
}

export class EcsServiceSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
