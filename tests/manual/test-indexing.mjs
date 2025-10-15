import { IndexingService } from './src/domain/indexing/indexingService.ts';

const projectPath = '/Volumes/WorkDrive/Develop/github/test';

console.log('Testing IndexingService...');
console.log('Project path:', projectPath);

const service = new IndexingService();

try {
  console.log('\nStarting indexing...');
  const result = await service.index(projectPath);
  
  console.log('\n✅ Indexing completed successfully!');
  console.log('Processed files:', result.processedFiles);
  console.log('Project dir:', result.projectDir);
  console.log('Fingerprint:', result.metadata.fingerprint.value);
} catch (error) {
  console.error('\n❌ Indexing failed:');
  console.error(error);
}
