import { jest } from '@jest/globals';
import { ActionEvent, type Event } from '../../events/index.js';
import { App } from '../../models/app/app.model.js';
import { EventService } from '../../services/event/event.service.js';
import type { Container } from '../container/container.js';
import { TestContainer } from '../container/test-container.js';
import { Diff, DiffAction } from '../diff/diff.js';
import { ANodeAction } from './node-action.abstract.js';

class TestAction extends ANodeAction {
  constructor() {
    super();
  }
}

describe('ANodeAction UT', () => {
  let container: Container;
  let events: ActionEvent[];

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500, force: true });

    events = [];
    jest.spyOn(EventService.getInstance(), 'emit').mockImplementation((event: Event<unknown>) => {
      if (event instanceof ActionEvent) {
        events.push(event);
      }
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await TestContainer.reset();
  });

  describe('log()', () => {
    it('should emit the message with the diff it is given', () => {
      const diff = new Diff(new App('test'), DiffAction.ADD, 'name', 'test');

      new TestAction().log(diff, 'hello', { key: 'value' });

      expect(events.map((event) => [event.name, event.payload])).toEqual([
        [
          'TestAction',
          {
            diff: { action: DiffAction.ADD, field: 'name', node: 'app=test' },
            message: 'hello',
            metadata: { key: 'value' },
          },
        ],
      ]);
    });
  });
});
