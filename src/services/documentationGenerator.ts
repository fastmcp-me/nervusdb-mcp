import type { QueryService } from '../domain/query/queryService.js';
import type { DefinitionResult } from './definitionLocator.js';

/**
 * Documentation format types
 */
export type DocFormat = 'jsdoc' | 'tsdoc' | 'python-docstring' | 'markdown';

/**
 * Documentation completeness status
 */
export type DocStatus = 'complete' | 'partial' | 'missing';

/**
 * Generated documentation for a symbol
 */
export interface GeneratedDoc {
  symbolName: string;
  filePath: string;
  format: DocFormat;
  status: DocStatus;
  existingDoc?: string;
  generatedDoc: string;
  confidence: number; // 0-1
  reasoning: string;
  sections: {
    summary?: string;
    description?: string;
    parameters?: Array<{
      name: string;
      type?: string;
      description: string;
    }>;
    returns?: {
      type?: string;
      description: string;
    };
    throws?: Array<{
      type: string;
      description: string;
    }>;
    examples?: string[];
    seeAlso?: string[];
  };
}

/**
 * Documentation analysis result
 */
export interface DocAnalysisResult {
  projectPath: string;
  targetSymbols: string[];
  analysis: Array<{
    symbolName: string;
    filePath: string;
    status: DocStatus;
    issues: string[];
    suggestions: string[];
  }>;
  summary: {
    total: number;
    complete: number;
    partial: number;
    missing: number;
    completeness: number; // percentage
  };
  stats: {
    analysisTimeMs: number;
  };
}

/**
 * Documentation generation result
 */
export interface GenerateDocsResult {
  projectPath: string;
  generated: GeneratedDoc[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    avgConfidence: number;
  };
  stats: {
    generationTimeMs: number;
  };
}

/**
 * Documentation generator service dependencies
 */
export interface DocumentationGeneratorDeps {
  queryService: QueryService;
}

/**
 * Documentation generator service
 *
 * Analyzes code and generates missing documentation with contextual information
 */
export class DocumentationGenerator {
  constructor(private deps: DocumentationGeneratorDeps) {}

