/**
 * @internal
 */
export class AwsRegionUtility {
  /**
   * Splits an octo region id naming one availability zone, `aws-us-east-1a`, into the zone,
   * `us-east-1a`, and the AWS region it is in, `us-east-1`.
   *
   * @internal
   */
  static getRegionIdParts(regionId: string): { awsRegionAZ: string; awsRegionId: string } {
    const regionIdParts = regionId.split('-');
    regionIdParts.shift();
    const awsRegionAZ = regionIdParts.join('-');
    const awsRegionId = awsRegionAZ.substring(0, awsRegionAZ.length - 1);
    return { awsRegionAZ, awsRegionId };
  }
}
