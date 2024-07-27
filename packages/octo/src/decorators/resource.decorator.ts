import { RegistrationErrorEvent } from '../events/error.event.js';
import { EventService } from '../services/event/event.service.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Container } from './container.js';

export function Resource(): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(ResourceSerializationService)
      .then((resourceSerializationService) => {
        resourceSerializationService.registerClass(constructor.name, constructor);
      })
      .catch((error) => {
        EventService.getInstance().emit(new RegistrationErrorEvent(error));
      });
  };
}
