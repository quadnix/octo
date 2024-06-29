import { AHook } from './hook.abstract.js';

class TestHook extends AHook {
  override generateCallbacks(): void {}

  getRegisteredModules(): AHook['registeredModules'] {
    return this.registeredModules;
  }

  override registrar(): void {}
}

class Test1Module {}
class Test2Module {}

describe('Hook UT', () => {
  describe('register()', () => {
    it('should register a module', () => {
      const hook = new TestHook();
      hook.register('Test1Module', { imports: [], postModelActionHandles: [], preCommitHandles: [] });

      expect(hook.getRegisteredModules()).toHaveLength(1);
      expect(hook.getRegisteredModules().map((m) => m.moduleName)).toEqual(['Test1Module']);
    });

    it('should rearrange registered modules based on imports', () => {
      const hook = new TestHook();
      hook.register('Test3Module', { imports: [Test2Module], postModelActionHandles: [], preCommitHandles: [] });
      hook.register('Test2Module', { imports: [Test1Module], postModelActionHandles: [], preCommitHandles: [] });
      hook.register('Test1Module', { imports: [], postModelActionHandles: [], preCommitHandles: [] });

      expect(hook.getRegisteredModules()).toHaveLength(3);
      expect(hook.getRegisteredModules().map((m) => m.moduleName)).toEqual([
        'Test1Module',
        'Test2Module',
        'Test3Module',
      ]);
    });
  });
});
