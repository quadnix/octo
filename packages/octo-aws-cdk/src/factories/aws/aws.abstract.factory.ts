export class AwsFactory {
  private static instances: { [key: string]: any } = {};

  static async create<T>(awsRegionId: string): Promise<T> {
    if (!awsRegionId) {
      throw new Error(`Failed to create instance of ${this.name} due to insufficient arguments!`);
    }

    let instance: T = this.instances[awsRegionId];

    if (!instance) {
      instance = this.createInstance(awsRegionId);
      this.instances[awsRegionId] = instance;
    }

    return instance;
  }

  static createInstance<T>(...args: unknown[]): T {
    if (args.length > 1) {
      throw new Error('Too many args in createInstance()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
