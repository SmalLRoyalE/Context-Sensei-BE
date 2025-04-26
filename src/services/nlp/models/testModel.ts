import { IndianNamesModel } from './indianNamesModel.ts';

async function testModel() {
  console.log('Initializing Indian Names Model...');
  const model = new IndianNamesModel();
  await model.initialize();

  // Test cases
  const testCases = [
    'Mr. Rajesh Kumar is the project manager.',
    'Dr. Sarah Williams will lead the research.',
    'Smt. Priya Sharma and Shri Amit Patel will attend the meeting.',
    'The deadline is next Friday, confirmed by John Smith.',
    'Ananya Gupta has completed the task assigned by Mohammed Khan.',
    'Team members include: Das, Reddy, and Martinez.',
    'Please contact Prof. Mukherjee or Dr. Iyer for more details.',
    'The project was reviewed by Mrs. Anderson and Mr. Chakraborty.'
  ];

  console.log('\nTesting name extraction...\n');

  for (const text of testCases) {
    console.log('Input:', text);
    const names = await model.extractNames(text);
    console.log('Extracted names:', names);
    
    // Test each extracted name
    for (const name of names) {
      const isIndian = await model.isIndianName(name);
      console.log(`"${name}" is ${isIndian ? 'an Indian name' : 'not an Indian name'}`);
    }
    console.log('---\n');
  }
}

// Run the test
console.log('Starting model test...');
testModel().catch(console.error); 