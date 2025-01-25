import type { UnknownModel, UnknownModule, UnknownOverlay, UnknownResource } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { InputRegistrationError, InputResolutionError } from '../../errors/index.js';
import { Container } from '../../functions/container/container.js';
import type { ANode } from '../../functions/node/node.abstract.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { ObjectUtility } from '../../utilities/object/object.utility.js';

export class InputService {
  private inputs: { [key: string]: unknown } = {};

  private metadata: { [key: string]: unknown } = {};

  private models: { [key: string]: UnknownModel } = {};

  private modules: { [key: string]: UnknownModule } = {};

  private overlays: { [key: string]: string } = {};

  private resources: { [key: string]: string } = {};

  constructor(
    private readonly overlayDataRepository: OverlayDataRepository,
    private readonly resourceDataRepository: ResourceDataRepository,
  ) {}

  getAllNodeKeys(moduleId: string): string[] {
    const keys: string[] = [];

    for (const key of Object.keys(this.models)) {
      if (key.startsWith(`${moduleId}.model`)) {
        keys.push(key);
      }
    }

    for (const key of Object.keys(this.overlays)) {
      if (key.startsWith(`${moduleId}.overlay`)) {
        keys.push(key);
      }
    }

    for (const key of Object.keys(this.resources)) {
      if (key.startsWith(`${moduleId}.resource`)) {
        keys.push(key);
      }
    }

    return keys;
  }

  getMetadataKeys(moduleId: string): string[] {
    return Object.keys(this.metadata).filter((key) => key.startsWith(`${moduleId}.metadata`));
  }

  getModule<M extends UnknownModule>(moduleId: string): M | undefined {
    const moduleKey = `${moduleId}.module`;
    return this.modules[moduleKey] as M | undefined;
  }

  getModuleIdFromModel(model: UnknownModel): string {
    const modelContext = model.getContext();
    const [key] = Object.entries(this.models).find(([, m]) => m.getContext() === modelContext)!;
    return key.split('.')[0];
  }

  getModuleIdFromOverlay(overlay: UnknownOverlay): string {
    const overlayContext = overlay.getContext();
    const [key] = Object.entries(this.overlays).find(([, o]) => o === overlayContext)!;
    return key.split('.')[0];
  }

  getModuleIdFromResource(resource: UnknownResource): string {
    const context = resource.getContext();
    const [key] = Object.entries(this.resources).find(([, r]) => r === context)!;
    return key.split('.')[0];
  }

  getModuleResources(moduleId: string): UnknownResource[] {
    const resourceKeys: string[] = [];

    for (const key of Object.keys(this.resources)) {
      if (key.startsWith(`${moduleId}.resource`)) {
        resourceKeys.push(this.resources[key]);
      }
    }

    return resourceKeys.map((r) => this.resourceDataRepository.getNewResourceByContext(r)!);
  }

  /**
   * Registers the inputs passed to an instance of module.
   * It maps the input key provided to the module with the input value.
   * The value can be a direct value, or can be a reference "${{var}}" to
   * another input, module, overlay, or resource.
   */
  registerInput(moduleId: string, key: string, value: unknown): void {
    const inputKey = `${moduleId}.input.${key}`;
    if (this.inputs.hasOwnProperty(inputKey)) {
      throw new InputRegistrationError('Input has already been registered!', inputKey);
    }
    this.inputs[inputKey] = value;
  }

  registerMetadata(moduleId: string, key: string, value: unknown): void {
    const metadataKey = `${moduleId}.metadata.${key}`;
    if (this.metadata.hasOwnProperty(metadataKey)) {
      throw new InputRegistrationError('Metadata has already been registered!', metadataKey);
    }
    this.metadata[metadataKey] = value;
  }

  /**
   * Registers the model generated by an instance of module.
   * The key is a reference to the model generated by the module, and maps directly to the model instance.
   */
  registerModel(moduleId: string, model: UnknownModel): void {
    const modelKey = `${moduleId}.model.${(model.constructor as typeof ANode).NODE_NAME}`;
    if (this.models.hasOwnProperty(modelKey)) {
      throw new InputRegistrationError('Model has already been registered!', modelKey);
    }
    this.models[modelKey] = model;
  }

  registerModule(moduleId: string, module: UnknownModule): void {
    const moduleKey = `${moduleId}.module`;
    if (this.modules.hasOwnProperty(moduleKey)) {
      throw new InputRegistrationError('Module has already been registered!', moduleKey);
    }
    this.modules[moduleKey] = module;
  }

  /**
   * Registers the overlay generated by an instance of module.
   * The key is a reference to the overlay generated by the module, and maps to the overlay context.
   */
  registerOverlay(moduleId: string, overlay: UnknownOverlay): void {
    const overlayKey = `${moduleId}.overlay.${overlay.overlayId}`;
    if (this.overlays.hasOwnProperty(overlayKey)) {
      throw new InputRegistrationError('Overlay has already been registered!', overlayKey);
    }
    this.overlays[overlayKey] = overlay.getContext();
  }

