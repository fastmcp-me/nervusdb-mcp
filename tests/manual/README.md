# 手动测试脚本

这个目录包含用于测试和调试的手动测试脚本。

## 文件说明

### test-repomix.mjs

测试 repomix 1.7.0+ 的正确配置和 API 用法。

**用途**：

- 验证 repomix 配置是否完整
- 调试 repomix 返回的数据结构
- 测试不同配置选项的效果

**运行**：

```bash
node tests/manual/test-repomix.mjs
```

**预期输出**：

```
=== Result keys ===
[...repomix 返回的所有字段]

=== Result summary ===
processedFiles: 7
safeFilePaths: 7
totalFiles: 7
...
```

---

### test-indexing.mjs

测试 IndexingService 的完整索引流程。

**用途**：

- 验证项目索引功能
- 调试索引失败问题
- 测试不同项目的索引性能

**运行**：

```bash
npx tsx tests/manual/test-indexing.mjs
```

**预期输出**：

```
Testing IndexingService...
Project path: /Volumes/WorkDrive/Develop/github/test

Starting indexing...

✅ Indexing completed successfully!
Processed files: 6
Project dir: /path/to/.synapsedb/...
Fingerprint: filesystem
```

**可以修改的参数**：

```javascript
const projectPath = '/path/to/your/project'; // 修改要测试的项目路径
```

---

### test-default-config.mjs

查看 repomix 的默认配置结构（目前无法使用）。

**用途**：

- 了解 repomix 的完整配置结构
- 参考默认配置值

**状态**：

- ⚠️ 由于 repomix 不导出内部模块，此脚本无法运行
- 作为历史参考保留

---

## repomix 1.7.0+ API 变化总结

### 必需的配置字段

repomix 1.7.0+ 需要完整的 `RepomixConfigMerged` 类型配置，包括：

```typescript
const config: RepomixConfigMerged = {
  cwd: projectPath, // ✅ 必需：工作目录
  input: {
    maxFileSize: 50 * 1024 * 1024, // ✅ 必需：最大文件大小
  },
  output: {
    style: 'xml', // ✅ 必需：输出格式
    filePath: 'repomix-output.xml',
    parsableStyle: false,
    fileSummary: false,
    directoryStructure: false,
    files: true,
    copyToClipboard: false,
    compress: false,
    removeComments: false,
    removeEmptyLines: false,
    topFilesLength: 5,
    showLineNumbers: false,
    truncateBase64: false,
    includeEmptyDirectories: false,
    tokenCountTree: false,
    git: {
      // ✅ 必需：git 配置
      sortByChanges: true,
      sortByChangesMaxCommits: 100,
      includeDiffs: false,
      includeLogs: false,
      includeLogsCount: 50,
    },
  },
  include: [], // ✅ 必需：包含模式
  ignore: {
    useGitignore: true,
    useDefaultPatterns: true,
    customPatterns: [],
  },
  security: {
    enableSecurityCheck: false,
  },
  tokenCount: {
    encoding: 'o200k_base', // ✅ 必需：token 编码
  },
};
```

### 常见错误

1. **Cannot read properties of undefined (reading 'map')**
   - 原因：`config.include` 未定义
   - 解决：设置 `include: []`

2. **Unsupported output style: undefined**
   - 原因：`config.output.style` 未定义
   - 解决：设置 `style: 'xml'`

3. **Cannot read properties of undefined (reading 'encoding')**
   - 原因：`config.tokenCount.encoding` 未定义
   - 解决：设置 `encoding: 'o200k_base'`

4. **Cannot read properties of undefined (reading 'maxFileSize')**
   - 原因：`config.input.maxFileSize` 未定义
   - 解决：设置 `maxFileSize: 50 * 1024 * 1024`

5. **Missing cwd field**
   - 原因：`RepomixConfigMerged` 类型要求 `cwd` 字段
   - 解决：设置 `cwd: projectPath`

---

## 参考资源

- [repomix GitHub](https://github.com/yamadashy/repomix)
- [repomix 配置文档](https://github.com/yamadashy/repomix#configuration)
- repomix 测试文件：`node_modules/repomix/tests/testing/testUtils.ts`

---

## 维护说明

这些测试脚本应该：

- ✅ 与生产代码同步更新
- ✅ 包含详细的注释说明
- ✅ 在 API 变化时及时更新
- ✅ 记录遇到的问题和解决方案

最后更新：2025-01-13
