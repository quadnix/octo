import type { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';

export class SchemaTranslationService {
  private readonly translations: Map<
    Constructable<BaseResourceSchema>,
    Map<Constructable<BaseResourceSchema>, (from: BaseResourceSchema) => BaseResourceSchema>
  > = new Map();

  getResourceTranslatedSchema<S1 extends BaseResourceSchema, S2 extends BaseResourceSchema>(
    from: Constructable<S1>,
  ): { schema: Constructable<S2>; translator: (resourceSynth: S2) => S1 } | undefined {
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

  registerResourceSchemaTranslation<S1 extends BaseResourceSchema, S2 extends BaseResourceSchema>(
    from: Constructable<S1>,
    to: Constructable<S2>,
    translator: (resourceSynth: S2) => S1,
  ): void {
    if (!this.translations.has(from)) {
      this.translations.set(from, new Map());
    }
    this.translations.get(from)!.set(to, translator);
  }
}

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
