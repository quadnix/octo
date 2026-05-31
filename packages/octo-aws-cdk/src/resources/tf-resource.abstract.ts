import { AResource, type BaseResourceSchema, Container } from '@quadnix/octo';

export abstract class ATFResource<S extends BaseResourceSchema, T extends AResource<any, any>> extends AResource<S, T> {
  protected readonly container: Container = Container.getInstance();

  abstract toHCL(): Promise<void>;
}
