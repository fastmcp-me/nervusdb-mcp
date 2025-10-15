/**
 * CallHierarchyBuilder Service
 *
 * Transforms QueryService call hierarchy data into visualization-ready formats.
 * Provides ASCII tree rendering, Mermaid diagrams, and depth-based tree pruning.
 *
 * Features:
 * - ASCII art tree visualization
 * - Mermaid flowchart export
 * - Bidirectional hierarchy (callers + callees)
 * - Depth limiting and smart pruning
 * - Navigation metadata (file paths, line numbers)
 * - Performance optimization for large trees
 */

import type {
  QueryService,
  CallHierarchyNode,
  CodeEntityInfo,
} from '../domain/query/queryService.js';

/**
 * Direction for call hierarchy traversal
 */
export type CallHierarchyDirection = 'callers' | 'callees' | 'both';

/**
 * Configuration for call hierarchy building
 */
export interface CallHierarchyConfig {
  /**
   * Maximum depth to traverse (default: 5)
   * Higher values = more complete tree but slower performance
   */
  maxDepth?: number;

  /**
   * Direction to traverse
   * - 'callers': Show who calls this function (upstream)
   * - 'callees': Show what this function calls (downstream)
   * - 'both': Show both directions
   */
  direction?: CallHierarchyDirection;

  /**
   * Maximum children per node before pruning (default: 20)
   * Prevents UI overload for popular functions
   */
  pruneThreshold?: number;

  /**
   * Include file paths and line numbers (default: true)
   */
  includeMetadata?: boolean;

  /**
   * Generate ASCII tree visualization (default: true)
   */
  renderAsciiTree?: boolean;

  /**
   * Generate Mermaid diagram (default: false)
   * Can be large for complex hierarchies
   */
  renderMermaidDiagram?: boolean;
}

/**
 * Input for call hierarchy request
 */
export interface CallHierarchyInput {
  projectPath: string;
  symbolName: string;
  symbolType?: 'function' | 'method' | 'any';
  config?: CallHierarchyConfig;
}

/**
 * Call hierarchy result with visualization
 */
export interface CallHierarchyResult {
  query: {
    symbolName: string;
    symbolType?: string;
    direction: CallHierarchyDirection;
    maxDepth: number;
  };
  rootEntity?: CodeEntityInfo;
  hierarchy: {
    callers?: CallHierarchyNode;
    callees?: CallHierarchyNode;
  };
  visualizations: {
    asciiTree?: string;
    mermaidDiagram?: string;
  };
  stats: {
    totalNodes: number;
    maxDepthReached: number;
    pruned: boolean;
    buildTimeMs: number;
  };
}

/**
 * Service for building and visualizing call hierarchies
 */
export class CallHierarchyBuilder {
  constructor(private readonly deps: { queryService: QueryService }) {}

