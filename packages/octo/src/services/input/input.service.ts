import type { Constructable, UnknownModel } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import type { ANode } from '../../functions/node/node.abstract.js';

export class InputService {
  private readonly inputs: { [key: string]: string } = {};

  private readonly models: { [key: string]: { contextParts: { [key: string]: string }; model: UnknownModel }[] } = {};

  getInput(name: string): string {
    return this.inputs[name];
  }

  getModel<T extends UnknownModel>(
    type: Constructable<T>,
    filters: { key: string; value: string }[] = [],
  ): T | undefined {
    if (!this.models[(type as unknown as typeof ANode).NODE_NAME]) {
      return undefined;
    }

    const models = this.models[(type as unknown as typeof ANode).NODE_NAME].filter((m) =>
      filters.every((c) => m.contextParts[c.key] === c.value),
    );
    if (models.length === 0) {
      return undefined;
    } else if (models.length === 1) {
      return models[0].model as T;
    } else {
      throw new Error('More than one models found! Use more filters to narrow it down.');
    }
  }

  registerInputs(inputs: { [key: string]: string }): void {
    for (const key in inputs) {
      if (this.inputs.hasOwnProperty(key)) {
        throw new Error(`Input "${key}" has already been registered!`);
      }
      this.inputs[key] = inputs[key];
    }
  }

  registerModels(models: UnknownModel[]): void {
    for (const model of models) {
      if (!this.models[(model.constructor as typeof ANode).NODE_NAME]) {
        this.models[(model.constructor as typeof ANode).NODE_NAME] = [];
      }

      const contextParts = model
        .getContext()
        .split(',')
        .reduce((accumulator, current) => {
          const [key, value] = current.split('=');
          accumulator[key] = value;
          return accumulator;
        }, {});
      this.models[(model.constructor as typeof ANode).NODE_NAME].push({ contextParts, model });
    }
  }
}

@Factory<InputService>(InputService)
export class InputServiceFactory {
  private static instance: InputService;

  static async create(forceNew: boolean = false): Promise<InputService> {
    if (!this.instance || forceNew) {
      this.instance = new InputService();
    }
    return this.instance;
  }
}
