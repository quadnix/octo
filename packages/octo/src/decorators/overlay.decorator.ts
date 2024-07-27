import { RegistrationErrorEvent } from '../events/error.event.js';
import { EventService } from '../services/event/event.service.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from './container.js';

export function Overlay(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ModelSerializationService)
      .then((modelSerializationService) => {
        modelSerializationService.registerClass(constructor.name, constructor);
      })
      .catch((error) => {
        EventService.getInstance().emit(new RegistrationErrorEvent(error));
      });
  };
}
