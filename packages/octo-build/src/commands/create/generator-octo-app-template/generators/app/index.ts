import { readdir, stat } from 'fs/promises';
import type { Stats } from 'node:fs';
import { join, resolve } from 'path';
import Generator, { type BaseOptions } from 'yeoman-generator';

export default class extends Generator {
  private readonly appName: string;
  private readonly appPath: string;
  private readonly appTemplate: string;

  constructor(args: string[], opts: BaseOptions) {
    super(args, opts);

    this.appName = args[0];
    this.appPath = args[1];
    this.appTemplate = args[2];
  }

  private getCopyScriptGlobs(): string[] {
    switch (this.appTemplate) {
      case 'aws-ecs-server':
        return ['src/.env', 'src/.octo/**/*'];
      case 'aws-s3-website':
        return ['src/.env', 'src/.octo/**/*', 'src/website/**/*'];
      default:
        throw new Error(`Unsupported app template: ${this.appTemplate}`);
    }
  }

  async initializing(): Promise<void> {
    const targetPath = resolve(join(this.appPath, this.appName));

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
        throw new Error(
          `Directory '${targetPath}' already exists and is not empty! Please choose a different name or path.`,
        );
      }
    }

    // Set the destination root to the app directory.
    this.destinationRoot(targetPath);
  }

  async writing(): Promise<void> {
    // Create eslint.config.js (ESLint v9 flat config)
    this.fs.copyTpl(this.templatePath('eslint.config.js.ejs'), this.destinationPath('eslint.config.js'));

    // Create .gitignore
    this.fs.copyTpl(this.templatePath('gitignore.ejs'), this.destinationPath('.gitignore'));

    // Create package.json
    this.fs.copyTpl(this.templatePath('package.json.ejs'), this.destinationPath('package.json'), {
      copyGlobs: this.getCopyScriptGlobs()
        .map((g) => `\\"${g}\\"`)
        .join(' '),
      description: `Infrastructure definition using Octo for ${this.appName}`,
      name: this.appName,
      version: '0.0.1',
    });
    await this.addDependencies({
      '@quadnix/octo': '0.0.x',
      '@quadnix/octo-aws-cdk': '0.0.x',
      '@quadnix/octo-event-listeners': '0.0.x',
      'env-smart': '^2.3.2',
    });
    await this.addDevDependencies({
      '@types/jest': '^30.0.0',
      '@types/node': '^20.0.0',
      copyfiles: '^2.4.1',
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
      description: `Infrastructure definition using Octo for ${this.appName}`,
      name: this.appName,
    });

    // Create tsconfig.json and tsconfig.build.json
    this.fs.copyTpl(this.templatePath('tsconfig.json.ejs'), this.destinationPath('tsconfig.json'));
    this.fs.copyTpl(this.templatePath('tsconfig.build.json.ejs'), this.destinationPath('tsconfig.build.json'));

    // Create src directory and main files
    if (this.appTemplate === 'aws-ecs-server') {
      const templatePath = `src/${this.appTemplate}`;
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/octo/gitkeep.ejs`),
        this.destinationPath('src/.octo/.gitkeep'),
      );
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/app.config.ts.ejs`),
        this.destinationPath('src/app.config.ts'),
      );
      this.fs.copyTpl(this.templatePath(`${templatePath}/env.ejs`), this.destinationPath('src/.env'));
      this.fs.copyTpl(this.templatePath(`${templatePath}/main.ts.ejs`), this.destinationPath('src/main.ts'));
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/module-definitions.ts.ejs`),
        this.destinationPath('src/module-definitions.ts'),
      );
    } else if (this.appTemplate === 'aws-s3-website') {
      const templatePath = `src/${this.appTemplate}`;
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/octo/gitkeep.ejs`),
        this.destinationPath('src/.octo/.gitkeep'),
      );
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/website/error.html.ejs`),
        this.destinationPath('src/website/error.html'),
        {
          name: this.appName,
        },
      );
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/website/index.html.ejs`),
        this.destinationPath('src/website/index.html'),
        {
          name: this.appName,
        },
      );
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/app.config.ts.ejs`),
        this.destinationPath('src/app.config.ts'),
      );
      this.fs.copyTpl(this.templatePath(`${templatePath}/env.ejs`), this.destinationPath('src/.env'));
      this.fs.copyTpl(this.templatePath(`${templatePath}/main.ts.ejs`), this.destinationPath('src/main.ts'));
      this.fs.copyTpl(
        this.templatePath(`${templatePath}/module-definitions.ts.ejs`),
        this.destinationPath('src/module-definitions.ts'),
      );
    } else {
      throw new Error(`Unsupported app template: ${this.appTemplate}`);
    }
  }

  end(): void {
    const targetPath = resolve(join(this.appPath, this.appName));

    this.log('✅ Your TypeScript app has been generated successfully!');
    this.log(`📁 App created at: ${targetPath}`);
    this.log('📦 Next steps:');
    this.log(`   cd ${targetPath}`);
    this.log('   npm install');
    this.log('   npm run build');
    this.log('   npm start');
  }
}
