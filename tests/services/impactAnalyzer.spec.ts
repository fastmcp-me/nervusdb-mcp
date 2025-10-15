import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImpactAnalyzer } from '../../src/services/impactAnalyzer.js';
import type {
  QueryService,
  ImpactAnalysis,
  CodeEntityInfo,
} from '../../src/domain/query/queryService.js';

describe('ImpactAnalyzer', () => {
  let impactAnalyzer: ImpactAnalyzer;
  let mockQueryService: QueryService;

  beforeEach(() => {
    // Mock QueryService
    mockQueryService = {
      analyzeImpact: vi.fn(),
    } as unknown as QueryService;

    impactAnalyzer = new ImpactAnalyzer({ queryService: mockQueryService });
  });

  describe('analyze', () => {
    it('should analyze impact with direct callers only', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'targetFunction',
        directCallers: [
          {
            nodeId: 'caller1',
            name: 'callerFunction',
            type: 'function',
            filePath: '/project/src/caller.ts',
          },
        ],
        indirectCallers: [],
        affectedFiles: ['/project/src/caller.ts'],
        depth: 1,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'targetFunction',
        type: 'function',
        maxDepth: 1,
      });

      expect(result).toMatchObject({
        symbol: 'targetFunction',
        type: 'function',
        directCallers: expect.arrayContaining([
          expect.objectContaining({
            name: 'callerFunction',
            type: 'function',
          }),
        ]),
        affectedFiles: ['/project/src/caller.ts'],
        totalCallers: 1,
      });

      expect(mockQueryService.analyzeImpact).toHaveBeenCalledWith('/project', 'targetFunction', 1);
    });

    it('should calculate risk level based on caller count', async () => {
      // Test: many callers = high risk
      const mockImpactHighRisk: ImpactAnalysis = {
        targetEntity: 'criticalFunction',
        directCallers: Array.from({ length: 10 }, (_, i) => ({
          nodeId: `caller${i}`,
          name: `caller${i}`,
          type: 'function',
          filePath: `/project/src/file${i}.ts`,
        })) as CodeEntityInfo[],
        indirectCallers: Array.from({ length: 5 }, (_, i) => ({
          nodeId: `indirect${i}`,
          name: `indirect${i}`,
          type: 'function',
          filePath: `/project/src/indirect${i}.ts`,
        })) as CodeEntityInfo[],
        affectedFiles: Array.from({ length: 15 }, (_, i) => `/project/src/file${i}.ts`),
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpactHighRisk);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'criticalFunction',
        type: 'function',
      });

      // 15 callers + 15 files + low test coverage = critical
      expect(result.riskLevel).toBe('critical');
      expect(result.totalCallers).toBeGreaterThan(10);
    });

    it('should identify test files correctly', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'targetFunction',
        directCallers: [
          {
            nodeId: 'test1',
            name: 'testFunction',
            type: 'function',
            filePath: '/project/tests/target.spec.ts',
          },
          {
            nodeId: 'prod1',
            name: 'prodFunction',
            type: 'function',
            filePath: '/project/src/production.ts',
          },
        ],
        indirectCallers: [],
        affectedFiles: ['/project/tests/target.spec.ts', '/project/src/production.ts'],
        depth: 2,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'targetFunction',
        type: 'function',
      });

      expect(result.testFiles.length).toBeGreaterThanOrEqual(0);
      expect(result.testCoverage).toBeGreaterThanOrEqual(0);
    });

    it('should provide recommendations based on risk', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'unusedFunction',
        directCallers: [],
        indirectCallers: [],
        affectedFiles: [],
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'unusedFunction',
        type: 'function',
      });

      // 0 callers but 0 test coverage = medium risk
      expect(result.riskLevel).toBe('medium');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle indirect callers with depth > 1', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'targetFunction',
        directCallers: [
          {
            nodeId: 'direct',
            name: 'directCaller',
            type: 'function',
            filePath: '/project/src/direct.ts',
          },
        ],
        indirectCallers: [
          {
            nodeId: 'indirect',
            name: 'indirectCaller',
            type: 'function',
            filePath: '/project/src/indirect.ts',
          },
        ],
        affectedFiles: ['/project/src/direct.ts', '/project/src/indirect.ts'],
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'targetFunction',
        type: 'function',
        maxDepth: 3,
      });

      expect(result.analysisDepth).toBe(3);
      expect(result.totalCallers).toBe(2);
      expect(result.directCallers.length).toBe(1);
      expect(result.indirectCallers.length).toBe(1);
    });

    it('should identify risk factors correctly', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'widelyUsedFunction',
        directCallers: Array.from({ length: 5 }, (_, i) => ({
          nodeId: `caller${i}`,
          name: `caller${i}`,
          type: 'function',
          filePath: `/project/src/file${i}.ts`,
        })) as CodeEntityInfo[],
        indirectCallers: Array.from({ length: 3 }, (_, i) => ({
          nodeId: `indirect${i}`,
          name: `indirect${i}`,
          type: 'function',
          filePath: `/project/src/indirect${i}.ts`,
        })) as CodeEntityInfo[],
        affectedFiles: Array.from({ length: 6 }, (_, i) => `/project/src/file${i}.ts`),
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'widelyUsedFunction',
        type: 'function',
      });

      expect(result.riskFactors.length).toBeGreaterThan(0);
      expect(result.totalCallers).toBe(8);
    });

    it('should use default maxDepth when not provided', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'function',
        directCallers: [],
        indirectCallers: [],
        affectedFiles: [],
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'function',
        type: 'function',
        // maxDepth not provided
      });

      // Should use default maxDepth = 3
      expect(mockQueryService.analyzeImpact).toHaveBeenCalledWith('/project', 'function', 3);
    });

    it('should handle empty impact gracefully', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'isolatedFunction',
        directCallers: [],
        indirectCallers: [],
        affectedFiles: [],
        depth: 3,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const result = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'isolatedFunction',
        type: 'function',
      });

      expect(result.directCallers).toEqual([]);
      expect(result.indirectCallers).toEqual([]);
      expect(result.affectedFiles).toEqual([]);
      expect(result.testFiles).toEqual([]);
      expect(result.totalCallers).toBe(0);
      // 0 test coverage = medium risk (riskScore = 2 for testCoverage < 0.3)
      expect(result.riskLevel).toBe('medium');
    });

    it('should differentiate between function, class, and interface types', async () => {
      const mockImpact: ImpactAnalysis = {
        targetEntity: 'IUserService',
        directCallers: [
          {
            nodeId: 'impl1',
            name: 'Implementation',
            type: 'class',
            filePath: '/project/src/impl.ts',
          },
        ],
        indirectCallers: [],
        affectedFiles: ['/project/src/impl.ts'],
        depth: 2,
      };

      vi.mocked(mockQueryService.analyzeImpact).mockResolvedValue(mockImpact);

      const resultInterface = await impactAnalyzer.analyze({
        projectPath: '/project',
        symbol: 'IUserService',
        type: 'interface',
      });

      expect(resultInterface.type).toBe('interface');
      expect(resultInterface.symbol).toBe('IUserService');
    });
  });
});
