import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from './container.js';

export function Model(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ModelSerializationService)
      .then((modelSerializationService) => {
        modelSerializationService.registerClass(constructor.name, constructor);
      })
      .catch((error) => {
        console.error(error);
      });
  };
}
