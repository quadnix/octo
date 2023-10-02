import { HOOK_ACTION, IHook } from '../../models/hook.interface';
import { Model } from '../../models/model.abstract';

export class HookService {
  private hooks: IHook[];

  private static instance: HookService;

  private constructor() {
    this.hooks = [];
  }

  notifyHooks(hookAction: HOOK_ACTION, model: Model<unknown, unknown>): void {
    this.hooks.filter((h) => h.filter(hookAction, model)).map((h) => h.handle(model));
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
