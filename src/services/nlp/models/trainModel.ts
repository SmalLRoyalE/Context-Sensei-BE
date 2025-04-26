import { ModelTrainer } from './trainingPipeline.ts';

async function main() {
  console.log('Starting model training...');
  
  const trainer = new ModelTrainer();
  await trainer.initialize();
  
  console.log('Model initialized, starting training...');
  await trainer.train(20, 32); // 20 epochs, batch size 32
  
  console.log('Training completed!');
}

main().catch(console.error); 