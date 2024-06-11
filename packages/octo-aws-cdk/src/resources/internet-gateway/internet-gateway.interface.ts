import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IInternetGatewayProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
    }
  > {}

export interface IInternetGatewayResponse
  extends ModifyInterface<
    IResource['response'],
    {
      InternetGatewayId: string;
    }
  > {}
