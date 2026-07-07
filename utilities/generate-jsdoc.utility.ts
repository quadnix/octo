import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';
import { cwd } from 'process';
import {
  ArrowFunction,
  type ClassDeclaration,
  type ConstructorDeclaration,
  FunctionDeclaration,
  type InterfaceDeclaration,
  MethodDeclaration,
  Project,
  SyntaxKind,
} from 'ts-morph';

const HELP_MENU = `
AST+AI Based Local JSDoc Automation Tool (TypeScript Version)

Usage:
  node --loader ts-node/esm utilities/generate-jsdoc.utility.ts <file_or_directory_path> [options]

Options:
  -i, --ignoreExistingDocumentation Strip out any current JSDoc comments and recreate them from scratch.
  -h, --help Display this help menu workspace information.

Examples:
  node --loader ts-node/esm utilities/generate-jsdoc.utility.ts packages/octo/src/my-file.ts
  node --loader ts-node/esm utilities/generate-jsdoc.utility.ts packages/octo --ignoreExistingDocumentation
`;

const AI_TECHNICAL_WRITER_PROMPT = (nodeType: string, nodeName: string, nodeCode: string): string =>
  `You are a staff technical writer. Analyze this ${nodeType} and write a highly descriptive, comprehensive 2-3 sentence overview explaining its operational behavior, architecture intent, and business logic purpose.
  
RULES:
1. Do NOT include any JSDoc tags like @param, @returns, or @throws.
2. Output ONLY the raw description text block.
3. No conversational intros, notes, formatting blocks, or markdown backticks.

${nodeType} Name: ${nodeName}
Source Code:
${nodeCode}`;

const AI_TAG_PROMPT = (contextCode: string, tagType: string, targetItem: string): string =>
  `Context Code Block:
${contextCode}

Analyze the code above. Write a very brief, concise 4-8 word description explaining what the ${tagType} "${targetItem}" represents or contains.
RULES:
1. Do NOT output the name, type, tags, or code symbols.
2. Output ONLY the raw descriptive fragment text.`;

// eslint-disable-next-line spellcheck/spell-checker
const MODEL_NAME = 'qwen2.5-coder:7b';
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const DEFAULT_TEXT_LIMIT = 80;

interface ESLintMessage {
  message: string;
}
interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
}
interface ExecError extends Error {
  stderr?: string;
  stdout?: string;
}

const rawArgs: string[] = process.argv.slice(2);

if (rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs.length === 0) {
  console.log(HELP_MENU);
  process.exit(0);
}

const IGNORE_EXISTING: boolean = rawArgs.includes('--ignoreExistingDocumentation') || rawArgs.includes('-i');
const pathArgs: string[] = rawArgs.filter(
  (arg) => arg !== '--ignoreExistingDocumentation' && arg !== '-i' && arg !== '--help' && arg !== '-h',
);
const INPUT_PATH: string = pathArgs[0];

if (!INPUT_PATH || !existsSync(INPUT_PATH)) {
  console.error('❌  Error: Please provide a valid target file or directory path.');
  console.error("Run 'node --loader ts-node/esm utilities/generate-jsdoc.utility.ts --help' to see valid commands.");
  process.exit(1);
}

/**
 * Derives the relative sub-package root directory from any arbitrary file path,
 * resolving absolute paths to project-relative structures first.
 */
function derivePackageDir(filePath: string): string {
  const currentWorkingDirectory = cwd();
  let relativePath = filePath;

  if (filePath.startsWith(currentWorkingDirectory)) {
    relativePath = filePath.slice(currentWorkingDirectory.length);
  }

  const pathParts: string[] = relativePath.split(sep).filter(Boolean);

  if (pathParts.length < 2) {
    console.error(`❌  Error: Could not determine sub-package directory from path '${filePath}'.`);
    process.exit(1);
  }

  return join(pathParts[0], pathParts[1]);
}

/**
 * Executes a direct system call to the project's local ESLint binary using built-in JSON formatting.
 */
