import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/Alb
 */
export class AlbSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: AlbSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.IpAddressType,
      value.Name,
      value.Scheme,
      value.Type,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    IpAddressType: 'dualstack';
    Name: string;
    Scheme: 'internet-facing';
    Type: 'application';
  }>();

  @Validate({
    destruct: (value: AlbSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.DNSName) {
        subjects.push(value.DNSName);
      }
      if (value.LoadBalancerArn) {
        subjects.push(value.LoadBalancerArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    DNSName?: string;
    LoadBalancerArn?: string;
  }>();
}
