import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

export default class extends Generator {
  private readonly packageName: string;
  private readonly projectRootDir: string;
  private readonly resourceName: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.resourceName = args[0];
    this.packageName = args[1];
    this.projectRootDir = args[2];
  }

  end(): void {
    const targetPath = resolve(join(this.projectRootDir, 'src', 'resources', this.resourceName));

    this.log('✅ Your terraform resource has been generated successfully!');
    this.log(`📁 Resource created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Address all "Fix me" in generated files`);
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.projectRootDir, 'src', 'resources', this.resourceName));

    // Check if directory already exists and is not empty.
    let targetPathStat: Stats | undefined;
    try {
      targetPathStat = await stat(targetPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (targetPathStat?.isDirectory()) {
      const files = await readdir(targetPath);
      if (files.length > 0) {
        throw new Error(`Directory '${targetPath}' already exists and is not empty!`);
      }
    }

    // Set the destination root to the resource directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    const templateData = {
      packageName: this.packageName,
      resourceName: this.resourceName,
      resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
    };

    // Create the terraform resource file.
    this.fs.copyTpl(
      this.templatePath('resources/resource/resource.ts.ejs'),
      this.destinationPath(`${this.resourceName}.resource.ts`),
      templateData,
    );

    // Create schema file.
    this.fs.copyTpl(
      this.templatePath('resources/resource/index.schema.ts.ejs'),
      this.destinationPath('index.schema.ts'),
      templateData,
    );

    // Create index.ts
    this.fs.copyTpl(
      this.templatePath('resources/resource/index.ts.ejs'),
      this.destinationPath('index.ts'),
      templateData,
    );
  }
}
