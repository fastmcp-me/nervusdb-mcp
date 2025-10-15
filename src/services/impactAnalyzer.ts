/**
 * Impact Analyzer Service
 *
 * 提供智能的代码变更影响分析，包括：
 * - 直接和间接调用者分析
 * - 受影响文件列表
 * - 相关测试文件发现
 * - 风险等级评估
 */

import { globSync } from 'glob';
import path from 'node:path';
import type { QueryService, ImpactAnalysis, CodeEntityInfo } from '../domain/query/queryService.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ service: 'ImpactAnalyzer' });

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 增强的影响分析结果
 */
export interface EnhancedImpactAnalysis {
  symbol: string;
  type: 'function' | 'class' | 'interface';

  // 调用者信息
  directCallers: CodeEntityInfo[];
  indirectCallers: CodeEntityInfo[];

  // 受影响的文件
  affectedFiles: string[];

  // 测试覆盖
  testFiles: string[];
  testCoverage: number; // 0.0 - 1.0

  // 风险评估
  riskLevel: RiskLevel;
  riskFactors: string[];

  // 建议
  recommendations: string[];

  // 元数据
  analysisDepth: number;
  totalCallers: number;
}

/**
 * 分析输入
 */
export interface AnalyzeImpactInput {
  projectPath: string;
  symbol: string;
  type: 'function' | 'class' | 'interface';
  maxDepth?: number;
}

export interface ImpactAnalyzerDependencies {
  queryService: QueryService;
}

export class ImpactAnalyzer {
  constructor(private readonly deps: ImpactAnalyzerDependencies) {}

  /**
   * 分析符号变更的影响
   */
  async analyze(input: AnalyzeImpactInput): Promise<EnhancedImpactAnalysis> {
    const maxDepth = input.maxDepth ?? 3;

    logger.info({ symbol: input.symbol, type: input.type, maxDepth }, 'Starting impact analysis');

    // 1. 获取基础影响分析（使用 QueryService）
    const impact = await this.deps.queryService.analyzeImpact(
      input.projectPath,
      input.symbol,
      maxDepth,
    );

    // 2. 发现相关测试文件
    const testFiles = await this.findTestFiles(input.projectPath, impact.affectedFiles);
    const testCoverage = this.calculateTestCoverage(impact.affectedFiles, testFiles);

    // 3. 计算风险等级
    const riskLevel = this.calculateRiskLevel(impact, testCoverage);

    // 4. 生成风险因素说明
    const riskFactors = this.explainRiskFactors(impact, testCoverage);

    // 5. 生成建议
    const recommendations = this.generateRecommendations(impact, testCoverage, riskLevel);

    const result: EnhancedImpactAnalysis = {
      symbol: input.symbol,
      type: input.type,
      directCallers: impact.directCallers,
      indirectCallers: impact.indirectCallers,
      affectedFiles: impact.affectedFiles,
      testFiles,
      testCoverage,
      riskLevel,
      riskFactors,
      recommendations,
      analysisDepth: impact.depth,
      totalCallers: impact.directCallers.length + impact.indirectCallers.length,
    };

    logger.info(
      {
        symbol: input.symbol,
        totalCallers: result.totalCallers,
        affectedFiles: result.affectedFiles.length,
        testFiles: testFiles.length,
        riskLevel,
      },
      'Impact analysis completed',
    );

    return result;
  }

  /**
   * 发现与受影响文件相关的测试文件
   */
  private async findTestFiles(projectPath: string, affectedFiles: string[]): Promise<string[]> {
    const testFiles = new Set<string>();

    // 策略 1: 直接查找对应的测试文件
    for (const file of affectedFiles) {
      const testCandidates = this.generateTestFilePatterns(file);

      for (const pattern of testCandidates) {
        try {
          const matches = globSync(pattern, {
            cwd: projectPath,
            nodir: true,
            ignore: ['node_modules/**', 'dist/**', 'build/**'],
          });

          for (const match of matches) {
            testFiles.add(match);
          }
        } catch (error) {
          logger.debug({ pattern, error }, 'Failed to glob test files');
        }
      }
    }

    // 策略 2: 查找可能import了这些文件的测试
    // (简化实现：基于文件名匹配)
    for (const file of affectedFiles) {
      const baseName = path.basename(file, path.extname(file));
      const patterns = [
        `**/${baseName}.spec.{ts,js}`,
        `**/${baseName}.test.{ts,js}`,
        `**/test/**/*${baseName}*.{ts,js}`,
        `**/__tests__/**/*${baseName}*.{ts,js}`,
      ];

      for (const pattern of patterns) {
        try {
          const matches = globSync(pattern, {
            cwd: projectPath,
            nodir: true,
            ignore: ['node_modules/**', 'dist/**', 'build/**'],
          });

          for (const match of matches) {
            testFiles.add(match);
          }
        } catch (error) {
          logger.debug({ pattern, error }, 'Failed to glob related test files');
        }
      }
    }

    return Array.from(testFiles);
  }

  /**
   * 生成可能的测试文件路径模式
   */
  private generateTestFilePatterns(sourceFile: string): string[] {
    const dir = path.dirname(sourceFile);
    const baseName = path.basename(sourceFile, path.extname(sourceFile));

    return [
      // 同目录下的测试文件
      `${dir}/${baseName}.spec.{ts,js}`,
      `${dir}/${baseName}.test.{ts,js}`,

      // tests/ 目录镜像结构
      `tests/${dir}/${baseName}.spec.{ts,js}`,
      `tests/${dir}/${baseName}.test.{ts,js}`,

      // __tests__ 目录
      `${dir}/__tests__/${baseName}.spec.{ts,js}`,
      `${dir}/__tests__/${baseName}.test.{ts,js}`,

      // test/ 目录（单数）
      `test/${dir}/${baseName}.spec.{ts,js}`,
      `test/${dir}/${baseName}.test.{ts,js}`,
    ];
  }

