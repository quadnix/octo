import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import { IFilesystem } from './filesystem.interface.js';

@Model('@octo', 'filesystem')
export class Filesystem extends AModel<IFilesystem, Filesystem> {
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly filesystemName: string;

  constructor(filesystemName: string) {
    super();
    this.filesystemName = filesystemName;
  }

  override setContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${(this.constructor as typeof Filesystem).NODE_NAME}=${this.filesystemName}`, region.getContext()].join(
      ',',
    );
  }

  override synth(): IFilesystem {
    return {
      filesystemName: this.filesystemName,
    };
  }

  static override async unSynth(
    filesystem: IFilesystem,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Filesystem> {
    assert(!!deReferenceContext);

    return new Filesystem(filesystem.filesystemName);
  }
}
