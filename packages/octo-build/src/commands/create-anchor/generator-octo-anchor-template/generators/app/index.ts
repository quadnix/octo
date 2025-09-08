import { readdir } from 'fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

export default class extends Generator {
  private readonly anchorFamily: string;
  private readonly anchorName: string;
  private readonly cdkRootDir: string;
  private readonly modelType: string;
  private readonly packageName: string;

  private readonly isModelAnchor: boolean;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.anchorName = args[0];
    this.anchorFamily = args[1];
    this.modelType = args[2];
    this.packageName = args[3];
    this.cdkRootDir = args[4];

    // Determine if this is a model anchor or overlay anchor.
    this.isModelAnchor = StringUtility.AVAILABLE_MODEL_TYPES.includes(this.modelType as any);
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'anchors', this.anchorFamily));

    // Check if anchors already exists.
    let targetPathContents: Dirent[] | undefined;
    try {
      targetPathContents = await readdir(targetPath, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    for (const file of targetPathContents!) {
      if (
        (file.isFile() && file.name === `${this.anchorName}.anchor.ts`) ||
        file.name === `${this.anchorName}.anchor.schema.ts`
      ) {
        throw new Error(`Anchor '${this.anchorName}' already exists!`);
      }
    }

    // Set the destination root to the anchor directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create the anchor file.
    this.fs.copyTpl(
      this.templatePath('anchors/anchor/anchor.ts.ejs'),
      this.destinationPath(`${this.anchorName}.anchor.ts`),
      {
        anchorName: this.anchorName,
        anchorNamePascal: StringUtility.toPascalCase(this.anchorName),
        packageName: this.packageName,
      },
    );

    // Create schema file.
    this.fs.copyTpl(
      this.templatePath('anchors/anchor/anchor.schema.ts.ejs'),
      this.destinationPath(`${this.anchorName}.anchor.schema.ts`),
      {
        anchorNamePascal: StringUtility.toPascalCase(this.anchorName),
        isModelAnchor: this.isModelAnchor,
        modelTypePascal: StringUtility.toPascalCase(this.modelType),
      },
    );
  }

  end(): void {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'anchors', this.anchorFamily));

    this.log('✅ Your anchor has been generated successfully!');
    this.log(`📁 Anchor created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Address all "Fix me" in generated files`);
  }
}
