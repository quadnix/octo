export class AwsFactory {
  private static instances: { [key: string]: { [key: string]: any } } = {};

  static async create<T>(awsRegionId: string): Promise<T> {
    if (!awsRegionId) {
      throw new Error(`Failed to create instance of ${this.name} due to insufficient arguments!`);
    }
    if (!this.instances[this.name]) {
      this.instances[this.name] = {};
    }

    let instance: T = this.instances[this.name][awsRegionId];

    if (!instance) {
      instance = this.createInstance(awsRegionId);
      this.instances[this.name][awsRegionId] = instance;
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