  /**
   * 计算测试覆盖率
   */
  private calculateTestCoverage(affectedFiles: string[], testFiles: string[]): number {
    if (affectedFiles.length === 0) return 0;

    // 简化实现：计算有对应测试的文件比例
    let coveredFiles = 0;

    for (const file of affectedFiles) {
      const baseName = path.basename(file, path.extname(file));
      const hasTest = testFiles.some((testFile) => testFile.includes(baseName));

      if (hasTest) coveredFiles++;
    }

    return coveredFiles / affectedFiles.length;
  }

  /**
   * 计算风险等级
   */
  private calculateRiskLevel(impact: ImpactAnalysis, testCoverage: number): RiskLevel {
    const totalCallers = impact.directCallers.length + impact.indirectCallers.length;
    const affectedFilesCount = impact.affectedFiles.length;

    // 风险因素权重
    let riskScore = 0;

    // 调用者数量影响
    if (totalCallers >= 20) riskScore += 3;
    else if (totalCallers >= 10) riskScore += 2;
    else if (totalCallers >= 5) riskScore += 1;

    // 受影响文件数量
    if (affectedFilesCount >= 10) riskScore += 2;
    else if (affectedFilesCount >= 5) riskScore += 1;

    // 测试覆盖率（负向影响）
    if (testCoverage < 0.3) riskScore += 2;
    else if (testCoverage < 0.6) riskScore += 1;
    else if (testCoverage >= 0.8) riskScore -= 1; // 高覆盖率降低风险

    // 间接调用者比例（复杂度指标）
    if (impact.indirectCallers.length > impact.directCallers.length * 2) {
      riskScore += 1;
    }

    // 评分到等级的映射
    if (riskScore >= 6) return 'critical';
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * 解释风险因素
   */
  private explainRiskFactors(impact: ImpactAnalysis, testCoverage: number): string[] {
    const factors: string[] = [];
    const totalCallers = impact.directCallers.length + impact.indirectCallers.length;

    // 调用者分析
    if (impact.directCallers.length > 0) {
      factors.push(`${impact.directCallers.length} direct caller(s) found`);
    }
    if (impact.indirectCallers.length > 0) {
      factors.push(`${impact.indirectCallers.length} indirect caller(s) found`);
    }
    if (totalCallers === 0) {
      factors.push('No callers found (possibly unused code)');
    }

    // 文件影响分析
    if (impact.affectedFiles.length > 10) {
      factors.push(`High file impact: ${impact.affectedFiles.length} files affected`);
    } else if (impact.affectedFiles.length > 5) {
      factors.push(`Medium file impact: ${impact.affectedFiles.length} files affected`);
    } else if (impact.affectedFiles.length > 0) {
      factors.push(`Low file impact: ${impact.affectedFiles.length} file(s) affected`);
    }

    // 测试覆盖分析
    const coveragePercent = Math.round(testCoverage * 100);
    if (testCoverage >= 0.8) {
      factors.push(`Good test coverage: ${coveragePercent}%`);
    } else if (testCoverage >= 0.6) {
      factors.push(`Moderate test coverage: ${coveragePercent}%`);
    } else if (testCoverage >= 0.3) {
      factors.push(`Low test coverage: ${coveragePercent}%`);
    } else {
      factors.push(`Very low test coverage: ${coveragePercent}%`);
    }

    // 调用复杂度分析
    if (impact.indirectCallers.length > impact.directCallers.length * 2) {
      factors.push('High indirect call complexity (long call chains)');
    }

    return factors;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    impact: ImpactAnalysis,
    testCoverage: number,
    riskLevel: RiskLevel,
  ): string[] {
    const recommendations: string[] = [];
    const totalCallers = impact.directCallers.length + impact.indirectCallers.length;

    // 基于风险等级的建议
    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push(
        '⚠️ High risk change - consider breaking down into smaller modifications',
      );
      recommendations.push('Conduct thorough code review with team members');
    }

    // 测试相关建议
    if (testCoverage < 0.6) {
      recommendations.push('Add unit tests for affected components before refactoring');
    }
    if (testCoverage < 0.3) {
      recommendations.push('⚠️ Critical: Very low test coverage - write tests first!');
    }

    // 调用者相关建议
    if (totalCallers > 10) {
      recommendations.push('Consider using "Find All References" to review all usage sites');
    }
    if (impact.indirectCallers.length > 5) {
      recommendations.push('Review call hierarchy to understand full impact chain');
    }

    // 文件影响建议
    if (impact.affectedFiles.length > 10) {
      recommendations.push('Use impact analysis to prioritize review of most critical files');
    }

    // 无调用者的情况
    if (totalCallers === 0) {
      recommendations.push('No callers found - consider removing unused code');
    }

    // 通用建议
    if (riskLevel !== 'low') {
      recommendations.push('Run full test suite after changes');
      recommendations.push('Deploy to staging environment first');
    }

    // 如果没有特定建议，提供默认建议
    if (recommendations.length === 0) {
      recommendations.push('Low risk change - standard code review process applies');
      recommendations.push('Run affected tests to verify changes');
    }

    return recommendations;
  }
}
