import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IRouteTableProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      associateWithInternetGateway: boolean;
      awsRegionId: string;
    }
  > {}

export interface IRouteTableResponse
  extends ModifyInterface<
    IResource['response'],
    {
      RouteTableId: string;
      subnetAssociationId: string;
    }
  > {}
