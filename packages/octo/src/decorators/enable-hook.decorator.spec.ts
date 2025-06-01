import { jest } from '@jest/globals';
import { TestContainer } from '../functions/container/test-container.js';
import { CommitHook } from '../functions/hook/commit.hook.js';
import { EnableHook } from './enable-hook.decorator.js';

describe('EnableHook UT', () => {
  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  it('should throw an error when an invalid hook type is provided', () => {
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: true,
      value: function testMethod() {},
      writable: true,
    };

    expect(() => {
      const decorator = EnableHook('InvalidHook' as 'CommitHook');
      decorator({}, 'testMethod', descriptor);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid hook "InvalidHook"!"`);
  });

  it('should register a method with CommitHook when "CommitHook" is provided', () => {
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: true,
      value: function testMethod() {},
      writable: true,
    };
    const registrarSpy = jest.spyOn(CommitHook.getInstance(), 'registrar').mockImplementation(() => {});

    const decorator = EnableHook('CommitHook');
    decorator({}, 'testMethod', descriptor);

    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(descriptor);
  });
});
