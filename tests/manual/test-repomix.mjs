import { pack } from 'repomix';

const projectPath = '/Volumes/WorkDrive/Develop/github/test';

console.log('Testing repomix pack function...');
console.log('Project path:', projectPath);

try {
  const result = await pack(
    [projectPath],
    {
      input: {
        maxFileSize: 50 * 1024 * 1024, // Required by repomix 1.7.0+
      },
      output: {
        style: 'xml', // Required by repomix 1.7.0+
        fileSummary: false,
        directoryStructure: false,
        files: true,
        copyToClipboard: false,
        compress: false,
        removeComments: false,
        removeEmptyLines: false,
      },
      ignore: {
        useGitignore: true,
        useDefaultPatterns: true,
        customPatterns: [],
      },
      security: {
        enableSecurityCheck: false,
      },
      tokenCount: {
        encoding: 'o200k_base', // Required by repomix 1.7.0+
      },
      include: [],
    },
    () => {},
    {
      writeOutputToDisk: async () => undefined,
      copyToClipboardIfEnabled: async () => undefined,
    }
  );

  console.log('\n=== Result keys ===');
  console.log(Object.keys(result));
  
  console.log('\n=== Result summary ===');
  console.log('processedFiles:', result.processedFiles?.length ?? 'undefined');
  console.log('safeFilePaths:', result.safeFilePaths?.length ?? 'undefined');
  console.log('totalFiles:', result.totalFiles ?? 'undefined');
  console.log('totalCharacters:', result.totalCharacters ?? 'undefined');
  console.log('totalTokens:', result.totalTokens ?? 'undefined');
  
  if (result.processedFiles) {
    console.log('\n=== First processed file ===');
    console.log(result.processedFiles[0]);
  }
  
  if (result.safeFilePaths) {
    console.log('\n=== First 5 safe file paths ===');
    console.log(result.safeFilePaths.slice(0, 5));
  }
} catch (error) {
  console.error('\n=== ERROR ===');
  console.error(error);
}
