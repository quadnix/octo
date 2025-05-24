import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { FilesystemSchema } from './filesystem.schema.js';

@Model<Filesystem>('@octo', 'filesystem', FilesystemSchema)
export class Filesystem extends AModel<FilesystemSchema, Filesystem> {
  readonly filesystemName: string;

  constructor(filesystemName: string) {
    super();
    this.filesystemName = filesystemName;
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const region = parents['region']?.[0]?.to;
    if (!region) {
      return undefined;
    }
    return [`${(this.constructor as typeof Filesystem).NODE_NAME}=${this.filesystemName}`, region.getContext()].join(
      ',',
    );
  }

  override synth(): FilesystemSchema {
    return {
      filesystemName: this.filesystemName,
    };
  }

  static override async unSynth(
    filesystem: FilesystemSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Filesystem> {
    assert(!!deReferenceContext);

    return new Filesystem(filesystem.filesystemName);
  }
}
