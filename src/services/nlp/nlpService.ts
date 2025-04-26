import { NLPService, MeetingAnalysis, Task } from './types.ts';
import { Configuration, OpenAIApi } from 'openai';
import { NlpManager } from 'node-nlp';
import { DateTime } from 'luxon';
import { IndianNamesModel } from './models/indianNamesModel.ts';
import { NLP_CONFIG } from './config.ts';

export class ContextSenseiNLPService implements NLPService {
  private openai: OpenAIApi;
  private nlpManager: NlpManager;
  private indianNamesModel: IndianNamesModel;

  constructor(openaiApiKey: string) {
    const configuration = new Configuration({
      apiKey: openaiApiKey,
    });
    this.openai = new OpenAIApi(configuration);
    this.nlpManager = new NlpManager({ languages: ['en'] });
    this.indianNamesModel = new IndianNamesModel();
    this.initializeModels();
  }

  private async initializeModels() {
    await this.indianNamesModel.initialize();
    
    // Train NLP manager with basic patterns
    this.nlpManager.addDocument('en', 'high priority', 'priority.high');
    this.nlpManager.addDocument('en', 'urgent', 'priority.high');
    this.nlpManager.addDocument('en', 'medium priority', 'priority.medium');
    this.nlpManager.addDocument('en', 'low priority', 'priority.low');
    await this.nlpManager.train();
  }

  async analyzeText(text: string): Promise<MeetingAnalysis> {
    const [names, tasks, dates, priority] = await Promise.all([
      this.extractNames(text),
      this.extractTasks(text),
      this.extractDates(text),
      this.determinePriority(text),
    ]);

    const meetingTasks: Task[] = names.map(name => ({
      name,
      tasks: tasks.filter(task => task.toLowerCase().includes(name.toLowerCase())),
      assignedDate: dates.assignedDate,
      deadline: dates.deadline,
      priority,
    }));

    const summary = await this.generateSummary(text);
    const keyPoints = await this.extractKeyPoints(text);

    return {
      tasks: meetingTasks,
      summary,
      keyPoints,
    };
  }

  async extractNames(text: string): Promise<string[]> {
    // First try with Indian names model
    const indianNames = await this.indianNamesModel.extractNames(text);
    
    // Then use OpenAI for general name extraction
    const response = await this.openai.createCompletion({
      model: NLP_CONFIG.openai.model,
      prompt: `Extract all names from the following text. Return only the names in a comma-separated list:\n\n${text}`,
      max_tokens: NLP_CONFIG.openai.maxTokens.names,
    });

    const openaiNames = response.data.choices[0].text?.split(',').map(name => name.trim()) || [];
    
    // Combine and deduplicate names
    return [...new Set([...indianNames, ...openaiNames])];
  }

  async extractTasks(text: string): Promise<string[]> {
    const response = await this.openai.createCompletion({
      model: NLP_CONFIG.openai.model,
      prompt: `Extract all tasks and action items from the following text. Return each task on a new line:\n\n${text}`,
      max_tokens: NLP_CONFIG.openai.maxTokens.tasks,
    });

    return response.data.choices[0].text?.split('\n').filter(Boolean) || [];
  }

  async extractDates(text: string): Promise<{ assignedDate: string; deadline: string }> {
    const response = await this.openai.createCompletion({
      model: NLP_CONFIG.openai.model,
      prompt: `Extract the assigned date and deadline from the following text. Return in JSON format with keys "assignedDate" and "deadline":\n\n${text}`,
      max_tokens: NLP_CONFIG.openai.maxTokens.dates,
    });

    try {
      const dates = JSON.parse(response.data.choices[0].text || '{}');
      return {
        assignedDate: dates.assignedDate || DateTime.now().toISOString(),
        deadline: dates.deadline || DateTime.now().plus({ days: 7 }).toISOString(),
      };
    } catch {
      return {
        assignedDate: DateTime.now().toISOString(),
        deadline: DateTime.now().plus({ days: 7 }).toISOString(),
      };
    }
  }

  async determinePriority(text: string): Promise<'High' | 'Medium' | 'Low'> {
    const result = await this.nlpManager.process('en', text);
    if (result.intent === 'priority.high') return 'High';
    if (result.intent === 'priority.medium') return 'Medium';
    return 'Low';
  }

  private async generateSummary(text: string): Promise<string> {
    const response = await this.openai.createCompletion({
      model: NLP_CONFIG.openai.model,
      prompt: `Generate a concise summary of the following text:\n\n${text}`,
      max_tokens: NLP_CONFIG.openai.maxTokens.summary,
    });

    return response.data.choices[0].text || '';
  }

  private async extractKeyPoints(text: string): Promise<string[]> {
    const response = await this.openai.createCompletion({
      model: NLP_CONFIG.openai.model,
      prompt: `Extract key points from the following text. Return each point on a new line:\n\n${text}`,
      max_tokens: NLP_CONFIG.openai.maxTokens.keyPoints,
    });

    return response.data.choices[0].text?.split('\n').filter(Boolean) || [];
  }
} 