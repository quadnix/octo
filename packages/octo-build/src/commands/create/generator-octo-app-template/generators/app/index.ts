import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';

export default class extends Generator {
  private readonly projectName: string;
  private readonly projectPath: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.projectName = args[0];
    this.projectPath = args[1];
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.projectPath, this.projectName));

    // Check if directory already exists and is not empty.
    let targetPathStat: Stats | undefined;
    try {
      targetPathStat = await stat(targetPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (targetPathStat && targetPathStat.isDirectory()) {
      const files = await readdir(targetPath);
      if (files.length > 0) {
        throw new Error(
          `Directory '${targetPath}' already exists and is not empty! Please choose a different name or path.`,
        );
      }
    }

    // Set the destination root to the project directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create eslint.config.js (ESLint v9 flat config)
    this.fs.copyTpl(this.templatePath('eslint.config.js.ejs'), this.destinationPath('eslint.config.js'));

    // Create .gitignore
    this.fs.copyTpl(this.templatePath('gitignore.ejs'), this.destinationPath('.gitignore'));

    // Create package.json
    this.fs.copyTpl(this.templatePath('package.json.ejs'), this.destinationPath('package.json'), {
      description: `Infrastructure definition using Octo for ${this.projectName}`,
      name: this.projectName,
      version: '0.0.1',
    });
    await this.addDependencies({
      '@quadnix/octo': '^0.0.22',
      '@quadnix/octo-aws-cdk': '^0.0.11',
      '@quadnix/octo-event-listeners': '^0.0.1',
      'env-smart': '^2.3.2',
    });
    await this.addDevDependencies({
      '@types/jest': '^30.0.0',
      '@types/node': '^20.0.0',
      eslint: '^9.0.0',
      'eslint-config-prettier': '^10.1.8',
      'eslint-import-resolver-typescript': '^4.4.4',
      'eslint-plugin-import': '^2.32.0',
      'eslint-plugin-jsonc': '^2.20.1',
      'eslint-plugin-prettier': '^5.5.4',
      jest: '^30.0.0',
      'jsonc-eslint-parser': '^2.4.0',
      prettier: '^3.6.2',
      rimraf: '^6.0.0',
      'source-map-support': '^0.5.21',
      'ts-jest': '^29.0.0',
      'ts-node': '^10.9.2',
      'tsconfig-paths': '^4.2.0',
      typescript: '^5.0.0',
      'typescript-eslint': '^8.0.0',
    });

    // Create .prettierrc
    this.fs.copyTpl(this.templatePath('prettierrc.ejs'), this.destinationPath('.prettierrc'));

    // Create README.md
    this.fs.copyTpl(this.templatePath('README.md.ejs'), this.destinationPath('README.md'), {
      description: `Infrastructure definition using Octo for ${this.projectName}`,
      name: this.projectName,
    });

    // Create tsconfig.json and tsconfig.build.json
    this.fs.copyTpl(this.templatePath('tsconfig.json.ejs'), this.destinationPath('tsconfig.json'));
    this.fs.copyTpl(this.templatePath('tsconfig.build.json.ejs'), this.destinationPath('tsconfig.build.json'));

    // Create src directory and main files
    this.fs.copyTpl(this.templatePath('src/index.ts.ejs'), this.destinationPath('src/index.ts'), {
      name: this.projectName,
    });
    // Create test file
    this.fs.copyTpl(this.templatePath('src/index.test.ts.ejs'), this.destinationPath('src/index.test.ts'), {
      name: this.projectName,
    });
  }

  end(): void {
    const targetPath = resolve(join(this.projectPath, this.projectName));

    this.log('✅ TypeScript project has been generated successfully!');
    this.log(`📁 Project created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   cd ${targetPath}`);
    this.log('   npm install');
    this.log('   npm run build');
    this.log('   npm start');
  }
}
