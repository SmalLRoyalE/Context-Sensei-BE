import * as tf from '@tensorflow/tfjs-node';
import { BertTokenizer, TFBertModel } from '@huggingface/transformers';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface TrainingData {
  text: string;
  isIndianName: boolean;
}

export class ModelTrainer {
  private model: tf.Sequential;
  private tokenizer: BertTokenizer;
  private bertModel: TFBertModel;
  private readonly MODEL_PATH = join(__dirname, 'saved_model');
  private readonly TRAINING_DATA_PATH = join(__dirname, 'training_data.json');

  constructor() {
    this.model = this.buildModel();
  }

  private buildModel(): tf.Sequential {
    return tf.sequential({
      layers: [
        tf.layers.dense({ units: 256, activation: 'relu', inputShape: [768] }), // BERT output size is 768
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });
  }

  async initialize() {
    // Load BERT tokenizer and model
    this.tokenizer = await BertTokenizer.from_pretrained('bert-base-multilingual-cased');
    this.bertModel = await TFBertModel.from_pretrained('bert-base-multilingual-cased');

    // Compile the model
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });
  }

  async loadTrainingData(): Promise<TrainingData[]> {
    try {
      const data = await readFile(this.TRAINING_DATA_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading training data:', error);
      return [];
    }
  }

  async prepareData(data: TrainingData[]): Promise<{ xs: tf.Tensor; ys: tf.Tensor }> {
    const embeddings = await Promise.all(
      data.map(async (item) => {
        // Tokenize and get BERT embeddings
        const encoded = await this.tokenizer.encode(item.text, { return_tensors: 'tf' });
        const output = await this.bertModel(encoded);
        return output.last_hidden_state.slice([0, 0, 0], [1, 1, -1]); // Get [CLS] token embedding
      })
    );

    const xs = tf.concat(embeddings);
    const ys = tf.tensor1d(data.map(item => item.isIndianName ? 1 : 0));

    return { xs, ys };
  }

  async train(epochs: number = 10, batchSize: number = 32) {
    const data = await this.loadTrainingData();
    const { xs, ys } = await this.prepareData(data);

    await this.model.fit(xs, ys, {
      epochs,
      batchSize,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs?.loss}, accuracy = ${logs?.acc}`);
        }
      }
    });

    // Save the model
    await this.model.save(`file://${this.MODEL_PATH}`);
  }

  async evaluate(testData: TrainingData[]) {
    const { xs, ys } = await this.prepareData(testData);
    const evaluation = this.model.evaluate(xs, ys);
    
    console.log('Evaluation results:', {
      loss: evaluation[0].dataSync()[0],
      accuracy: evaluation[1].dataSync()[0]
    });
  }
} 