  /**
   * Build call hierarchy for a symbol
   */
  async buildHierarchy(input: CallHierarchyInput): Promise<CallHierarchyResult> {
    const startTime = Date.now();

    // Default config
    const config: Required<CallHierarchyConfig> = {
      maxDepth: input.config?.maxDepth ?? 5,
      direction: input.config?.direction ?? 'both',
      pruneThreshold: input.config?.pruneThreshold ?? 20,
      includeMetadata: input.config?.includeMetadata ?? true,
      renderAsciiTree: input.config?.renderAsciiTree ?? true,
      renderMermaidDiagram: input.config?.renderMermaidDiagram ?? false,
    };

    // 1. Target entity will be determined by getCallHierarchy
    // For now, we just pass the symbolName and get the hierarchy
    const targetFunctionName = input.symbolName;

    // 2. Build hierarchy using QueryService
    // Note: getCallHierarchy returns both callers and callees in the tree structure
    const fullHierarchy = await this.deps.queryService.getCallHierarchy(
      input.projectPath,
      targetFunctionName,
      config.maxDepth,
    );

    const targetEntity = fullHierarchy.entity;
    const hierarchy: { callers?: CallHierarchyNode; callees?: CallHierarchyNode } = {};

    // Split into callers/callees based on direction
    if (config.direction === 'callers' || config.direction === 'both') {
      hierarchy.callers = fullHierarchy;
    }

    if (config.direction === 'callees' || config.direction === 'both') {
      hierarchy.callees = fullHierarchy;
    }

    // 3. Prune if needed
    let pruned = false;
    if (hierarchy.callers && this.shouldPrune(hierarchy.callers, config.pruneThreshold)) {
      this.pruneTree(hierarchy.callers, config.pruneThreshold);
      pruned = true;
    }
    if (hierarchy.callees && this.shouldPrune(hierarchy.callees, config.pruneThreshold)) {
      this.pruneTree(hierarchy.callees, config.pruneThreshold);
      pruned = true;
    }

    // 4. Calculate stats
    const stats = {
      totalNodes: this.countNodes(hierarchy.callers) + this.countNodes(hierarchy.callees),
      maxDepthReached: Math.max(
        this.getMaxDepth(hierarchy.callers),
        this.getMaxDepth(hierarchy.callees),
      ),
      pruned,
      buildTimeMs: Date.now() - startTime,
    };

    // 5. Generate visualizations
    const visualizations: { asciiTree?: string; mermaidDiagram?: string } = {};

    if (config.renderAsciiTree) {
      visualizations.asciiTree = this.renderAsciiTree(
        targetEntity,
        hierarchy,
        config.includeMetadata,
      );
    }

    if (config.renderMermaidDiagram) {
      visualizations.mermaidDiagram = this.renderMermaidDiagram(targetEntity, hierarchy);
    }

    return {
      query: {
        symbolName: input.symbolName,
        symbolType: input.symbolType,
        direction: config.direction,
        maxDepth: config.maxDepth,
      },
      rootEntity: targetEntity,
      hierarchy,
      visualizations,
      stats,
    };
  }

  /**
   * Check if tree should be pruned
   */
  private shouldPrune(node: CallHierarchyNode | undefined, threshold: number): boolean {
    if (!node) return false;
    return node.callers.length > threshold || node.callees.length > threshold;
  }

  /**
   * Prune tree by limiting children per node
   */
  private pruneTree(node: CallHierarchyNode, threshold: number): void {
    if (node.callers.length > threshold) {
      node.callers = node.callers.slice(0, threshold);
    }
    if (node.callees.length > threshold) {
      node.callees = node.callees.slice(0, threshold);
    }

    // Recurse
    for (const child of [...node.callers, ...node.callees]) {
      this.pruneTree(child, threshold);
    }
  }

  /**
   * Count total nodes in tree
   */
  private countNodes(node: CallHierarchyNode | undefined): number {
    if (!node) return 0;
    let count = 1;
    for (const child of [...node.callers, ...node.callees]) {
      count += this.countNodes(child);
    }
    return count;
  }

  /**
   * Get maximum depth reached
   */
  private getMaxDepth(node: CallHierarchyNode | undefined, currentDepth = 0): number {
    if (!node) return currentDepth;
    let maxDepth = currentDepth;
    for (const child of [...node.callers, ...node.callees]) {
      maxDepth = Math.max(maxDepth, this.getMaxDepth(child, currentDepth + 1));
    }
    return maxDepth;
  }