  /**
   * Registers the resource generated by an instance of module.
   * The key is a reference to the resource generated by the module, and maps to the resource context.
   */
  registerResource(moduleId: string, resource: UnknownResource): void {
    const resourceKey = `${moduleId}.resource.${resource.resourceId}`;
    if (this.resources.hasOwnProperty(resourceKey)) {
      throw new InputRegistrationError('Resource has already been registered!', resourceKey);
    }
    this.resources[resourceKey] = resource.getContext();
  }

  resolve(key: string): unknown | undefined {
    if (key.split('.')[1] !== 'metadata') {
      key = this.resolveInputKey(key);
    }
    const keyParts = key.split('.');

    switch (keyParts[1]) {
      case 'input':
        const input = this.inputs[key];
        if (typeof input === 'object' && input !== null) {
          ObjectUtility.onEveryNestedKey(input, (parent, currentKey, currentValue) => {
            parent[currentKey] = this.resolveInputValue(currentValue);
          });
        }
        return input;
      case 'metadata':
        return this.metadata[key];
      case 'model':
        const model = this.models[keyParts.slice(0, 3).join('.')];
        if (!model) {
          return undefined;
        }
        return this.resolveObjectPath(model, keyParts.slice(3).join('.'));
      case 'overlay':
        const overlayContext = this.overlays[keyParts.slice(0, 3).join('.')];
        const overlay = this.overlayDataRepository.getByContext(overlayContext);
        if (!overlay) {
          return undefined;
        }
        return this.resolveObjectPath(overlay, keyParts.slice(3).join('.'));
      case 'resource':
        const resourceContext = this.resources[keyParts.slice(0, 3).join('.')];
        const resource = this.resourceDataRepository.getNewResourceByContext(resourceContext);
        if (!resource) {
          return undefined;
        }
        return this.resolveObjectPath(resource, keyParts.slice(3).join('.'));
      default:
        return undefined;
    }
  }

  /**
   * Given an input key, returns the resolved input key.
   * An input key is resolved when the value is not a pointer to another input.
   * Otherwise, an input key could be referencing another input, module, overlay, or resource.
   * E.g. module.input.key = ${{another_module.input.key}}
   * This method traverses the value of the input key recursively until it is resolved.
   */
  private resolveInputKey(inputKey: string, maxRecursion = 15, originalInputKey?: string): string {
    if (maxRecursion === 0) {
      throw new InputResolutionError('Input could not be resolved!', originalInputKey || inputKey);
    }

    const value = this.inputs[inputKey];

    // If an input key is not found, or is not a string, it is either undefined, or is a non-input value.
    // In this case, the value is resolved and the current input key is returned.
    if (!value || typeof value !== 'string') {
      return inputKey;
    }

    // An input key without the ${{var}} pattern is already resolved.
    const pattern = value.match(/^\$\{\{(.+)}}$/);
    if (!pattern) {
      return inputKey;
    }

    return this.resolveInputKey(pattern[1].trim(), maxRecursion - 1, originalInputKey || inputKey);
  }

  private resolveInputValue(inputValue: unknown, maxRecursion = 15, originalInputValue?: unknown): unknown {
    if (maxRecursion === 0) {
      throw new InputResolutionError('Input could not be resolved!', (originalInputValue || inputValue) as string);
    }

    // If an input value is not found, or is not a string, it is either undefined, or is a non-input value.
    // In this case, the value is resolved and that current input value is returned.
    if (!inputValue || typeof inputValue !== 'string') {
      return inputValue;
    }

    // An input value without the ${{var}} pattern is already resolved.
    const pattern = inputValue.match(/^\$\{\{(.+)}}$/);
    if (!pattern) {
      return inputValue;
    }

    return this.resolveInputValue(this.resolve(pattern[1].trim()), maxRecursion - 1, originalInputValue || inputValue);
  }

  // https://stackoverflow.com/a/69459511/1834562
  private resolveObjectPath(subject: object, path: string): any {
    if (!path.length) {
      return subject;
    }

    return path.split('.').reduce((obj, key) => obj && obj[key], subject);
  }
}

@Factory<InputService>(InputService)
export class InputServiceFactory {
  private static instance: InputService;

  static async create(forceNew: boolean = false): Promise<InputService> {
    const overlayDataRepository = await Container.getInstance().get(OverlayDataRepository);
    const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);

    if (!this.instance) {
      this.instance = new InputService(overlayDataRepository, resourceDataRepository);
    }

    if (forceNew) {
      this.instance['inputs'] = {};
      this.instance['metadata'] = {};
      this.instance['models'] = {};
      this.instance['modules'] = {};
      this.instance['overlays'] = {};
      this.instance['resources'] = {};
    }

    return this.instance;
  }
}
