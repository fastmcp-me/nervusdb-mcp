import { NervusDB } from '@nervusdb/core';

const dbPath = '/Users/luhui/.nervusdb/backend/graph.sdb';

async function testCypherCount() {
  // Open database with Cypher support
  const db = await NervusDB.open(dbPath, {
    enableLock: false,
    registerReader: false,
    experimental: { cypher: true },
  });

  try {
    console.log('=== Testing Cypher COUNT Queries ===\n');

    // Test 1: Simple MATCH query
    console.log('1. Simple MATCH DEFINES:');
    const definesResult = await db.cypher('MATCH (s)-[r:DEFINES]->(o) RETURN s, r, o LIMIT 3', {});
    console.log('  Result count:', definesResult.records.length);
    console.log('  First record:', JSON.stringify(definesResult.records[0], null, 2));
    console.log('  Execution time:', definesResult.summary.resultConsumedAfter, 'ms\n');

    // Test 2: Count CALLS relations
    console.log('2. Count CALLS relations:');
    const callsResult = await db.cypher('MATCH (s)-[r:CALLS]->(o) RETURN count(r) as total', {});
    console.log('  Result:', callsResult.records);
    console.log('  Execution time:', callsResult.summary.resultConsumedAfter, 'ms\n');

    // Test 3: Count by predicate with parameters
    console.log('3. Count by predicate (parameterized):');
    const paramResult = await db.cypher(
      'MATCH (s)-[r]->(o) WHERE type(r) = $predType RETURN count(r) as total',
      { predType: 'IMPLEMENTS' },
    );
    console.log('  Result:', paramResult.records);
    console.log('  Execution time:', paramResult.summary.resultConsumedAfter, 'ms\n');

    // Test 4: Multiple aggregations
    console.log('4. Multiple aggregations:');
    const multiResult = await db.cypher(
      `MATCH (s)-[r]->(o)
      RETURN
        type(r) as relationType,
        count(r) as count
      ORDER BY count DESC`,
      {},
    );
    console.log('  Result:');
    multiResult.records.forEach((record) => {
      console.log(`    ${record.relationType}: ${record.count}`);
    });
    console.log('  Execution time:', multiResult.summary.resultConsumedAfter, 'ms\n');
  } finally {
    await db.close();
  }
}

testCypherCount().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
