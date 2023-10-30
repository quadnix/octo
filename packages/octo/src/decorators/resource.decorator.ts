import { Container } from 'typedi';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';

export function Resource(registerAs: any): (constructor: any) => void {
  return function (constructor: any) {
    const resourceSerializationService = Container.get(ResourceSerializationService);
    resourceSerializationService.registerClass(constructor.name, registerAs);
  };
}
