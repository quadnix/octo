import { HOOK_NAMES, IHook } from '../../models/hook.interface';

export class HookService {
  private hooks: IHook[];

  private static instance: HookService;

  private constructor() {
    this.hooks = [];
  }

  applyHooks(hookName: HOOK_NAMES): void {
    this.hooks.filter((h) => h.HOOK_NAME === hookName).map((h) => h.handle(...h.args));
  }

  static getInstance(forceNew?: boolean): HookService {
    if (!HookService.instance || forceNew) {
      HookService.instance = new HookService();
    }

    return HookService.instance;
  }

  registerHooks(hooks: IHook[]): void {
    this.hooks.push(...hooks);
  }
}
