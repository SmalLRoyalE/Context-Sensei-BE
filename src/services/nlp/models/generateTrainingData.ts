import { writeFile } from 'fs/promises';
import { join } from 'path';

interface TrainingData {
  text: string;
  isIndianName: boolean;
}

// Common Indian names dataset
const INDIAN_NAMES = [
  // First Names
  'Aarav', 'Aanya', 'Aditya', 'Advait', 'Aisha', 'Akash', 'Amaira', 'Ananya', 'Arjun', 'Avni',
  'Dhruv', 'Diya', 'Ishaan', 'Ishita', 'Kabir', 'Kiara', 'Krish', 'Mahi', 'Myra', 'Neel',
  'Pari', 'Pranav', 'Reyansh', 'Riya', 'Rudra', 'Saanvi', 'Samaira', 'Shivansh', 'Siya', 'Vihaan',
  // Last Names
  'Sharma', 'Patel', 'Gupta', 'Kumar', 'Singh', 'Reddy', 'Naidu', 'Rao', 'Iyer', 'Nair',
  'Menon', 'Pillai', 'Nambiar', 'Khan', 'Ahmed', 'Ali', 'Hussain', 'Mohammed', 'Rahman', 'Siddiqui',
  'Das', 'Dutta', 'Banerjee', 'Chatterjee', 'Ganguly', 'Bose', 'Ghosh', 'Mukherjee', 'Sen', 'Chakraborty'
];

// Non-Indian names for negative examples
const NON_INDIAN_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

async function generateTrainingData() {
  const trainingData: TrainingData[] = [];

  // Generate positive examples (Indian names)
  for (const name of INDIAN_NAMES) {
    // Full name variations
    trainingData.push({ text: name, isIndianName: true });
    trainingData.push({ text: `Mr. ${name}`, isIndianName: true });
    trainingData.push({ text: `Mrs. ${name}`, isIndianName: true });
    trainingData.push({ text: `Dr. ${name}`, isIndianName: true });
    
    // With common Indian titles
    trainingData.push({ text: `Shri ${name}`, isIndianName: true });
    trainingData.push({ text: `Smt. ${name}`, isIndianName: true });
  }

  // Generate negative examples (non-Indian names)
  for (const name of NON_INDIAN_NAMES) {
    trainingData.push({ text: name, isIndianName: false });
    trainingData.push({ text: `Mr. ${name}`, isIndianName: false });
    trainingData.push({ text: `Mrs. ${name}`, isIndianName: false });
    trainingData.push({ text: `Dr. ${name}`, isIndianName: false });
  }

  // Add some common non-name words as negative examples
  const nonNameWords = ['project', 'meeting', 'task', 'deadline', 'priority', 'team', 'work', 'office'];
  for (const word of nonNameWords) {
    trainingData.push({ text: word, isIndianName: false });
  }

  // Save the training data
  const outputPath = join(__dirname, 'training_data.json');
  await writeFile(outputPath, JSON.stringify(trainingData, null, 2));
  console.log(`Generated ${trainingData.length} training examples and saved to ${outputPath}`);
}

// Run the data generation
generateTrainingData().catch(console.error); 