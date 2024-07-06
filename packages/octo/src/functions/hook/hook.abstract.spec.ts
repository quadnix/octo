import { AHook } from './hook.abstract.js';

class TestHook extends AHook {
  override collectHooks(): void {}

  getRegisteredModules(): AHook['registeredModules'] {
    return this.registeredModules;
  }

  override registrar(): void {}
}

class Test1Module {}
class Test2Module {}

describe('Hook UT', () => {
  describe('registerModule()', () => {
    it('should register a module', () => {
      const hook = new TestHook();
      hook.registerModule(Test1Module.name, { imports: [] });

      expect(hook.getRegisteredModules()).toHaveLength(1);
      expect(hook.getRegisteredModules().map((m) => m.moduleName)).toEqual(['Test1Module']);
    });

    it('should rearrange registered modules based on imports', () => {
      const hook = new TestHook();
      hook.registerModule('Test3Module', { imports: [Test2Module] });
      hook.registerModule(Test2Module.name, { imports: [Test1Module] });
      hook.registerModule(Test1Module.name, { imports: [] });

      expect(hook.getRegisteredModules()).toHaveLength(3);
      expect(hook.getRegisteredModules().map((m) => m.moduleName)).toEqual([
        'Test1Module',
        'Test2Module',
        'Test3Module',
      ]);
    });
  });
});