function discoverFilesFromESLint(dirPath: string): string[] {
  const localEslintBin: string = join(cwd(), 'node_modules', '.bin', 'eslint');
  const eslintCommand: string = existsSync(localEslintBin) ? `"${localEslintBin}"` : 'eslint';

  console.log(`🔍  Direct auditing path via system '${eslintCommand} "${dirPath}" --format json'...`);

  try {
    const output: string = execSync(`${eslintCommand} "${dirPath}" --format json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseESLintFilePaths(output);
  } catch (error: unknown) {
    const execError = error as ExecError;

    if (execError.stdout && execError.stdout.trim().length > 0) {
      return parseESLintFilePaths(execError.stdout);
    }

    if (execError.stderr && execError.stderr.trim().length > 0) {
      console.error('❌  ESLint Execution Warning:\n', execError.stderr);
    }

    console.error('⚠️  Local eslint call returned warnings. Parsing targets...');
    return fallbackRecursiveScan(dirPath);
  }
}

/**
 * Parses standard ESLint JSON arrays to extract warning file names.
 */
function parseESLintFilePaths(stdout: string): string[] {
  const files: string[] = [];
  try {
    const eslintResults = JSON.parse(stdout) as ESLintResult[];

    for (const result of eslintResults) {
      if (result.messages && result.messages.length > 0) {
        const filePath: string = result.filePath;
        const validExtension: boolean =
          filePath.endsWith('.ts') ||
          filePath.endsWith('.tsx') ||
          filePath.endsWith('.js') ||
          filePath.endsWith('.jsx');
        if (validExtension) {
          files.push(filePath);
        }
      }
    }
  } catch (jsonError) {
    console.error('❌  Failed to parse ESLint JSON output. Falling back to text-line array matching.');
  }
  return [...new Set(files)];
}

/**
 * Recursively scans directory pathways as a fallback procedure if ESLint fails or is missing.
 */
function fallbackRecursiveScan(dir: string, fileList: string[] = []): string[] {
  const files: string[] = readdirSync(dir);

  for (const file of files) {
    const name: string = join(dir, file);

    if (statSync(name).isDirectory()) {
      if (!name.includes('node_modules') && !name.includes('dist')) {
        fallbackRecursiveScan(name, fileList);
      }
    } else if (name.endsWith('.ts') || name.endsWith('.js')) {
      fileList.push(name);
    }
  }

  return fileList;
}

/**
 * Formats a block of string text by applying a column width line breaks threshold.
 */
function wrapTextTo80(text: string, limit = DEFAULT_TEXT_LIMIT): string {
  const words: string[] = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > limit) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }
  return lines.join('\n');
}

/**
 * Normalizes type description expressions and filters runtime global module tracking paths into JSDoc links.
 */
function formatJSDocType(typeText: string): string {
  const cleanType: string = typeText.trim().replace(/import\(.*?\)\./g, '');
  const primitives: string[] = [
    'string',
    'number',
    'boolean',
    'any',
    'void',
    'unknown',
    'never',
    'object',
    'null',
    'undefined',
  ];

  if (primitives.includes(cleanType.toLowerCase()) || cleanType.includes('|') || cleanType.includes('&')) {
    return cleanType;
  }
  return cleanType;
}

/**
 * Generates an elegantly structured JSDoc block configuration string.
 */
function buildJSDocBlock(description: string, tags: string[] = []): string {
  const parts: string[] = [description.trim()];

  if (tags.length > 0) {
    const parameterTags: string = tags.filter((tag) => tag.startsWith('@param')).join('\n');
    const returnTags: string = tags.filter((tag) => tag.startsWith('@returns')).join('\n');

    if (parameterTags) {
      parts.push(parameterTags);
    }

    if (returnTags) {
      parts.push(returnTags);
    }
  }

  return parts.join('\n\n');
}

/**
 * Shared core system routine used to send HTTP POST requests directly to the local AI daemon service instance.
 */
async function callAI(prompt: string): Promise<string> {
  try {
    const response: Response = await fetch(OLLAMA_API_URL, {
      body: JSON.stringify({
        model: MODEL_NAME,
        options: { temperature: 0.1, top_p: 0.2 },
        prompt: prompt,
        stream: false,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data = (await response.json()) as {
      response: string;
    };

    return data.response.trim();
  } catch (error: unknown) {
    const runtimeError = error as Error;
    console.error('❌  Failed to contact AI:', runtimeError.message);
    return '';
  }
}

/**
 * Triggers the main architectural evaluation sequence to summarize high-level operational descriptions.
 */
async function getAIDescription(nodeName: string, nodeType: string, nodeCode: string): Promise<string> {
  const prompt: string = AI_TECHNICAL_WRITER_PROMPT(nodeType, nodeName, nodeCode);
  const text: string = await callAI(prompt);
  return wrapTextTo80(text, DEFAULT_TEXT_LIMIT);
}

/**
 * Requests specific isolated data to evaluate contextual parameters or inline value returns via minor token parsing.
 */
async function getTagDescription(contextCode: string, targetItem: string, tagType = 'parameter'): Promise<string> {
  const prompt: string = AI_TAG_PROMPT(contextCode, tagType, targetItem);
  return await callAI(prompt);
}

/**
 * Iterates through method or function signatures to systematically map context parameters and returns.
 */
async function generateJSDocForCallable(
  node: MethodDeclaration | FunctionDeclaration | ArrowFunction | ConstructorDeclaration,
  nodeName: string,
  nodeType: string,
): Promise<string> {
  const fullCodeText: string = node.getText();
  const summary: string = await getAIDescription(nodeName, nodeType, fullCodeText);
  const tags: string[] = [];

  const parameters = node.getParameters();
  for (const parameter of parameters) {
    const parameterName: string = parameter.getName();
    const parameterType: string = formatJSDocType(parameter.getType().getText());
    const rawTagDescription: string = await getTagDescription(fullCodeText, parameterName, 'parameter');

    const isPrimitive =
      ['string', 'number', 'boolean', 'any', 'void', 'unknown', 'never', 'object', 'null', 'undefined'].includes(
        parameterType.toLowerCase(),
      ) ||
      parameterType.includes('|') ||
      parameterType.includes('&');
    const typeString = isPrimitive ? parameterType : `{@link ${parameterType}}`;

    const baseSignature = `@param ${parameterName} {${typeString}}`;
    const fullTagString = `${baseSignature} ${rawTagDescription.trim()}`;

    tags.push(wrapTextTo80(fullTagString, 80));
  }

  const returnTypeNode = node.getReturnType();
  const returnTypeText: string = returnTypeNode.getText();

  if (nodeType !== 'Constructor' && returnTypeText && returnTypeText !== 'void') {
    const formattedReturnType = formatJSDocType(returnTypeText);
    const rawReturnDescription: string = await getTagDescription(fullCodeText, formattedReturnType, 'return value');

    const isPrimitiveReturn =
      ['string', 'number', 'boolean', 'any', 'void', 'unknown', 'never', 'object', 'null', 'undefined'].includes(
        formattedReturnType.toLowerCase(),
      ) ||
      formattedReturnType.includes('|') ||
      formattedReturnType.includes('&');

    const returnTypeString = isPrimitiveReturn ? `{${formattedReturnType}}` : `{@link ${formattedReturnType}}`;

    const baseSignature = `@returns ${returnTypeString}`;
    const fullTagString = `${baseSignature} ${rawReturnDescription.trim()}`;

    tags.push(wrapTextTo80(fullTagString, 80));
  }

  return buildJSDocBlock(summary, tags);
}

/**
 * Handles target documentation injection workflows on code items safely using ts-morph abstractions.
 */
async function processTargetNode(
  node:
    | MethodDeclaration
    | FunctionDeclaration
    | ClassDeclaration
    | InterfaceDeclaration
    | ArrowFunction
    | ConstructorDeclaration,
  nodeName: string,
  nodeType: string,
): Promise<void> {
  if (IGNORE_EXISTING) {
    const jsDocNodes = node.getJsDocs();
    for (const jsDocNode of jsDocNodes) {
      jsDocNode.remove();
    }
  } else if (node.getJsDocs().length > 0) {
    return;
  }

  console.log(`📝  Documenting ${nodeType}: "${nodeName}"...`);
  let jsDocString: string;

  if (
    node instanceof MethodDeclaration ||
    node instanceof FunctionDeclaration ||
    node instanceof ArrowFunction ||
    node.getKind() === SyntaxKind.Constructor
  ) {
    jsDocString = await generateJSDocForCallable(
      node as MethodDeclaration | FunctionDeclaration | ArrowFunction | ConstructorDeclaration,
      nodeName,
      nodeType,
    );
  } else {
    const summary: string = await getAIDescription(nodeName, nodeType, node.getText());
    jsDocString = buildJSDocBlock(summary);
  }

  if (jsDocString) {
    node.addJsDoc({ description: jsDocString });
  }
}

/**
 * Primary processing loop orchestrating AST file configuration changes over designated paths.
 */
async function main(): Promise<void> {
  const project = new Project();
  let filesToProcess: string[];

  if (statSync(INPUT_PATH).isDirectory()) {
    filesToProcess = discoverFilesFromESLint(INPUT_PATH);
  } else {
    filesToProcess = [INPUT_PATH];
  }

  if (filesToProcess.length === 0) {
    console.log('✅  No eligible source files discovered requiring update.');
    process.exit(0);
  }

  console.log(`🚀  Initializing modifications across ${filesToProcess.length} targeted workspace file(s)...`);

  for (const filePath of filesToProcess) {
    console.log(`📂  Processing Source File: ${filePath}`);
    const sourceFile = project.addSourceFileAtPath(filePath);

    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
      await processTargetNode(classDeclaration, classDeclaration.getName() ?? 'AnonymousClass', 'Class');

      const constructors = classDeclaration.getConstructors();
      for (const constructorDeclaration of constructors) {
        await processTargetNode(constructorDeclaration, 'constructor', 'Constructor');
      }

      const methods = classDeclaration.getMethods();
      for (const method of methods) {
        await processTargetNode(method, method.getName(), 'Method');
      }
    }

    const functions = sourceFile.getFunctions();
    for (const functionDeclaration of functions) {
      await processTargetNode(functionDeclaration, functionDeclaration.getName() ?? 'AnonymousFunction', 'Function');
    }

    const interfaces = sourceFile.getInterfaces();
    for (const interfaceDeclaration of interfaces) {
      await processTargetNode(interfaceDeclaration, interfaceDeclaration.getName(), 'Interface');
    }

    const variableStatements = sourceFile.getVariableStatements();
    for (const statement of variableStatements) {
      const declarations = statement.getDeclarations();

      for (const declaration of declarations) {
        const initializer = declaration.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
          const arrowFunction = initializer.asKindOrThrow(SyntaxKind.ArrowFunction);
          await processTargetNode(arrowFunction, declaration.getName(), 'ArrowFunction');
        }
      }
    }

    await sourceFile.save();

    console.log(`🧼  Running post-processing for: ${filePath}`);
    try {
      const localEslintBin: string = join(cwd(), 'node_modules', '.bin', 'eslint');
      const eslintCommand: string = existsSync(localEslintBin) ? `"${localEslintBin}"` : 'eslint';
      console.log(`🧹  Fixing lint errors...`);
      execSync(`${eslintCommand} "${filePath}" --fix`, { stdio: 'ignore' });

      const localPrettierBin: string = join(cwd(), 'node_modules', '.bin', 'prettier');
      const prettierCommand: string = existsSync(localPrettierBin) ? `"${localPrettierBin}"` : 'prettier';
      console.log(`🧹  Formatting with Prettier...`);
      execSync(`${prettierCommand} --write "${filePath}"`, { stdio: 'ignore' });

      const packageDirectory = derivePackageDir(filePath);
      console.log(`📦  Rebuilding workspace package [${packageDirectory}]...`);
      execSync(`npm run build --prefix "${packageDirectory}"`, { stdio: 'inherit' });
    } catch (postProcessingError: unknown) {
      const formattingError = postProcessingError as Error;
      console.warn(`⚠️  Post-processing or build warning for ${filePath}:`, formattingError.message);
    }
  }

  console.log('🎉  JSDoc injection complete! Target items have been fully documented.');
}

main().catch((error: unknown) => {
  const executionError = error as Error;
  console.error('❌  Critical failure occurred during source code modifications:', executionError.message);
  process.exit(1);
});
