import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class EcsServiceLoadBalancerSchema {
  @Validate({ options: { minLength: 1 } })
  containerName = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  containerPort = Schema<number>();

  @Validate({ options: { minLength: 1 } })
  targetGroupName = Schema<string>();
}

export class EcsServiceSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: EcsServiceSchema['properties']): string[] => [
        value.assignPublicIp,
        value.awsAccountId,
        value.awsRegionId,
        String(value.desiredCount),
        value.serviceName,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcsServiceSchema['properties']): EcsServiceLoadBalancerSchema[] => value.loadBalancers,
      options: { isSchema: { schema: EcsServiceLoadBalancerSchema } },
    },
  ])
  override properties = Schema<{
    assignPublicIp: 'ENABLED' | 'DISABLED';
    awsAccountId: string;
    awsRegionId: string;
    desiredCount: number;
    loadBalancers: EcsServiceLoadBalancerSchema[];
    serviceName: string;
  }>();

  @Validate({
    destruct: (value: EcsServiceSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.serviceArn) {
        subjects.push(value.serviceArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    serviceArn?: string;
  }>();
}