  /**
   * Analyze documentation completeness
   */
  async analyzeDocumentation(params: {
    projectPath: string;
    symbols: string[];
  }): Promise<DocAnalysisResult> {
    const startTime = Date.now();
    const { projectPath, symbols } = params;

    const analysis: DocAnalysisResult['analysis'] = [];

    for (const symbolName of symbols) {
      try {
        // Locate symbol definition
        const entity = await this.deps.queryService.findSymbolDefinition(projectPath, symbolName);
        const definitions = entity ? [this.toDefinitionResult(entity)] : [];

        if (definitions.length === 0) {
          analysis.push({
            symbolName,
            filePath: 'unknown',
            status: 'missing',
            issues: ['Symbol not found in project'],
            suggestions: ['Verify symbol name and project path'],
          });
          continue;
        }

        const def = definitions[0];

        // Check existing documentation
        const existingDoc = await this.extractExistingDoc(def);
        const status = this.assessDocStatus(existingDoc);
        const issues = this.identifyDocIssues(existingDoc, def);
        const suggestions = this.generateSuggestions(status, issues);

        analysis.push({
          symbolName,
          filePath: def.filePath,
          status,
          issues,
          suggestions,
        });
      } catch (error) {
        analysis.push({
          symbolName,
          filePath: 'unknown',
          status: 'missing',
          issues: [`Analysis failed: ${error instanceof Error ? error.message : String(error)}`],
          suggestions: ['Check if symbol is accessible'],
        });
      }
    }

    const summary = this.computeSummary(analysis);

    return {
      projectPath,
      targetSymbols: symbols,
      analysis,
      summary,
      stats: {
        analysisTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Generate documentation for symbols
   */
  async generateDocumentation(params: {
    projectPath: string;
    symbols: string[];
    format?: DocFormat;
    includeExamples?: boolean;
  }): Promise<GenerateDocsResult> {
    const startTime = Date.now();
    const { projectPath, symbols, format = 'jsdoc', includeExamples = true } = params;

    const generated: GeneratedDoc[] = [];

    for (const symbolName of symbols) {
      try {
        const doc = await this.generateDocForSymbol({
          symbolName,
          projectPath,
          format,
          includeExamples,
        });

        generated.push(doc);
      } catch (error) {
        // Failed generation - add placeholder
        generated.push({
          symbolName,
          filePath: 'unknown',
          format,
          status: 'missing',
          generatedDoc: `Failed to generate: ${error instanceof Error ? error.message : String(error)}`,
          confidence: 0,
          reasoning: 'Generation failed',
          sections: {},
        });
      }
    }

    const summary = {
      total: generated.length,
      successful: generated.filter((d) => d.confidence > 0.5).length,
      failed: generated.filter((d) => d.confidence <= 0.5).length,
      avgConfidence: generated.reduce((sum, d) => sum + d.confidence, 0) / (generated.length || 1),
    };

    return {
      projectPath,
      generated,
      summary,
      stats: {
        generationTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Generate documentation for a single symbol
   */
  private async generateDocForSymbol(params: {
    symbolName: string;
    projectPath: string;
    format: DocFormat;
    includeExamples: boolean;
  }): Promise<GeneratedDoc> {
    const { symbolName, projectPath, format, includeExamples } = params;

    // 1. Locate definition
    const entity = await this.deps.queryService.findSymbolDefinition(projectPath, symbolName);

    if (!entity) {
      throw new Error(`Symbol '${symbolName}' not found`);
    }

    const def = this.toDefinitionResult(entity);

    // 2. Extract existing doc
    const existingDoc = await this.extractExistingDoc(def);
    const status = this.assessDocStatus(existingDoc);

    // 3. Analyze symbol signature and context
    const signature = this.parseSignature(def);
    const context = await this.gatherContext(symbolName, def);

    // 4. Generate sections
    const sections = await this.generateSections({
      def,
      signature,
      context,
      includeExamples,
    });

    // 5. Format documentation
    const generatedDoc = this.formatDocumentation(sections, format);

    // 6. Calculate confidence
    const confidence = this.calculateConfidence({
      status,
      signature,
      context,
      sections,
    });

    return {
      symbolName,
      filePath: def.filePath,
      format,
      status,
      existingDoc,
      generatedDoc,
      confidence,
      reasoning: this.explainGeneration(signature, context, sections),
      sections,
    };
  }

  /**
   * Convert CodeEntityInfo to DefinitionResult
   */
  private toDefinitionResult(
    entity: import('../domain/query/queryService.js').CodeEntityInfo,
  ): DefinitionResult {
    return {
      ...entity,
      confidence: 1.0,
      matchReason: 'Exact match',
    };
  }

  /**
   * Extract existing documentation from definition
   */
  private async extractExistingDoc(_: DefinitionResult): Promise<string | undefined> {
    // Placeholder: in real implementation, read file and parse doc comment
    // For now, return undefined (missing)
    return undefined;
  }

  /**
   * Assess documentation status
   */
  private assessDocStatus(existingDoc?: string): DocStatus {
    if (!existingDoc || existingDoc.trim().length === 0) {
      return 'missing';
    }

    // Simple heuristic: check for key sections
    const hasDescription = existingDoc.length > 50;
    const hasParams = /@param|:param/.test(existingDoc);
    const hasReturns = /@returns?|:returns?/.test(existingDoc);

    if (hasDescription && (hasParams || hasReturns)) {
      return 'complete';
    } else if (hasDescription || hasParams || hasReturns) {
      return 'partial';
    }

    return 'missing';
  }

  /**
   * Identify documentation issues
   */
  private identifyDocIssues(existingDoc: string | undefined, def: DefinitionResult): string[] {
    const issues: string[] = [];

    if (!existingDoc) {
      issues.push('No documentation found');
      return issues;
    }

    // Check for missing sections
    if (existingDoc.length < 30) {
      issues.push('Description too brief');
    }

    if (def.signature && def.signature.includes('(') && !/@param/.test(existingDoc)) {
      issues.push('Missing parameter documentation');
    }

    if (def.type === 'function' && !/@returns?/.test(existingDoc)) {
      issues.push('Missing return value documentation');
    }

    return issues;
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(status: DocStatus, issues: string[]): string[] {
    const suggestions: string[] = [];

    if (status === 'missing') {
      suggestions.push('Add complete documentation with summary, params, and returns');
      return suggestions;
    }

    if (issues.includes('Description too brief')) {
      suggestions.push('Expand description to explain purpose and behavior');
    }

    if (issues.includes('Missing parameter documentation')) {
      suggestions.push('Document all parameters with types and descriptions');
    }

    if (issues.includes('Missing return value documentation')) {
      suggestions.push('Document return value type and meaning');
    }

    suggestions.push('Add usage examples for public API');
    suggestions.push('Link to related functions');

    return suggestions;
  }

  /**
   * Compute summary statistics
   */
  private computeSummary(analysis: DocAnalysisResult['analysis']): DocAnalysisResult['summary'] {
    const total = analysis.length;
    const complete = analysis.filter((a) => a.status === 'complete').length;
    const partial = analysis.filter((a) => a.status === 'partial').length;
    const missing = analysis.filter((a) => a.status === 'missing').length;
    const completeness = total > 0 ? (complete / total) * 100 : 0;

    return {
      total,
      complete,
      partial,
      missing,
      completeness,
    };
  }

  /**
   * Parse function signature
   */
  private parseSignature(def: DefinitionResult): {
    parameters: Array<{ name: string; type?: string }>;
    returnType?: string;
  } {
    const parameters: Array<{ name: string; type?: string }> = [];
    let returnType: string | undefined;

    // Simple regex parsing (in real implementation, use AST)
    if (def.signature) {
      // Extract parameters: function(param1: type1, param2: type2)
      const paramsMatch = def.signature.match(/\(([^)]*)\)/);
      if (paramsMatch) {
        const paramsStr = paramsMatch[1];
        const paramParts = paramsStr
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);

        for (const part of paramParts) {
          const colonIdx = part.indexOf(':');
          if (colonIdx !== -1) {
            parameters.push({
              name: part.substring(0, colonIdx).trim(),
              type: part.substring(colonIdx + 1).trim(),
            });
          } else {
            parameters.push({ name: part });
          }
        }
      }

      // Extract return type: ): ReturnType
      const returnMatch = def.signature.match(/\):\s*([^\s{]+)/);
      if (returnMatch) {
        returnType = returnMatch[1];
      }
    }

    return { parameters, returnType };
  }

  /**
   * Gather contextual information
   */
  private async gatherContext(
    symbolName: string,
    def: DefinitionResult,
  ): Promise<{
    usageCount: number;
    relatedSymbols: string[];
    isPublic: boolean;
  }> {
    // Placeholder: In real implementation, use ReferencesFinder service
    // For now, use heuristics based on definition
    const isPublic =
      def.signature?.includes('export') || def.signature?.includes('public') || false;

    return {
      usageCount: 0, // Unknown without references
      relatedSymbols: [],
      isPublic,
    };
  }

  /**
   * Generate documentation sections
   */
  private async generateSections(params: {
    def: DefinitionResult;
    signature: ReturnType<typeof this.parseSignature>;
    context: Awaited<ReturnType<typeof this.gatherContext>>;
    includeExamples: boolean;
  }): Promise<GeneratedDoc['sections']> {
    const { def, signature, context, includeExamples } = params;

    // Generate summary
    const summary = this.generateSummary(def, context);

    // Generate description
    const description = this.generateDescription(def, context);

    // Generate parameter docs
    const parameters = signature.parameters.map((param) => ({
      name: param.name,
      type: param.type,
      description: this.generateParamDescription(param.name, def),
    }));

    // Generate return docs
    const returns = signature.returnType
      ? {
          type: signature.returnType,
          description: this.generateReturnDescription(signature.returnType, def),
        }
      : undefined;

    // Generate examples
    const examples = includeExamples ? await this.generateExamples(def, context) : undefined;

    // Generate see also links
    const seeAlso =
      context.relatedSymbols.length > 0 ? context.relatedSymbols.slice(0, 3) : undefined;

    return {
      summary,
      description,
      parameters: parameters.length > 0 ? parameters : undefined,
      returns,
      examples,
      seeAlso,
    };
  }

  /**
   * Generate summary line
   */
  private generateSummary(
    def: DefinitionResult,
    _: { isPublic: boolean; usageCount: number },
  ): string {
    const name = def.name;
    const kind = def.type;

    // Context-aware summary generation
    if (name.startsWith('get') || name.startsWith('fetch') || name.startsWith('load')) {
      return `Retrieves ${this.humanizeName(name.replace(/^(get|fetch|load)/, ''))}`;
    } else if (name.startsWith('set') || name.startsWith('update') || name.startsWith('save')) {
      return `Updates ${this.humanizeName(name.replace(/^(set|update|save)/, ''))}`;
    } else if (name.startsWith('delete') || name.startsWith('remove')) {
      return `Deletes ${this.humanizeName(name.replace(/^(delete|remove)/, ''))}`;
    } else if (name.startsWith('create') || name.startsWith('build')) {
      return `Creates ${this.humanizeName(name.replace(/^(create|build)/, ''))}`;
    } else if (
      name.startsWith('validate') ||
      name.startsWith('check') ||
      name.startsWith('verify')
    ) {
      return `Validates ${this.humanizeName(name.replace(/^(validate|check|verify)/, ''))}`;
    } else if (name.startsWith('calculate') || name.startsWith('compute')) {
      return `Calculates ${this.humanizeName(name.replace(/^(calculate|compute)/, ''))}`;
    } else if (name.startsWith('format') || name.startsWith('render')) {
      return `Formats ${this.humanizeName(name.replace(/^(format|render)/, ''))}`;
    }

    // Default summary
    return `${kind}: ${name}`;
  }

  /**
   * Generate detailed description
   */
  private generateDescription(
    def: DefinitionResult,
    context: { isPublic: boolean; usageCount: number },
  ): string {
    const lines: string[] = [];

    lines.push(
      `This ${def.type} is ${context.isPublic ? 'part of the public API' : 'for internal use'}.`,
    );

    if (context.usageCount > 0) {
      lines.push(`Currently used in ${context.usageCount} place(s) across the project.`);
    } else {
      lines.push('Currently not used in the project (may be a new implementation).');
    }

    return lines.join(' ');
  }

  /**
   * Generate parameter description
   */
  private generateParamDescription(paramName: string, _: DefinitionResult): string {
    // Pattern-based description generation
    if (paramName === 'options' || paramName === 'config') {
      return 'Configuration options';
    } else if (paramName.includes('callback') || paramName.includes('handler')) {
      return 'Callback function to execute';
    } else if (paramName.endsWith('Path') || paramName.includes('file')) {
      return 'File path';
    } else if (paramName.endsWith('Id') || paramName === 'id') {
      return 'Unique identifier';
    } else if (paramName.includes('name')) {
      return 'Name';
    }

    return `The ${paramName} parameter`;
  }

  /**
   * Generate return value description
   */
  private generateReturnDescription(returnType: string, _: DefinitionResult): string {
    if (returnType.includes('Promise')) {
      return `A promise that resolves to ${returnType.replace(/Promise<(.*)>/, '$1')}`;
    } else if (returnType === 'void') {
      return 'No return value';
    } else if (returnType === 'boolean') {
      return 'True if successful, false otherwise';
    }

    return `Returns ${returnType}`;
  }

  /**
   * Generate usage examples
   */
  private async generateExamples(
    def: DefinitionResult,
    context: { usageCount: number },
  ): Promise<string[]> {
    const examples: string[] = [];

    // Generate basic example
    const signature = this.parseSignature(def);
    const exampleCall = this.generateExampleCall(def.name, signature);

    examples.push(`\`\`\`typescript\n${exampleCall}\n\`\`\``);

    // If used in project, suggest looking at real usage
    if (context.usageCount > 0) {
      examples.push('See usage examples in the project with `code.findReferences`');
    }

    return examples;
  }

  /**
   * Generate example function call
   */
  private generateExampleCall(
    name: string,
    signature: ReturnType<typeof this.parseSignature>,
  ): string {
    const params = signature.parameters
      .map((p) => {
        if (p.type?.includes('string')) return `"example"`;
        if (p.type?.includes('number')) return `42`;
        if (p.type?.includes('boolean')) return `true`;
        if (p.type?.includes('[]')) return `[]`;
        if (p.type?.includes('{}') || p.type?.includes('object')) return `{}`;
        return `value`;
      })
      .join(', ');

    const call = `${name}(${params})`;

    if (signature.returnType?.includes('Promise')) {
      return `const result = await ${call};`;
    } else if (signature.returnType && signature.returnType !== 'void') {
      return `const result = ${call};`;
    }

    return `${call};`;
  }

  /**
   * Format documentation in specified format
   */
  private formatDocumentation(sections: GeneratedDoc['sections'], format: DocFormat): string {
    switch (format) {
      case 'jsdoc':
      case 'tsdoc':
        return this.formatJSDoc(sections);
      case 'python-docstring':
        return this.formatPythonDocstring(sections);
      case 'markdown':
        return this.formatMarkdown(sections);
      default:
        return this.formatJSDoc(sections);
    }
  }

  /**
   * Format as JSDoc/TSDoc
   */
  private formatJSDoc(sections: GeneratedDoc['sections']): string {
    const lines: string[] = ['/**'];

    if (sections.summary) {
      lines.push(` * ${sections.summary}`);
      if (sections.description) {
        lines.push(' *');
        lines.push(` * ${sections.description}`);
      }
    }

    if (sections.parameters && sections.parameters.length > 0) {
      lines.push(' *');
      for (const param of sections.parameters) {
        const type = param.type ? `{${param.type}} ` : '';
        lines.push(` * @param ${type}${param.name} - ${param.description}`);
      }
    }

    if (sections.returns) {
      lines.push(' *');
      const type = sections.returns.type ? `{${sections.returns.type}} ` : '';
      lines.push(` * @returns ${type}${sections.returns.description}`);
    }

    if (sections.throws && sections.throws.length > 0) {
      lines.push(' *');
      for (const throwsItem of sections.throws) {
        lines.push(` * @throws {${throwsItem.type}} ${throwsItem.description}`);
      }
    }

    if (sections.examples && sections.examples.length > 0) {
      lines.push(' *');
      lines.push(' * @example');
      for (const example of sections.examples) {
        lines.push(` * ${example.replace(/\n/g, '\n * ')}`);
      }
    }

    if (sections.seeAlso && sections.seeAlso.length > 0) {
      lines.push(' *');
      for (const link of sections.seeAlso) {
        lines.push(` * @see ${link}`);
      }
    }

    lines.push(' */');

    return lines.join('\n');
  }

  /**
   * Format as Python docstring
   */
  private formatPythonDocstring(sections: GeneratedDoc['sections']): string {
    const lines: string[] = ['"""'];

    if (sections.summary) {
      lines.push(sections.summary);
      if (sections.description) {
        lines.push('');
        lines.push(sections.description);
      }
    }

    if (sections.parameters && sections.parameters.length > 0) {
      lines.push('');
      lines.push('Args:');
      for (const param of sections.parameters) {
        const type = param.type ? ` (${param.type})` : '';
        lines.push(`    ${param.name}${type}: ${param.description}`);
      }
    }

    if (sections.returns) {
      lines.push('');
      lines.push('Returns:');
      const type = sections.returns.type ? ` (${sections.returns.type})` : '';
      lines.push(`    ${type}${sections.returns.description}`);
    }

    if (sections.throws && sections.throws.length > 0) {
      lines.push('');
      lines.push('Raises:');
      for (const throwsItem of sections.throws) {
        lines.push(`    ${throwsItem.type}: ${throwsItem.description}`);
      }
    }

    if (sections.examples && sections.examples.length > 0) {
      lines.push('');
      lines.push('Example:');
      for (const example of sections.examples) {
        lines.push(`    ${example.replace(/\n/g, '\n    ')}`);
      }
    }

    lines.push('"""');

    return lines.join('\n');
  }

  /**
   * Format as Markdown
   */
  private formatMarkdown(sections: GeneratedDoc['sections']): string {
    const lines: string[] = [];

    if (sections.summary) {
      lines.push(`## ${sections.summary}`);
      lines.push('');
      if (sections.description) {
        lines.push(sections.description);
        lines.push('');
      }
    }

    if (sections.parameters && sections.parameters.length > 0) {
      lines.push('### Parameters');
      lines.push('');
      for (const param of sections.parameters) {
        const type = param.type ? ` \`${param.type}\`` : '';
        lines.push(`- **${param.name}**${type}: ${param.description}`);
      }
      lines.push('');
    }

    if (sections.returns) {
      lines.push('### Returns');
      lines.push('');
      const type = sections.returns.type ? ` \`${sections.returns.type}\`` : '';
      lines.push(`${type}${sections.returns.description}`);
      lines.push('');
    }

    if (sections.examples && sections.examples.length > 0) {
      lines.push('### Examples');
      lines.push('');
      for (const example of sections.examples) {
        lines.push(example);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(params: {
    status: DocStatus;
    signature: ReturnType<typeof this.parseSignature>;
    context: Awaited<ReturnType<typeof this.gatherContext>>;
    sections: GeneratedDoc['sections'];
  }): number {
    const { status, signature, context, sections } = params;

    let confidence = 0.5; // Base confidence

    // Boost for having signature info
    if (signature.parameters.length > 0 || signature.returnType) {
      confidence += 0.1;
    }

    // Boost for usage context
    if (context.usageCount > 0) {
      confidence += Math.min(context.usageCount / 10, 0.2);
    }

    // Boost for complete sections
    if (sections.summary) confidence += 0.05;
    if (sections.description) confidence += 0.05;
    if (sections.parameters && sections.parameters.length > 0) confidence += 0.05;
    if (sections.returns) confidence += 0.05;

    // Penalize if already complete
    if (status === 'complete') {
      confidence *= 0.7; // Lower confidence since doc already exists
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Explain generation reasoning
   */
  private explainGeneration(
    signature: ReturnType<typeof this.parseSignature>,
    context: Awaited<ReturnType<typeof this.gatherContext>>,
    sections: GeneratedDoc['sections'],
  ): string {
    const reasons: string[] = [];

    if (signature.parameters.length > 0) {
      reasons.push(`Analyzed ${signature.parameters.length} parameter(s)`);
    }

    if (signature.returnType) {
      reasons.push(`Return type: ${signature.returnType}`);
    }

    if (context.usageCount > 0) {
      reasons.push(`Found ${context.usageCount} usage(s) in project`);
    }

    if (context.isPublic) {
      reasons.push('Marked as public API');
    }

    if (sections.examples && sections.examples.length > 0) {
      reasons.push('Generated usage examples');
    }

    return reasons.join('. ');
  }

  /**
   * Humanize camelCase or snake_case name
   */
  private humanizeName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .toLowerCase()
      .trim();
  }
}
