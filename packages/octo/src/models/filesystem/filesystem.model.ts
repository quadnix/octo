import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { FilesystemSchema } from './filesystem.schema.js';

/**
 * A Filesystem model is a network filesystem shared by the executions of a region.
 * It exists so that state which must outlive a container - uploads, caches, shared data - has somewhere to live.
 *
 * A filesystem belongs to one {@link Region}. Mounting it into a {@link Subnet} is the job of a module,
 * e.g. `AwsSimpleSubnetModule` via its `localFilesystems` input.
 *
 * @example
 * ```ts
 * const filesystem = new Filesystem('shared-uploads');
 * region.addFilesystem(filesystem);
 * ```
 *
 * @group Models/Filesystem
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Filesystem>('@octo', 'filesystem', FilesystemSchema)
export class Filesystem extends AModel<FilesystemSchema, Filesystem> {
  readonly filesystemName: string;

  /**
   * @param filesystemName The name of the filesystem, unique within its region.
   */
  constructor(filesystemName: string) {
    super();
    this.filesystemName = filesystemName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    filesystem: FilesystemSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Filesystem> {
    assert(!!deReferenceContext);

    return new Filesystem(filesystem.filesystemName);
  }

  /**
   * @internal
   */
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

  /**
   * @internal
   */
  override synth(): FilesystemSchema {
    return {
      filesystemName: this.filesystemName,
    };
  }
}
