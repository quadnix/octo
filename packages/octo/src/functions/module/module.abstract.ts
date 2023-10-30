import { AModel } from '../../models/model.abstract.js';
import { IModule } from './module.interface.js';

export abstract class AModule {
  private readonly members: AModel<unknown, unknown>[] = [];

  protected addMember(member: AModel<unknown, unknown>): void {
    const index = this.members.findIndex((m) => m.getContext() === member.getContext());

    if (index === -1) {
      this.members.push(member);
    }
  }

  abstract apply(...args: AModel<unknown, unknown>[]): void;

  abstract remove(...args: AModel<unknown, unknown>[]): void;

  removeAll(): void {
    for (const member of this.members) {
      member.remove(false, true);
    }

    for (const member of this.members) {
      member.remove(false, false);
    }
  }

  protected removeMember(member: AModel<unknown, unknown>): void {
    const index = this.members.findIndex((m) => m.getContext() === member.getContext());

    if (index !== -1) {
      this.members.splice(index, 1);
    }
  }

  synth(): IModule {
    return {
      members: this.members.map((m) => ({
        context: m.getContext(),
      })),
    };
  }

  static async unSynth(
    deserializationClass: any,
    module: IModule,
    deReferenceContext: (context: string) => Promise<AModel<unknown, unknown>>,
  ): Promise<AModule> {
    const newModule = new deserializationClass();

    for (const member of module.members) {
      const model = await deReferenceContext(member.context);
      newModule.addMember(model);
    }

    return newModule;
  }
}
