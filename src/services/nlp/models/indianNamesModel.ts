import { BertTokenizer, TFBertModel } from '@huggingface/transformers';
import * as tf from '@tensorflow/tfjs-node';

export class IndianNamesModel {
  private tokenizer: BertTokenizer;
  private bertModel: TFBertModel;
  private classifier: tf.Sequential;
  private indianNamePatterns: RegExp[];

  constructor() {
    this.indianNamePatterns = [
      // Common Indian name patterns
      /\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g, // First Last names
      /\b(?:Singh|Kumar|Sharma|Patel|Gupta|Mehta|Reddy|Naidu|Rao|Iyer|Nair|Menon|Pillai|Nambiar)\b/gi,
      /\b(?:Khan|Ahmed|Ali|Hussain|Mohammed|Rahman|Siddiqui|Ansari|Khanam|Begum)\b/gi,
      /\b(?:Das|Dutta|Banerjee|Chatterjee|Ganguly|Bose|Ghosh|Mukherjee|Sen|Chakraborty)\b/gi,
      /\b(?:Pillai|Nair|Menon|Nambiar|Warrier|Namboothiri|Namboothiripad)\b/gi,
      /\b(?:Reddy|Naidu|Rao|Chowdary|Goud|Varma|Sharma|Verma|Yadav|Pandey)\b/gi
    ];

    this.classifier = tf.sequential({
      layers: [
        tf.layers.dense({ units: 256, activation: 'relu', inputShape: [768] }), // BERT output size
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 128, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });
  }

  async initialize() {
    try {
      // Load BERT tokenizer and model
      this.tokenizer = await BertTokenizer.from_pretrained('bert-base-multilingual-cased');
      this.bertModel = await TFBertModel.from_pretrained('bert-base-multilingual-cased');

      // Load the fine-tuned classifier if it exists
      try {
        const savedModel = await tf.loadLayersModel('file://./saved_model/model.json');
        this.classifier = savedModel;
      } catch (error) {
        console.log('No saved model found, using new classifier');
        this.classifier.compile({
          optimizer: tf.train.adam(0.001),
          loss: 'binaryCrossentropy',
          metrics: ['accuracy']
        });
      }
    } catch (error) {
      console.error('Error loading models:', error);
      throw error;
    }
  }

  async extractNames(text: string): Promise<string[]> {
    const names = new Set<string>();

    // First pass: Use regex patterns
    this.indianNamePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => names.add(match.trim()));
      }
    });

    // Second pass: Use BERT for more complex cases
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (word.length < 2 || !/^[A-Z]/.test(word)) continue;

        const encoded = await this.tokenizer.encode(word, { return_tensors: 'tf' });
        const bertOutput = await this.bertModel(encoded);
        const embedding = bertOutput.last_hidden_state.slice([0, 0, 0], [1, 1, -1]);
        
        const prediction = this.classifier.predict(embedding) as tf.Tensor;
        const isName = prediction.dataSync()[0] > 0.5;
        
        if (isName) {
          const potentialName = this.extractPotentialName(sentence, word);
          if (potentialName) {
            names.add(potentialName);
          }
        }
      }
    }

    return Array.from(names);
  }

  private extractPotentialName(sentence: string, word: string): string | null {
    const words = sentence.split(/\s+/);
    const wordIndex = words.findIndex(w => w === word);
    
    if (wordIndex === -1) return null;

    // Look for title + name patterns
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sir', 'Shri', 'Smt.'];
    if (wordIndex > 0 && titles.includes(words[wordIndex - 1])) {
      return words.slice(wordIndex - 1, wordIndex + 2).join(' ');
    }
    
    // Look for consecutive capitalized words
    let nameStart = wordIndex;
    let nameEnd = wordIndex;
    
    while (nameStart > 0 && /^[A-Z]/.test(words[nameStart - 1])) {
      nameStart--;
    }
    
    while (nameEnd < words.length - 1 && /^[A-Z]/.test(words[nameEnd + 1])) {
      nameEnd++;
    }
    
    if (nameEnd > nameStart) {
      return words.slice(nameStart, nameEnd + 1).join(' ');
    }

    return word;
  }

  async isIndianName(name: string): Promise<boolean> {
    // First check patterns
    for (const pattern of this.indianNamePatterns) {
      if (pattern.test(name)) return true;
    }

    // Then use BERT classifier
    const encoded = await this.tokenizer.encode(name, { return_tensors: 'tf' });
    const bertOutput = await this.bertModel(encoded);
    const embedding = bertOutput.last_hidden_state.slice([0, 0, 0], [1, 1, -1]);
    
    const prediction = this.classifier.predict(embedding) as tf.Tensor;
    return prediction.dataSync()[0] > 0.5;
  }
} 