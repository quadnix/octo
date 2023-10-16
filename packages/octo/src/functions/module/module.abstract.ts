import { Model } from '../../models/model.abstract';
import { IModule } from './module.interface';

export abstract class Module {
  private readonly members: Model<unknown, unknown>[] = [];

  protected addMember(member: Model<unknown, unknown>): void {
    const index = this.members.findIndex((m) => m.getContext() === member.getContext());

    if (index === -1) {
      this.members.push(member);
    }
  }

  abstract apply(...args: Model<unknown, unknown>[]): void;

  abstract remove(...args: Model<unknown, unknown>[]): void;

  removeAll(): void {
    for (const member of this.members) {
      member.remove(false, true);
    }

    for (const member of this.members) {
      member.remove(false, false);
    }
  }

  protected removeMember(member: Model<unknown, unknown>): void {
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
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<Module> {
    const newModule = new deserializationClass();

    for (const member of module.members) {
      const model = await deReferenceContext(member.context);
      newModule.addMember(model);
    }

    return newModule;
  }
}
