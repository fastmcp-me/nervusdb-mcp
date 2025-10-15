/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '禁止循环依赖',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-tools-to-tools',
      comment: '工具之间禁止直接依赖（index.ts 作为注册器除外）',
      severity: 'error',
      from: {
        path: '^src/tools/.+',
        pathNot: '^src/tools/index\\.ts$',
      },
      to: {
        path: '^src/tools/.+',
      },
    },
    {
      name: 'only-allow-upwards',
      comment: '下层不得依赖上层',
      severity: 'error',
      from: {
        path: '^src/(domain|infrastructure)/',
      },
      to: {
        path: '^src/(services|tools)/',
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js'],
    },
    exclude: {
      path: 'node_modules',
    },
  },
};
