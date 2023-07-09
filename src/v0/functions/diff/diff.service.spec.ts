import { IAction } from '../../models/action.interface';
import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { Diff, DiffAction } from './diff.model';
import { DiffService } from './diff.service';

describe('DiffService UT', () => {
  describe('setApplyOrder()', () => {
    let setApplyOrder: DiffService['setApplyOrder'];

    beforeEach(() => {
      const service = new DiffService();
      setApplyOrder = service['setApplyOrder'];
      setApplyOrder = setApplyOrder.bind(service);
    });

    it('should not set order for diff that already has an order defined', () => {
      const environment = new Environment('qa');
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      diff.metadata.applyOrder = 1;

      expect(diff.metadata.applyOrder).toBe(1);
      setApplyOrder(diff, [diff]);
      expect(diff.metadata.applyOrder).toBe(1);
    });

    it('should set order 0 for diff with no dependencies', () => {
      const environment = new Environment('qa');
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');

      expect(diff.metadata.applyOrder).toBe(-1);
      setApplyOrder(diff, [diff]);
      expect(diff.metadata.applyOrder).toBe(0);
    });

    it('should set order 0 for diff with dependencies not in current array of diffs', () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');

      expect(diff.metadata.applyOrder).toBe(-1);
      setApplyOrder(diff, [diff]);
      expect(diff.metadata.applyOrder).toBe(0);
    });

    it('should set order 1 for diff with 1 level of dependencies', () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' });

      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
      setApplyOrder(diff1, [diff1, diff2]);
      expect(diff1.metadata.applyOrder).toBe(1);
      expect(diff2.metadata.applyOrder).toBe(0);
    });

    it('should only set order for the diff and its dependencies', () => {
      const region1 = new Region('region-1');
      const region2 = new Region('region-2');
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, region1, 'regionId', DiffAction.ADD);

      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region1, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(region2, DiffAction.ADD, 'regionId', 'region-2');

      setApplyOrder(diff1, [diff1, diff2, diff3]);

      expect(diff1.metadata.applyOrder).toBe(1);
      expect(diff2.metadata.applyOrder).toBe(0);
      expect(diff3.metadata.applyOrder).toBe(-1);
    });

    it('should set order 2 for diff with 2 level of dependencies', () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      environment.addDependency(
        'environmentVariables',
        DiffAction.ADD,
        environment,
        'environmentVariables',
        DiffAction.DELETE,
      );
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' });
      const diff3 = new Diff(environment, DiffAction.DELETE, 'environmentVariables', { key: 'value' });

      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
      expect(diff3.metadata.applyOrder).toBe(-1);
      setApplyOrder(diff1, [diff1, diff2, diff3]);
      expect(diff1.metadata.applyOrder).toBe(2);
      expect(diff2.metadata.applyOrder).toBe(1);
      expect(diff3.metadata.applyOrder).toBe(0);
    });

    it('should throw errors with 1 level of circular dependencies', () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      environment.addDependency('environmentVariables', DiffAction.ADD, environment, 'environmentName', DiffAction.ADD);
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' });

      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
      expect(() => {
        setApplyOrder(diff1, [diff1, diff2]);
      }).toThrowError('Found circular dependencies!');
      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
    });

    it('should throw errors with 2 level of circular dependencies', () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      environment.addDependency(
        'environmentVariables',
        DiffAction.ADD,
        environment,
        'environmentVariables',
        DiffAction.DELETE,
      );
      environment.addDependency(
        'environmentVariables',
        DiffAction.DELETE,
        environment,
        'environmentName',
        DiffAction.ADD,
      );
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' });
      const diff3 = new Diff(environment, DiffAction.DELETE, 'environmentVariables', { key: 'value' });

      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
      expect(diff3.metadata.applyOrder).toBe(-1);
      expect(() => {
        setApplyOrder(diff1, [diff1, diff2, diff3]);
      }).toThrowError('Found circular dependencies!');
      expect(diff1.metadata.applyOrder).toBe(-1);
      expect(diff2.metadata.applyOrder).toBe(-1);
      expect(diff3.metadata.applyOrder).toBe(-1);
    });
  });

  describe('beginTransaction()', () => {
    it('should call the handle for a single diff with no dependencies', async () => {
      const environment = new Environment('qa');
      const diffs: Diff[] = [new Diff(environment, DiffAction.ADD, 'environmentName', 'qa')];

      const testActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'test',
          filter: () => true,
          handle: testActionMock,
          revert: jest.fn(),
        },
      ];

      const diffService = new DiffService();
      diffService.registerActions(actions);

      await diffService.beginTransaction(diffs);

      expect(testActionMock).toHaveBeenCalledTimes(1);
      expect(testActionMock.mock.calls[0][0].length).toBe(1);
      expect(testActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });

      expect(diffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "environmentName",
              "value": "qa",
            },
          ],
        ]
      `);
    });

    it('should call the handles for each diff with no dependencies', async () => {
      const environment = new Environment('qa');
      const diffs: Diff[] = [
        new Diff(environment, DiffAction.ADD, 'environmentName', 'qa'),
        new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' }),
      ];

      const addEnvironmentNameActionMock = jest.fn();
      const addEnvironmentVariablesActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'addEnvironmentName',
          filter: (diff: Diff) => diff.field === 'environmentName',
          handle: addEnvironmentNameActionMock,
          revert: jest.fn(),
        },
        {
          ACTION_NAME: 'addEnvironmentVariables',
          filter: (diff: Diff) => diff.field === 'environmentVariables',
          handle: addEnvironmentVariablesActionMock,
          revert: jest.fn(),
        },
      ];

      const diffService = new DiffService();
      diffService.registerActions(actions);

      await diffService.beginTransaction(diffs);

      expect(addEnvironmentNameActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });

      expect(addEnvironmentVariablesActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentVariables',
        value: { key: 'value' },
      });

      expect(diffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "environmentName",
              "value": "qa",
            },
          ],
          [
            {
              "action": "add",
              "field": "environmentVariables",
              "value": {
                "key": "value",
              },
            },
          ],
        ]
      `);
    });

    it('should call the handles for each diff with 1 level of dependencies', async () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      const diffs: Diff[] = [
        new Diff(environment, DiffAction.ADD, 'environmentName', 'qa'),
        new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' }),
      ];

      const addEnvironmentNameActionMock = jest.fn();
      const addEnvironmentVariablesActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'addEnvironmentName',
          filter: (diff: Diff) => diff.field === 'environmentName',
          handle: addEnvironmentNameActionMock,
          revert: jest.fn(),
        },
        {
          ACTION_NAME: 'addEnvironmentVariables',
          filter: (diff: Diff) => diff.field === 'environmentVariables',
          handle: addEnvironmentVariablesActionMock,
          revert: jest.fn(),
        },
      ];

      const diffService = new DiffService();
      diffService.registerActions(actions);

      await diffService.beginTransaction(diffs);

      expect(addEnvironmentNameActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });

      expect(addEnvironmentVariablesActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentVariables',
        value: { key: 'value' },
      });

      expect(addEnvironmentVariablesActionMock.mock.invocationCallOrder[0]).toBeLessThan(
        addEnvironmentNameActionMock.mock.invocationCallOrder[0],
      );

      expect(diffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "environmentVariables",
              "value": {
                "key": "value",
              },
            },
          ],
          [
            {
              "action": "add",
              "field": "environmentName",
              "value": "qa",
            },
          ],
        ]
      `);
    });

    it('should call the handles for each diff with 2 level of dependencies', async () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      environment.addDependency(
        'environmentVariables',
        DiffAction.ADD,
        environment,
        'environmentVariables',
        DiffAction.DELETE,
      );
      const diffs: Diff[] = [
        new Diff(environment, DiffAction.ADD, 'environmentName', 'qa'),
        new Diff(environment, DiffAction.ADD, 'environmentVariables', { key: 'value' }),
        new Diff(environment, DiffAction.DELETE, 'environmentVariables', { key: 'value' }),
      ];

      const addEnvironmentNameActionMock = jest.fn();
      const addEnvironmentVariablesActionMock = jest.fn();
      const deleteEnvironmentVariablesActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'addEnvironmentName',
          filter: (diff: Diff) => diff.field === 'environmentName',
          handle: addEnvironmentNameActionMock,
          revert: jest.fn(),
        },
        {
          ACTION_NAME: 'addEnvironmentVariables',
          filter: (diff: Diff) => diff.field === 'environmentVariables' && diff.action === DiffAction.ADD,
          handle: addEnvironmentVariablesActionMock,
          revert: jest.fn(),
        },
        {
          ACTION_NAME: 'addEnvironmentVariables',
          filter: (diff: Diff) => diff.field === 'environmentVariables' && diff.action === DiffAction.DELETE,
          handle: deleteEnvironmentVariablesActionMock,
          revert: jest.fn(),
        },
      ];

      const diffService = new DiffService();
      diffService.registerActions(actions);

      await diffService.beginTransaction(diffs);

      expect(addEnvironmentNameActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });

      expect(addEnvironmentVariablesActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentVariables',
        value: { key: 'value' },
      });

      expect(deleteEnvironmentVariablesActionMock).toHaveBeenCalledTimes(1);
      expect(deleteEnvironmentVariablesActionMock.mock.calls[0][0].length).toBe(1);
      expect(deleteEnvironmentVariablesActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'delete',
        field: 'environmentVariables',
        value: { key: 'value' },
      });

      expect(deleteEnvironmentVariablesActionMock.mock.invocationCallOrder[0]).toBeLessThan(
        addEnvironmentVariablesActionMock.mock.invocationCallOrder[0],
      );
      expect(addEnvironmentVariablesActionMock.mock.invocationCallOrder[0]).toBeLessThan(
        addEnvironmentNameActionMock.mock.invocationCallOrder[0],
      );

      expect(diffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "environmentVariables",
              "value": {
                "key": "value",
              },
            },
          ],
          [
            {
              "action": "add",
              "field": "environmentVariables",
              "value": {
                "key": "value",
              },
            },
          ],
          [
            {
              "action": "add",
              "field": "environmentName",
              "value": "qa",
            },
          ],
        ]
      `);
    });

    it('should batch similar diffs to be processed together', async () => {
      const environment = new Environment('qa');
      environment.addDependency('environmentName', DiffAction.ADD, environment, 'environmentVariables', DiffAction.ADD);
      const diffs: Diff[] = [
        new Diff(environment, DiffAction.ADD, 'environmentName', 'qa'),
        new Diff(environment, DiffAction.ADD, 'environmentVariables', { key1: 'value1' }),
        new Diff(environment, DiffAction.ADD, 'environmentVariables', { key2: 'value2' }),
      ];

      const addEnvironmentNameActionMock = jest.fn();
      const addEnvironmentVariablesActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'addEnvironmentName',
          filter: (diff: Diff) => diff.field === 'environmentName',
          handle: addEnvironmentNameActionMock,
          revert: jest.fn(),
        },
        {
          ACTION_NAME: 'addEnvironmentVariables',
          filter: (diff: Diff) => diff.field === 'environmentVariables',
          handle: addEnvironmentVariablesActionMock,
          revert: jest.fn(),
        },
      ];

      const diffService = new DiffService();
      diffService.registerActions(actions);

      await diffService.beginTransaction(diffs);

      expect(addEnvironmentNameActionMock).toHaveBeenCalledTimes(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0].length).toBe(1);
      expect(addEnvironmentNameActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });

      expect(addEnvironmentVariablesActionMock).toHaveBeenCalledTimes(2);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0].length).toBe(2);
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentVariables',
        value: { key1: 'value1' },
      });
      expect(addEnvironmentVariablesActionMock.mock.calls[0][0][1].toJSON()).toEqual({
        action: 'add',
        field: 'environmentVariables',
        value: { key2: 'value2' },
      });

      expect(addEnvironmentVariablesActionMock.mock.invocationCallOrder[0]).toBeLessThan(
        addEnvironmentNameActionMock.mock.invocationCallOrder[0],
      );
      expect(addEnvironmentVariablesActionMock.mock.invocationCallOrder[1]).toBeLessThan(
        addEnvironmentNameActionMock.mock.invocationCallOrder[0],
      );

      expect(diffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "environmentVariables",
              "value": {
                "key1": "value1",
              },
            },
            {
              "action": "add",
              "field": "environmentVariables",
              "value": {
                "key2": "value2",
              },
            },
          ],
          [],
          [
            {
              "action": "add",
              "field": "environmentName",
              "value": "qa",
            },
          ],
        ]
      `);
    });
  });

  describe('rollback()', () => {
    it('should rollback a single diff', async () => {
      const environment = new Environment('qa');
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');

      const testActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'test',
          filter: () => true,
          handle: jest.fn(),
          revert: testActionMock,
        },
      ];
      diff1.metadata.actions = actions;

      const diffService = new DiffService();
      diffService.registerActions(actions);

      diffService['transaction'].push([diff1]);
      await diffService.rollback();

      expect(testActionMock).toHaveBeenCalledTimes(1);
      expect(testActionMock.mock.calls[0][0].length).toBe(1);
      expect(testActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });
    });

    it('should rollback multiple diffs of same type', async () => {
      const environment = new Environment('qa');
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');

      const testActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'test',
          filter: () => true,
          handle: jest.fn(),
          revert: testActionMock,
        },
      ];
      diff1.metadata.actions = actions;
      diff2.metadata.actions = actions;

      const diffService = new DiffService();
      diffService.registerActions(actions);

      diffService['transaction'].push([diff1, diff2]);
      await diffService.rollback();

      expect(testActionMock).toHaveBeenCalledTimes(1);
      expect(testActionMock.mock.calls[0][0].length).toBe(2);
      expect(testActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });
      expect(testActionMock.mock.calls[0][0][1].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });
    });

    it('should rollback multiple diffs in order', async () => {
      const environment = new Environment('qa');
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');

      const testActionMock = jest.fn();
      const actions: IAction[] = [
        {
          ACTION_NAME: 'test',
          filter: () => true,
          handle: jest.fn(),
          revert: testActionMock,
        },
      ];
      diff1.metadata.actions = actions;
      diff2.metadata.actions = actions;

      const diffService = new DiffService();
      diffService.registerActions(actions);

      diffService['transaction'].push([diff1], [diff2]);
      await diffService.rollback();

      expect(testActionMock).toHaveBeenCalledTimes(2);
      expect(testActionMock.mock.calls[0][0].length).toBe(1);
      expect(testActionMock.mock.calls[1][0].length).toBe(1);
      expect(testActionMock.mock.calls[0][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });
      expect(testActionMock.mock.calls[1][0][0].toJSON()).toEqual({
        action: 'add',
        field: 'environmentName',
        value: 'qa',
      });
    });
  });
});
