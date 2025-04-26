import axios from 'axios';

interface AIAnalysisResponse {
  summary: string;
  tasks: {
    description: string;
    priority: string;
    deadline?: string;
    assignee?: string;
  }[];
  keyPoints: string[];
}

interface DialogueLine {
  speaker: string;
  content: string;
}

export class AIAnalyzer {
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';
  // Using better models for our specific use case
  private summaryModel = 'facebook/bart-large-cnn';
  private classificationModel = 'facebook/bart-large-mnli';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Hugging Face API key is required');
    }
    this.apiKey = apiKey;
  }

  private parseTranscript(text: string): DialogueLine[] {
    return text.split('\n')
      .map(line => {
        const match = line.match(/^([A-Z]{2}):\s*(.*)/);
        return match ? { speaker: match[1], content: match[2].trim() } : null;
      })
      .filter((line): line is DialogueLine => line !== null);
  }

  private async query(model: string, payload: any) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${model}`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error(`Error querying model ${model}:`, error);
      throw new Error(`Failed to query Hugging Face API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateSummary(dialogues: DialogueLine[]): Promise<string> {
    // First, identify the opening statement which often contains the meeting agenda
    const openingStatement = dialogues[0]?.content || '';
    
    // Get key discussion points (excluding greetings and closings)
    const keyDiscussions = dialogues
      .filter(d => 
        !d.content.toLowerCase().includes('hello') &&
        !d.content.toLowerCase().includes('hi everyone') &&
        !d.content.toLowerCase().includes('bye') &&
        d.content.length > 30
      )
      .map(d => d.content)
      .join(' ');

    const summaryResponse = await this.query(this.summaryModel, {
      inputs: `Meeting Agenda: ${openingStatement}\n\nKey Discussions: ${keyDiscussions}`,
      parameters: {
        max_length: 150,
        min_length: 50,
        do_sample: false
      }
    });

    return summaryResponse[0].summary_text;
  }

  private async extractKeyPoints(dialogues: DialogueLine[]): Promise<string[]> {
    // Filter out metadata and focus on actual decisions
    const decisionIndicators = dialogues.filter(d => {
      const content = d.content.toLowerCase();
      return (
        (content.includes('decided') ||
         content.includes('decision') ||
         content.includes('will') ||
         content.includes('agreed') ||
         content.includes('let\'s') ||
         content.includes('action item')) &&
        !content.includes('good morning') &&
        !content.includes('thanks for') &&
        !content.includes('hello') &&
        !content.includes('hi everyone')
      );
    });

    // Group consecutive related points
    const decisions: string[] = [];
    let currentDecision = '';

    decisionIndicators.forEach((line, index) => {
      if (line.content.toLowerCase().includes('action item') ||
          line.content.toLowerCase().includes('decided') ||
          line.content.toLowerCase().includes('will') ||
          (index === 0 || !decisionIndicators[index - 1].content.toLowerCase().includes(line.content.toLowerCase()))) {
        if (currentDecision) {
          decisions.push(currentDecision.trim());
        }
        currentDecision = `${line.speaker}: ${line.content}`;
      } else {
        currentDecision += ` ${line.content}`;
      }
    });

    if (currentDecision) {
      decisions.push(currentDecision.trim());
    }

    // Use AI to validate and clean up decisions
    const validatedDecisions = await Promise.all(
      decisions.map(async (decision) => {
        const response = await this.query(this.classificationModel, {
          inputs: decision,
          parameters: {
            candidate_labels: ["decision", "action item", "general discussion"],
          }
        });

        return {
          text: decision,
          isValid: response.labels[0] !== "general discussion" && response.scores[0] > 0.6
        };
      })
    );

    return validatedDecisions
      .filter(d => d.isValid)
      .map(d => d.text);
  }

  public async analyzeText(text: string): Promise<AIAnalysisResponse> {
    try {
      console.log('AI Analysis starting...');
      console.log('Parsing transcript...');
      const dialogues = this.parseTranscript(text);
      console.log(`Found ${dialogues.length} dialogue lines`);
      
      // Run all analyses in parallel
      console.log('Running parallel analyses...');
      const [summary, tasks, keyPoints] = await Promise.all([
        this.generateSummary(dialogues),
        this.identifyTasks(dialogues),
        this.extractKeyPoints(dialogues)
      ]);

      console.log('Analysis complete:');
      console.log('Summary:', summary);
      console.log('Tasks:', tasks);
      console.log('Key Points:', keyPoints);

      return {
        summary,
        tasks,
        keyPoints
      };
    } catch (error) {
      console.error('Error in AI analysis:', error);
      throw new Error('Failed to analyze text with AI');
    }
  }

  private determinePriority(text: string): string {
    const lowercaseText = text.toLowerCase();
    
    // Priority indicators with weighted scoring
    const priorityScores = {
      urgent: {
        keywords: ['urgent', 'asap', 'immediately', 'critical', 'emergency'],
        score: 3
      },
      high: {
        keywords: ['important', 'priority', 'crucial', 'essential', 'needed'],
        score: 2
      },
      medium: {
        keywords: ['should', 'would be good', 'nice to have', 'when possible'],
        score: 1
      }
    };

    let totalScore = 0;
    
    // Calculate priority score based on keywords
    Object.values(priorityScores).forEach(({keywords, score}) => {
      keywords.forEach(keyword => {
        if (lowercaseText.includes(keyword)) {
          totalScore += score;
        }
      });
    });

    // Consider deadline proximity in priority calculation
    const deadline = this.extractDeadline(text);
    if (deadline) {
      const deadlineDate = new Date(deadline);
      const today = new Date();
      const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDeadline <= 2) totalScore += 3;
      else if (daysUntilDeadline <= 7) totalScore += 2;
      else if (daysUntilDeadline <= 14) totalScore += 1;
    }

    // Determine final priority based on total score
    if (totalScore >= 3) return 'HIGH';
    if (totalScore >= 1) return 'MEDIUM';
    return 'LOW';
  }

  private extractDeadline(text: string): string | undefined {
    const lowercaseText = text.toLowerCase();
    const today = new Date();
    
    // Common date patterns
    const datePatterns = [
      // Explicit dates (e.g., "by January 15th", "due on 2024-01-15")
      {
        regex: /(?:by|due|on|before)\s+(?:the\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:\d{4}-\d{2}-\d{2}))/i,
        handler: (match: string[]) => {
          const dateStr = match[1];
          return dateStr.includes('-') ? dateStr : new Date(dateStr).toISOString().split('T')[0];
        }
      },
      // Relative dates (e.g., "next week", "in 2 days")
      {
        regex: /(?:in|within|after)\s+(\d+)\s+(day|week|month)s?/i,
        handler: (match: string[]) => {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const date = new Date(today);
          
          switch(unit) {
            case 'day':
              date.setDate(date.getDate() + amount);
              break;
            case 'week':
              date.setDate(date.getDate() + (amount * 7));
              break;
            case 'month':
              date.setMonth(date.getMonth() + amount);
              break;
          }
          
          return date.toISOString().split('T')[0];
        }
      },
      // Special keywords (e.g., "tomorrow", "next Monday")
      {
        regex: /(tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
        handler: (match: string[]) => {
          const keyword = match[1].toLowerCase();
          const date = new Date(today);
          
          if (keyword === 'tomorrow') {
            date.setDate(date.getDate() + 1);
          } else {
            const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
              .indexOf(keyword.replace('next ', ''));
            let daysToAdd = targetDay - date.getDay();
            if (daysToAdd <= 0) daysToAdd += 7;
            date.setDate(date.getDate() + daysToAdd);
          }
          
          return date.toISOString().split('T')[0];
        }
      }
    ];

    // Try each pattern
    for (const pattern of datePatterns) {
      const match = lowercaseText.match(pattern.regex);
      if (match) {
        try {
          return pattern.handler(match);
        } catch (e) {
          console.error('Error parsing date:', e);
          continue;
        }
      }
    }

    // Handle end of week/month patterns
    if (lowercaseText.includes('end of week') || lowercaseText.includes('this week')) {
      const date = new Date(today);
      date.setDate(date.getDate() + (5 - date.getDay())); // Friday of current week
      return date.toISOString().split('T')[0];
    }
    
    if (lowercaseText.includes('end of month') || lowercaseText.includes('this month')) {
      const date = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of current month
      return date.toISOString().split('T')[0];
    }

    return undefined;
  }

  private async identifyTasks(dialogues: DialogueLine[]): Promise<Array<{
    description: string;
    priority: string;
    deadline?: string;
    assignee: string;
  }>> {
    console.log('Starting task identification...');
    
    // Enhanced task identification patterns
    const taskIndicators = dialogues.filter(d => {
      const content = d.content.toLowerCase();
      const isTask = (
        // Action verbs and task indicators
        (content.includes('will') ||
         content.includes('need to') ||
         content.includes('should') ||
         content.includes('must') ||
         content.includes('going to') ||
         content.includes('plan to') ||
         // Meeting specific actions
         content.includes('review') ||
         content.includes('schedule') ||
         content.includes('set') ||
         content.includes('address') ||
         content.includes('fix') ||
         content.includes('improve') ||
         // Task and action items
         content.includes('task') ||
         content.includes('action item') ||
         content.includes('follow up') ||
         // Requests and assignments
         content.includes('can you') ||
         content.includes('could you') ||
         content.includes('please')) &&
        // Filter out common non-task phrases
        !content.includes('good morning') &&
        !content.includes('thanks for') &&
        !content.includes('hello') &&
        !content.includes('hi everyone') &&
        content.length > 10
      );

      if (isTask) {
        console.log('Found potential task:', content);
      }
      return isTask;
    });

    console.log(`Found ${taskIndicators.length} potential tasks`);

    // Extract tasks with context
    const tasks: Array<{
      speaker: string;
      assignee: string;
      content: string;
      context: string[];
    }> = [];

    taskIndicators.forEach((line, index) => {
      console.log('Processing task indicator:', line);
      const content = line.content;
      
      // Get surrounding context
      const context = dialogues
        .slice(Math.max(0, index - 3), Math.min(dialogues.length, index + 4))
        .map(d => d.content);

      // Enhanced assignee detection
      let assignee = line.speaker;
      const assignmentPatterns = [
        { pattern: /([A-Z]{2})(?:,| will| should| to| can| needs? to| is going to| plans? to)/i, group: 1 },
        { pattern: /assign(?:ed)? to ([A-Z]{2})/i, group: 1 },
        { pattern: /for ([A-Z]{2}) to/i, group: 1 },
        { pattern: /([A-Z]{2}):/, group: 1 },
        { pattern: /let's|we should|we need to|we must/, defaultAssignee: 'TEAM', group: null }
      ];

      for (const pattern of assignmentPatterns) {
        const match = content.match(pattern.pattern);
        if (match && pattern.group !== null && match[pattern.group]) {
          assignee = match[pattern.group];
          console.log(`Found assignee: ${assignee}`);
          break;
        } else if (match && pattern.defaultAssignee) {
          assignee = pattern.defaultAssignee;
          console.log(`Using default assignee: ${assignee}`);
          break;
        }
      }

      // Clean up task description
      const cleanedContent = content
        .replace(/^(?:please|can you|could you|would you)\s+/i, '')
        .replace(/^(?:we should|we need to|we must|let's)\s+/i, '')
        .replace(/^(?:to|and|then)\s+/i, '')
        .replace(/[.?!]+$/, '')
        .trim();

      console.log('Cleaned task content:', cleanedContent);
      tasks.push({
        speaker: line.speaker,
        assignee,
        content: cleanedContent,
        context
      });
    });

    console.log(`Processing ${tasks.length} tasks for validation`);

    // Validate and clean up tasks using AI
    const validatedTasks = await Promise.all(
      tasks.map(async (task) => {
        console.log('Validating task:', task);
        const response = await this.query(this.classificationModel, {
          inputs: task.content,
          parameters: {
            candidate_labels: ["task assignment", "action item", "general discussion"],
          }
        });

        console.log('Validation response:', response);

        if ((response.labels[0] === "task assignment" || response.labels[0] === "action item") && response.scores[0] > 0.6) {
          const validatedTask = {
            description: task.content,
            priority: this.determinePriority(task.content + ' ' + task.context.join(' ')),
            deadline: this.extractDeadline(task.content + ' ' + task.context.join(' ')),
            assignee: task.assignee
          };
          console.log('Task validated:', validatedTask);
          return validatedTask;
        }
        console.log('Task rejected as not a valid task/action item');
        return null;
      })
    );

    const finalTasks = validatedTasks.filter((task): task is NonNullable<typeof task> => task !== null);
    console.log(`Final task count: ${finalTasks.length}`);
    return finalTasks;
  }
} 