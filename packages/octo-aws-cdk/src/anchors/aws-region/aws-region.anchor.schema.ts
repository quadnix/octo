import { BaseAnchorSchema, type Region, Schema, Validate } from '@quadnix/octo';

export class AwsRegionAnchorSchema extends BaseAnchorSchema {
  parentInstance: Region;

  @Validate({
    destruct: (value: AwsRegionAnchorSchema['properties']): string[] => [
      ...value.awsRegionAZs,
      value.awsRegionId,
      value.regionId,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsRegionAZs: string[];
    awsRegionId: string;
    regionId: string;
  }>();
}
