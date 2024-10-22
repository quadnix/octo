import type { ActionInputs } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';

export class InputService {
  private readonly inputs: ActionInputs = {};

  constructor(private readonly resourceDataRepository: ResourceDataRepository) {}

  getInput(name: string): (typeof this.inputs)[keyof typeof this.inputs] {
    if (name.startsWith('resource')) {
      const resourceId = name.substring('resource.'.length);
      return this.resourceDataRepository.getNewResourceById(resourceId)!;
    } else {
      return this.inputs[name];
    }
  }

  registerInputs(inputs: ActionInputs): void {
    for (const key in inputs) {
      this.inputs[key] = inputs[key];
    }
  }
}

@Factory<InputService>(InputService)
export class InputServiceFactory {
  private static instance: InputService;

  static async create(): Promise<InputService> {
    const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);
    if (!this.instance) {
      this.instance = new InputService(resourceDataRepository);
    }
    return this.instance;
  }
}
