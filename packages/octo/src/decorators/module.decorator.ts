import { AModule } from '../functions/module/module.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from './container.js';

export function Module(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ModelSerializationService).then((modelSerializationService) => {
      Container.get<AModule>(constructor.name).then((module) => {
        modelSerializationService.registerModule(module);
      });
    });
  };
}
