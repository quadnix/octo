import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';
import { StringUtility } from '../../../../../utilities/string/string.utility.js';

export default class extends Generator {
  private readonly cdkRootDir: string;
  private readonly packageName: string;
  private readonly resourceName: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.resourceName = args[0];
    this.packageName = args[1];
    this.cdkRootDir = args[2];
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'resources', this.resourceName));

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
    // Create the resource file.
    this.fs.copyTpl(
      this.templatePath('resources/resource/resource.ts.ejs'),
      this.destinationPath(`${this.resourceName}.resource.ts`),
      {
        packageName: this.packageName,
        resourceName: this.resourceName,
        resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
      },
    );

    // Create schema file.
    this.fs.copyTpl(
      this.templatePath('resources/resource/index.schema.ts.ejs'),
      this.destinationPath('index.schema.ts'),
      {
        resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
      },
    );

    // Create index.ts
    this.fs.copyTpl(this.templatePath('resources/resource/index.ts.ejs'), this.destinationPath('index.ts'), {
      resourceName: this.resourceName,
      resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
    });

    // Create actions directory and action files
    this.fs.copyTpl(
      this.templatePath('resources/resource/actions/add.resource.action.ts.ejs'),
      this.destinationPath('actions', `add-${this.resourceName}.resource.action.ts`),
      {
        resourceName: this.resourceName,
        resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
      },
    );

    this.fs.copyTpl(
      this.templatePath('resources/resource/actions/delete.resource.action.ts.ejs'),
      this.destinationPath('actions', `delete-${this.resourceName}.resource.action.ts`),
      {
        resourceName: this.resourceName,
        resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
      },
    );

    this.fs.copyTpl(
      this.templatePath('resources/resource/actions/update-tags.resource.action.ts.ejs'),
      this.destinationPath('actions', `update-${this.resourceName}-tags.resource.action.ts`),
      {
        resourceName: this.resourceName,
        resourceNamePascal: StringUtility.toPascalCase(this.resourceName),
      },
    );
  }

  end(): void {
    const targetPath = resolve(join(this.cdkRootDir, 'src', 'resources', this.resourceName));

    this.log('✅ Your resource has been generated successfully!');
    this.log(`📁 Resource created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   Address all "Fix me" in generated files`);
  }
}
