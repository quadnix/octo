import type { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';

/**
 * @internal
 */
export class SchemaTranslationService {
  private readonly translations: Map<Constructable<unknown>, Map<Constructable<unknown>, (from: unknown) => unknown>> =
    new Map();

  getTranslatedSchema<S1, S2>(
    from: Constructable<S1>,
  ): { schema: Constructable<S2>; translator: (synth: S2) => S1 } | undefined {
    if (!this.translations.has(from)) {
      return undefined;
    }

    const translation = this.translations.get(from)!;
    const translationKey = translation.keys().next();
    return {
      schema: translationKey.value,
      translator: translation.get(translationKey.value)! as (resourceSynth: S2) => S1,
    };
  }

  registerSchemaTranslation<S1, S2>(
    from: Constructable<S1>,
    to: Constructable<S2>,
    translator: (synth: S2) => S1,
  ): void {
    if (!this.translations.has(from)) {
      this.translations.set(from, new Map());
    }
    this.translations.get(from)!.set(to, translator);
  }
}

/**
 * @internal
 */
@Factory<SchemaTranslationService>(SchemaTranslationService)
export class SchemaTranslationServiceFactory {
  private static instance: SchemaTranslationService;

  static async create(): Promise<SchemaTranslationService> {
    if (!this.instance) {
      this.instance = new SchemaTranslationService();
    }
    return this.instance;
  }
}