  /**
   * Render ASCII tree visualization
   */
  private renderAsciiTree(
    root: CodeEntityInfo,
    hierarchy: { callers?: CallHierarchyNode; callees?: CallHierarchyNode },
    includeMetadata: boolean,
  ): string {
    const lines: string[] = [];

    // Title
    lines.push(`Call Hierarchy: ${root.name} (${root.type})`);
    if (includeMetadata && root.filePath) {
      lines.push(`Location: ${root.filePath}:${root.startLine}`);
    }
    lines.push('');

    // Callers section
    if (hierarchy.callers && hierarchy.callers.callers.length > 0) {
      lines.push('📞 Callers (who calls this):');
      lines.push('');
      this.renderTreeNode(hierarchy.callers, '', true, lines, includeMetadata, 'callers');
      lines.push('');
    }

    // Root node
    lines.push(`🎯 ${root.name} (${root.type})`);
    if (includeMetadata && root.signature) {
      lines.push(`   ${root.signature}`);
    }
    lines.push('');

    // Callees section
    if (hierarchy.callees && hierarchy.callees.callees.length > 0) {
      lines.push('📱 Callees (what this calls):');
      lines.push('');
      this.renderTreeNode(hierarchy.callees, '', true, lines, includeMetadata, 'callees');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Recursively render tree node
   */
  private renderTreeNode(
    node: CallHierarchyNode,
    prefix: string,
    isRoot: boolean,
    lines: string[],
    includeMetadata: boolean,
    direction: 'callers' | 'callees',
  ): void {
    const children = direction === 'callers' ? node.callers : node.callees;

    if (isRoot) {
      // Root node already shown, just render children
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const isLast = i === children.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        // Node line
        const line = `${prefix}${connector}${child.entity.name} (${child.entity.type})`;
        lines.push(line);

        // Metadata
        if (includeMetadata && child.entity.filePath) {
          lines.push(`${newPrefix}📁 ${child.entity.filePath}:${child.entity.startLine}`);
        }

        // Recurse
        const grandChildren = direction === 'callers' ? child.callers : child.callees;
        if (grandChildren.length > 0) {
          this.renderTreeNode(child, newPrefix, false, lines, includeMetadata, direction);
        }
      }
    } else {
      // Non-root: already rendered by parent, just recurse
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const isLast = i === children.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        lines.push(`${prefix}${connector}${child.entity.name} (${child.entity.type})`);

        if (includeMetadata && child.entity.filePath) {
          lines.push(`${newPrefix}📁 ${child.entity.filePath}:${child.entity.startLine}`);
        }

        const grandChildren = direction === 'callers' ? child.callers : child.callees;
        if (grandChildren.length > 0) {
          this.renderTreeNode(child, newPrefix, false, lines, includeMetadata, direction);
        }
      }
    }
  }

  /**
   * Render Mermaid flowchart diagram
   */
  private renderMermaidDiagram(
    root: CodeEntityInfo,
    hierarchy: { callers?: CallHierarchyNode; callees?: CallHierarchyNode },
  ): string {
    const lines: string[] = [];
    const nodeIds = new Map<string, string>(); // entity.id -> mermaid node id
    let nextNodeId = 0;

    const getNodeId = (nodeId: string): string => {
      if (!nodeIds.has(nodeId)) {
        nodeIds.set(nodeId, `n${nextNodeId++}`);
      }
      return nodeIds.get(nodeId)!;
    };

    lines.push('```mermaid');
    lines.push('graph TD');

    // Root node
    const rootId = getNodeId(root.nodeId);
    lines.push(`  ${rootId}["🎯 ${root.name}"]`);
    lines.push(`  style ${rootId} fill:#f9f,stroke:#333,stroke-width:3px`);

    // Render callers
    if (hierarchy.callers) {
      this.renderMermaidNode(hierarchy.callers, rootId, 'caller', lines, getNodeId);
    }

    // Render callees
    if (hierarchy.callees) {
      this.renderMermaidNode(hierarchy.callees, rootId, 'callee', lines, getNodeId);
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Recursively render Mermaid nodes
   */
  private renderMermaidNode(
    node: CallHierarchyNode,
    parentId: string,
    relation: 'caller' | 'callee',
    lines: string[],
    getNodeId: (id: string) => string,
  ): void {
    const children = relation === 'caller' ? node.callers : node.callees;

    for (const child of children) {
      const childId = getNodeId(child.entity.nodeId);
      const label = `${child.entity.name}`;

      // Node definition
      lines.push(`  ${childId}["${label}"]`);

      // Edge
      if (relation === 'caller') {
        lines.push(`  ${childId} -->|calls| ${parentId}`);
      } else {
        lines.push(`  ${parentId} -->|calls| ${childId}`);
      }

      // Recurse
      const grandChildren = relation === 'caller' ? child.callers : child.callees;
      if (grandChildren.length > 0) {
        this.renderMermaidNode(child, childId, relation, lines, getNodeId);
      }
    }
  }
}
