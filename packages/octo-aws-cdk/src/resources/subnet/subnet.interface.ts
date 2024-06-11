import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface ISubnetProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      AvailabilityZone: string;
      awsRegionId: string;
      CidrBlock: string;
    }
  > {}

export interface ISubnetResponse
  extends ModifyInterface<
    IResource['response'],
    {
      SubnetId: string;
    }
  > {}
