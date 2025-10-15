import { NervusDB } from '@nervusdb/core';

async function main() {
  const db = await NervusDB.open('/Users/luhui/.nervusdb/backend/graph.sdb', {
    enableLock: false,
    registerReader: false,
  });

  console.log('=== DEFINES 关系 (前10条) ===');
  const defines = db.find({ predicate: 'DEFINES' }).all().slice(0, 10);
  for (const fact of defines) {
    console.log(`${fact.subject} -DEFINES-> ${fact.object}`);
  }
  const totalDefines = db.find({ predicate: 'DEFINES' }).all().length;
  console.log(`\n总计: ${totalDefines} 条 DEFINES 关系\n`);

  console.log('=== CALLS 关系 (前10条) ===');
  const calls = db.find({ predicate: 'CALLS' }).all().slice(0, 10);
  for (const fact of calls) {
    console.log(`${fact.subject} -CALLS-> ${fact.object}`);
  }
  const totalCalls = db.find({ predicate: 'CALLS' }).all().length;
  console.log(`\n总计: ${totalCalls} 条 CALLS 关系\n`);

  console.log('=== EXTENDS 关系 (前10条) ===');
  const extends_ = db.find({ predicate: 'EXTENDS' }).all().slice(0, 10);
  for (const fact of extends_) {
    console.log(`${fact.subject} -EXTENDS-> ${fact.object}`);
  }
  const totalExtends = db.find({ predicate: 'EXTENDS' }).all().length;
  console.log(`\n总计: ${totalExtends} 条 EXTENDS 关系\n`);

  console.log('=== IMPLEMENTS 关系 (前10条) ===');
  const implements_ = db.find({ predicate: 'IMPLEMENTS' }).all().slice(0, 10);
  for (const fact of implements_) {
    console.log(`${fact.subject} -IMPLEMENTS-> ${fact.object}`);
  }
  const totalImplements = db.find({ predicate: 'IMPLEMENTS' }).all().length;
  console.log(`\n总计: ${totalImplements} 条 IMPLEMENTS 关系\n`);

  await db.close();
}

main().catch(console.error);
