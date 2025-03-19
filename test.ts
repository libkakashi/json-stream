import Queue from 'superqueue';
import JsonParser from './src';

const testCases = [
  {
    name: 'Simple object',
    input: '{"name":"John","age":30}',
    expected: { name: 'John', age: 30 }
  },
  {
    name: 'Nested object',
    input: '{"person":{"name":"John","age":30}}',
    expected: { person: { name: 'John', age: 30 } }
  },
  {
    name: 'Array',
    input: '[1,2,3,4,5]',
    expected: [1, 2, 3, 4, 5]
  },
  {
    name: 'Object with array',
    input: '{\ntitle:[1,2,3],active:[{title: "test"}]}',
    expected: { title: [1, 2, 3], active: [{ title: 'test' }] }
  },
  {
    name: 'Array of objects',
    input: '[{"id":1},{id_id:2}]',
    expected: [{ id: 1 }, { id_id: 2 }]
  },
  {
    name: 'Empty object',
    input: '{}',
    expected: {}
  },
  {
    name: 'Empty array',
    input: '[]',
    expected: []
  },
  {
    name: 'Null value',
    input: '{"value":null}',
    expected: { value: null }
  },
  {
    name: 'Boolean values',
    input: '{"active":true,verified:false}',
    expected: { active: true, verified: false }
  },
  {
    name: 'String with escape sequences',
    input: '{"message":"Hello\\nWorld\\t\\"Testing\\""}',
    expected: { message: 'Hello\nWorld\t"Testing"' }
  },
  {
    name: 'Negative numbers',
    input: '{"temp":-15.5,"count":-3}',
    expected: { temp: -15.5, count: -3 }
  },
  {
    name: 'Partial',
    input: `{

    title:"Introduction to Testing",
    description:"A
     comprehensive introduction to testing principles, methodologies, and best
     practices for beginners. This course covers the fundamentals of testing, different
     testing types, and basic test case design.",
    contents:[

      {
        title:"Testing Fundamentals",`,
    expected: {title: 'Introduction to Testing', description: 'T'}
  }
];

// Helper function to create a queue from string and parse it
const parseJson = async <T>(json: string): Promise<T> => {
  const queue = Queue.fromArray([...json]);
  const parser = new JsonParser<T>(queue);

  await new Promise(resolve => setTimeout(resolve, 10));
  return await parser.resolve();
};

// Run all tests
const runTests = async () => {
  console.log("Running JSON Stream Parser Tests\n");

  for (const test of testCases) {
    console.log(`Test: ${test.name}`);
    console.log(`Input: ${test.input}`);

    try {
      const result = await parseJson(test.input);
      console.log(`Result:`, result);

      // Simple deep comparison
      const resultJson = JSON.stringify(result);
      const expectedJson = JSON.stringify(test.expected);

      if (resultJson === expectedJson) {
        console.log("✅ PASSED");
      } else {
        console.log("❌ FAILED");
        console.log(`Expected: ${expectedJson}`);
        console.log(`Got: ${resultJson}`);
      }
    } catch (error) {
      console.log("❌ ERROR:", error.message);
    }

    console.log("\n-----------------------------------\n");
  }
};

// Run the tests
runTests().catch(error => {
  console.error("Test runner error:", error);
});
