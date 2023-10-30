import { Container } from 'typedi';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';

export function Model(registerAs: any): (constructor: any) => void {
  return function (constructor: any) {
    const modelSerializationService = Container.get(ModelSerializationService);
    modelSerializationService.registerClass(constructor.name, registerAs);
  };
}
