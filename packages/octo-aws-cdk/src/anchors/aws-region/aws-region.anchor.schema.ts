import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class AwsRegionAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value: AwsRegionAnchorSchema['properties']): string[] => [value.awsRegionId, value.regionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsRegionId: string;
    regionId: string;
  }>();
}
