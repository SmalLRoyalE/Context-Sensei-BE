import { DateTime } from 'luxon';
import { TaskPriority, Task, Employee, MeetingDetails } from '../types';
import { AIAnalyzer } from './ai';

export class TextAnalyzer {
  private text: string;
  private sentences: string[];
  private employeeNames: Map<string, string>;
  private dateContext: DateTime | null = null;
  private currentSpeaker: string = '';
  private tasks: Task[] = [];
  private aiAnalyzer: AIAnalyzer;

  constructor(text: string, huggingFaceApiKey: string) {
    this.text = text;
    this.sentences = text.split(/[.!?]\s+/);
    this.employeeNames = new Map();
    this.dateContext = this.extractMeetingDate();
    this.extractEmployeeNames();
    this.aiAnalyzer = new AIAnalyzer(huggingFaceApiKey);
  }

  private extractMeetingDate(): DateTime {
    const datePatterns = [
      // ISO format
      { pattern: /(\d{4}-\d{2}-\d{2})/, format: 'yyyy-MM-dd' },
      // Common US format
      { pattern: /(\w+ \d{1,2},? \d{4})/, format: 'MMMM d yyyy' },
      // Short date format
      { pattern: /(\d{1,2}\/\d{1,2}\/\d{4})/, format: 'M/d/yyyy' },
      // European format
      { pattern: /(\d{1,2}\.\d{1,2}\.\d{4})/, format: 'dd.MM.yyyy' }
    ];

    for (const { pattern, format } of datePatterns) {
      const match = this.text.match(pattern);
      if (match) {
        const parsed = DateTime.fromFormat(match[1], format);
        if (parsed.isValid) return parsed;
      }
    }

    // If no valid date found, return current date
    return DateTime.local().startOf('day');
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/);
  }

  private extractEmployeeNames(): void {
    // Updated pattern to match both formats: "JS:" and "John Smith (JS)"
    const namePatterns = [
      /([A-Z]{2}):\s/g,  // Matches "JS: "
      /([A-Z][a-z]+ [A-Z][a-z]+) \(([A-Z]{2})\)/g  // Matches "John Smith (JS)"
    ];

    namePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(this.text)) !== null) {
        if (match.length === 2) {
          // Format "JS: "
          this.employeeNames.set(match[1], match[1]);
        } else if (match.length === 3) {
          // Format "John Smith (JS)"
          this.employeeNames.set(match[2], match[1]);
        }
      }
    });
  }

  private extractDate(text: string): DateTime | null {
    const relativeTimePatterns = [
      {
        pattern: /by (\w+day)/i,
        handler: (match: string) => {
          const day = match.toLowerCase();
          const weekday = this.weekdays[day.replace('day', '')];
          if (weekday && this.dateContext?.isValid) {
            let targetDay = this.dateContext.set({ weekday });
            // If the target day is before current date, move to next week
            if (targetDay < this.dateContext) {
              targetDay = targetDay.plus({ weeks: 1 });
            }
            return targetDay;
          }
          return null;
        }
      },
      {
        pattern: /next (\w+day)/i,
        handler: (match: string) => {
          const day = match.toLowerCase();
          const weekday = this.weekdays[day.replace('day', '')];
          if (weekday && this.dateContext?.isValid) {
            return this.dateContext.set({ weekday }).plus({ weeks: 1 });
          }
          return null;
        }
      },
      {
        pattern: /in (\d+) (day|week|month)s?/i,
        handler: (match: string, unit: string) => {
          const amount = parseInt(match);
          if (this.dateContext?.isValid) {
            return this.dateContext.plus({ [unit.toLowerCase() + 's']: amount });
          }
          return null;
        }
      },
      {
        pattern: /(today|tomorrow|next week|next month|end of week|end of month)/i,
        handler: (match: string) => {
          if (!this.dateContext?.isValid) return null;
          
          switch (match.toLowerCase()) {
            case 'today':
              return this.dateContext;
            case 'tomorrow':
              return this.dateContext.plus({ days: 1 });
            case 'next week':
              return this.dateContext.plus({ weeks: 1 }).startOf('week');
            case 'next month':
              return this.dateContext.plus({ months: 1 }).startOf('month');
            case 'end of week':
              return this.dateContext.endOf('week');
            case 'end of month':
              return this.dateContext.endOf('month');
            default:
              return null;
          }
        }
      },
      {
        // Handle specific dates in various formats
        pattern: /(?:by|on|before) (?:the )?(\d{1,2}(?:st|nd|rd|th)?(?: of)? (?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,? \d{4})?)/i,
        handler: (match: string) => {
          const cleanedDate = match
            .toLowerCase()
            .replace(/(st|nd|rd|th)/, '')
            .replace(' of ', ' ');
          
          // Try parsing with year
          let parsed = DateTime.fromFormat(cleanedDate, 'd MMMM yyyy');
          
          // If no year specified, try parsing without year and use current year
          if (!parsed.isValid) {
            parsed = DateTime.fromFormat(cleanedDate, 'd MMMM');
            if (parsed.isValid) {
              parsed = parsed.set({ year: this.dateContext?.year || DateTime.local().year });
              // If the resulting date is in the past, assume next year
              if (parsed < (this.dateContext || DateTime.local())) {
                parsed = parsed.plus({ years: 1 });
              }
            }
          }
          
          return parsed.isValid ? parsed : null;
        }
      }
    ];

    // First check for explicit dates
    const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      const parsed = DateTime.fromISO(isoMatch[1]);
      if (parsed.isValid) return parsed;
    }

    // Then try relative patterns
    for (const { pattern, handler } of relativeTimePatterns) {
      const match = text.match(pattern);
      if (match) {
        const result = handler(match[1], match[2]);
        if (result?.isValid) return result;
      }
    }

    return null;
  }

  private weekdays: { [key: string]: 1 | 2 | 3 | 4 | 5 | 6 | 7 } = {
    'sunday': 7,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  private determinePriority(text: string, context: string[] = []): TaskPriority {
    const tokens = [...this.tokenize(text), ...context.flatMap(c => this.tokenize(c))];
    
    const highPriorityPatterns = [
      /critical|urgent|immediate|asap/i,
      /enterprise.*?client/i,
      /prioritize|top priority/i,
      /fix.*?issue|issue.*?fix/i,
      /error|problem|bug/i
    ];

    const mediumPriorityPatterns = [
      /investigate|report|improve/i,
      /optimize|enhance|update/i,
      /next sprint|soon|following/i,
      /performance|bottleneck/i
    ];

    if (highPriorityPatterns.some(pattern => pattern.test(text))) {
      return 'High';
    }
    if (mediumPriorityPatterns.some(pattern => pattern.test(text))) {
      return 'Medium';
    }
    return 'Low';
  }

  private normalizeTaskDescription(description: string): string {
    return description
      .replace(/^(?:please|can you|could you|would you|I'll|I will|going to|plan to)\s+/i, '')
      .replace(/^(?:to|and|then)\s+/i, '')
      .trim();
  }

  private shouldMergeTasks(task1: Task, task2: Task): boolean {
    const desc1 = this.tokenize(task1.description);
    const desc2 = this.tokenize(task2.description);
    const commonWords = desc1.filter(word => desc2.includes(word));
    return commonWords.length >= Math.min(desc1.length, desc2.length) * 0.6;
  }

  private mergeTasks(task1: Task, task2: Task): Task {
    return {
      ...task1,
      description: task1.description.length > task2.description.length ? 
                  task1.description : task2.description,
      priority: task1.priority === 'High' || task2.priority === 'High' ? 'High' :
               task1.priority === 'Medium' || task2.priority === 'Medium' ? 'Medium' : 'Low',
      deadline: DateTime.fromISO(task1.deadline) < DateTime.fromISO(task2.deadline) ?
                task1.deadline : task2.deadline
    };
  }

  private deduplicateAndMergeTasks(tasks: Task[]): Task[] {
    const result: Task[] = [];
    const seen = new Set<string>();

    for (const task of tasks) {
      const normalizedDesc = this.normalizeTaskDescription(task.description);
      
      // Skip exact duplicates
      if (seen.has(normalizedDesc)) {
        continue;
      }

      // Look for similar tasks to merge
      const similarTaskIndex = result.findIndex(t => 
        this.shouldMergeTasks(t, { ...task, description: normalizedDesc }));

      if (similarTaskIndex >= 0) {
        result[similarTaskIndex] = this.mergeTasks(result[similarTaskIndex], task);
      } else {
        result.push({ ...task, description: normalizedDesc });
        seen.add(normalizedDesc);
      }
    }

    return result;
  }

  private parseDialogue(): { speaker: string; content: string }[] {
    const dialogueLines: { speaker: string; content: string }[] = [];
    const lines = this.text.split('\n');

    lines.forEach(line => {
      const speakerMatch = line.match(/^([A-Z]{2}):\s*(.*)/);
      if (speakerMatch) {
        dialogueLines.push({
          speaker: speakerMatch[1],
          content: speakerMatch[2].trim()
        });
      }
    });

    return dialogueLines;
  }

  private isTaskLike(text: string): boolean {
    // Enhanced task detection patterns
    const taskIndicators = [
      // Action verbs indicating tasks
      /\b(?:need|needs|needed) to\b/i,
      /\b(?:should|must|will|going to)\b/i,
      /\b(?:implement|create|develop|fix|update|review|test|check|analyze|design|prepare|coordinate|setup|configure)\b/i,
      /\b(?:task|todo|action item|action|item)s?\b/i,
      /\b(?:assigned to|responsible for|in charge of)\b/i,
      /\b(?:work on|handle|manage|lead|oversee)\b/i,
      /\b(?:schedule|plan|organize|arrange)\b/i,
      /\b(?:consider|look into|investigate|research)\b/i,
      // Project management terms
      /\b(?:follow up|follow-up|track|monitor)\b/i,
      /\b(?:priority|deadline|timeline|milestone)\b/i,
      // Meeting specific actions
      /\b(?:let's|we should|we need to|we must)\b/i,
      /\b(?:action points?|next steps?|deliverables?)\b/i
    ];

    // Refined ignore patterns
    const ignorePatterns = [
      /^(?:hi|hello|hey|thanks|thank you|okay|ok|yes|no|maybe)\b/i,
      /^(?:i see|i understand|got it|makes sense)\b/i,
      /^(?:good morning|good afternoon|good evening)\b/i,
      /^(?:welcome|great|awesome|perfect)\b/i,
      /^(?:bye|goodbye|see you|talk to you)\b/i
    ];

    // Return false if text matches any ignore patterns
    if (ignorePatterns.some(pattern => pattern.test(text.trim()))) {
      return false;
    }

    // Check minimum content length to avoid short phrases
    if (text.trim().length < 10) {
      return false;
    }

    // Check if text contains any task indicators
    return taskIndicators.some(pattern => pattern.test(text));
  }

  private addTask(tasks: Map<string, Task[]>, assignee: string, description: string, context: string[]) {
    const defaultDate = DateTime.local().startOf('day');
    const deadline = this.extractDate(description) || 
                    this.extractDate(context.join(' ')) || 
                    defaultDate.plus({ days: 7 });

    // Clean up and normalize the description
    const cleanDescription = description
      .replace(/^(?:please|can you|could you|would you)\s+/i, '')
      .replace(/^(?:to|and|then)\s+/i, '')
      .replace(/[.?!]+$/, '')
      .trim();

    // Skip if description is too short or too generic
    if (cleanDescription.length < 10 || /^(?:do|make|get|have|be)\s+/i.test(cleanDescription)) {
      return;
    }

    // Map assignee to full name, fallback to 'Unassigned' if not found
    let mappedAssignee = assignee;
    if (this.employeeNames.has(assignee)) {
      mappedAssignee = this.employeeNames.get(assignee)!;
    } else if ([...this.employeeNames.keys()].map(k => k.toLowerCase()).includes(assignee.toLowerCase())) {
      // Case-insensitive match
      mappedAssignee = this.employeeNames.get(
        [...this.employeeNames.keys()].find(k => k.toLowerCase() === assignee.toLowerCase())!
      )!;
    } else {
      mappedAssignee = 'Unassigned';
    }

    const task: Task = {
      id: Math.random().toString(36).substr(2, 9),
      description: cleanDescription,
      assignedTo: mappedAssignee,
      assignedDate: (this.dateContext || defaultDate).toFormat('yyyy-MM-dd'),
      deadline: deadline.toFormat('yyyy-MM-dd'),
      priority: this.determinePriority(description, context),
      status: 'pending' as const
    };

    // Debug logging
    console.log('[Task Extraction] Adding task:', task);

    if (!tasks.has(mappedAssignee)) {
      tasks.set(mappedAssignee, []);
    }
    tasks.get(mappedAssignee)!.push(task);
  }

  private extractTasks(): Map<string, Task[]> {
    const tasks = new Map<string, Task[]>();
    const dialogues = this.parseDialogue();
    let contextWindow: string[] = [];

    // --- New: Extract tasks from decision lists ---
    const decisionListPattern = /decisions? for today are[:]?/i;
    const numberedTaskPattern = /^\d+\.\s*(.+)$/;
    let inDecisionList = false;
    let lastSpeaker = '';
    dialogues.forEach((dialogue, index) => {
      // Detect start of decision list
      if (decisionListPattern.test(dialogue.content)) {
        inDecisionList = true;
        lastSpeaker = dialogue.speaker;
        return;
      }
      // Extract numbered tasks from decision list
      if (inDecisionList) {
        const match = dialogue.content.match(numberedTaskPattern);
        if (match) {
          // Try to extract assignee from the text
          let assignee = '';
          const assigneeMatch = match[1].match(/^(\w+) will|^(\w+),|for (\w+) to|for (\w+):/i);
          if (assigneeMatch) {
            assignee = (assigneeMatch[1] || assigneeMatch[2] || assigneeMatch[3] || assigneeMatch[4] || '').toUpperCase();
          }
          // Fallback to last speaker if not found
          if (!assignee) assignee = lastSpeaker;
          this.addTask(tasks, assignee, match[1], []);
          return;
        } else {
          inDecisionList = false;
        }
      }
    });

    // --- Existing: Extract tasks from dialogue lines ---
    dialogues.forEach((dialogue, index) => {
      contextWindow = [
        ...(dialogues.slice(Math.max(0, index - 2), index).map(d => d.content)),
        dialogue.content,
        ...(dialogues.slice(index + 1, index + 3).map(d => d.content))
      ];

      // Enhanced task assignment patterns
      const taskPatterns = [
        { pattern: /^(\w+), can you (.+?)(?:\?|$)/i, assigneeGroup: 1, taskGroup: 2 },
        { pattern: /Action item for (\w+): (.+?)(?:\.|$)/i, assigneeGroup: 1, taskGroup: 2 },
        { pattern: /^(\w+) will (.+?)(?:\.|$)/i, assigneeGroup: 1, taskGroup: 2 },
        { pattern: /^(\w+) to (.+?)(?:\.|$)/i, assigneeGroup: 1, taskGroup: 2 },
        { pattern: /(?:please|can you|could you|would you) (.+?)(?:\.|$)/i, assignee: dialogue.speaker },
        { pattern: /(?:going to|plan to) (.+?)(?:\.|$)/i, assignee: dialogue.speaker }
      ];

      let matched = false;
      for (const { pattern, assignee, assigneeGroup, taskGroup } of taskPatterns) {
        const match = dialogue.content.match(pattern);
        if (match) {
          const taskAssignee = assigneeGroup && match[assigneeGroup] ? match[assigneeGroup].toUpperCase() : (assignee || dialogue.speaker);
          const taskDescription = taskGroup && match[taskGroup] ? match[taskGroup] : match[1];
          if (taskAssignee && taskDescription && taskDescription.length > 3) {
            this.addTask(tasks, taskAssignee, taskDescription, contextWindow);
            matched = true;
            break;
          }
        }
      }
      // Fallback: Use isTaskLike for other lines
      if (!matched && this.isTaskLike(dialogue.content)) {
        this.addTask(tasks, dialogue.speaker, dialogue.content, contextWindow);
      }
    });

    // Deduplicate and merge tasks for each employee
    for (const [assignee, employeeTasks] of tasks) {
      tasks.set(assignee, this.deduplicateAndMergeTasks(employeeTasks));
    }

    return tasks;
  }

  private extractMeetingDetails(): MeetingDetails {
    const dialogues = this.parseDialogue();
    
    // Extract meeting duration and participants from header or footer
    const timePattern = /Duration: (\d+) minutes/;
    const participantsPattern = /Participants: (.*?)(?:\n|$)/;

    const timeMatch = this.text.match(timePattern);
    const participantsMatch = this.text.match(participantsPattern);

    const duration = timeMatch ? parseInt(timeMatch[1]) : 60; // Default 1 hour
    const participants = Array.from(this.employeeNames.values());

    // Extract key decisions and action items
    const keyDecisions = dialogues
      .filter(d => 
        d.content.toLowerCase().includes('decided') ||
        d.content.toLowerCase().includes('decision') ||
        d.content.toLowerCase().includes('agreed') ||
        d.content.toLowerCase().includes('conclusion')
      )
      .map(d => `${d.speaker}: ${d.content}`);

    const defaultDate = DateTime.local();
    const meetingDate = (this.dateContext?.isValid ? this.dateContext : defaultDate).toFormat('yyyy-MM-dd');

    return {
      date: meetingDate,
      startTime: '10:00 AM', // These could be extracted from the transcript if available
      endTime: DateTime.fromISO('10:00').plus({ minutes: duration }).toFormat('hh:mm a'),
      participants,
      summary: this.generateSummary(),
      keyDecisions: keyDecisions.length > 0 ? keyDecisions : undefined
    };
  }

  private generateSummary(): string {
    const dialogues = this.parseDialogue();
    const keyPoints = dialogues
      .filter(d => 
        d.content.includes('agenda') ||
        d.content.includes('decided') ||
        d.content.includes('conclusion') ||
        d.content.includes('priority') ||
        d.content.includes('next steps')
      )
      .map(d => d.content);

    if (keyPoints.length > 0) {
      return keyPoints.join(' ');
    }

    // Fallback summary
    return 'Meeting focused on project updates and task assignments.';
  }

  public async analyze() {
    try {
      console.log('Starting text analysis...');
      console.log('Input text:', this.text);
      
      // Get AI-powered analysis
      console.log('Initiating AI analysis...');
      const aiAnalysis = await this.aiAnalyzer.analyzeText(this.text);
      console.log('AI Analysis results:', aiAnalysis);

      // Extract meeting metadata
      console.log('Extracting meeting metadata...');
      const metadata = this.extractMetadata();
      console.log('Meeting metadata:', metadata);
      
      // Process tasks and assign to employees
      console.log('Processing tasks...');
      const employeeTaskMap = new Map<string, Task[]>();
      
      if (aiAnalysis.tasks && aiAnalysis.tasks.length > 0) {
        console.log(`Found ${aiAnalysis.tasks.length} tasks from AI analysis`);
        aiAnalysis.tasks.forEach(task => {
          console.log('Processing task:', task);
          const assignee = task.assignee || '';
          if (!employeeTaskMap.has(assignee)) {
            employeeTaskMap.set(assignee, []);
          }
          
          employeeTaskMap.get(assignee)!.push({
            id: Math.random().toString(36).substr(2, 9),
            description: task.description,
            assignedTo: this.employeeNames.get(assignee) || assignee,
            assignedDate: metadata.date,
            deadline: task.deadline || DateTime.local().plus({ days: 7 }).toFormat('yyyy-MM-dd'),
            priority: task.priority as TaskPriority || 'Medium',
            status: 'pending' as const
          });
        });
      } else {
        console.log('No tasks found from AI analysis');
      }

      // Create employee list with tasks
      console.log('Creating employee list...');
      const employees: Employee[] = [];
      for (const [assignee, tasks] of employeeTaskMap.entries()) {
        console.log(`Processing tasks for assignee: ${assignee}`);
        if (tasks.length > 0 && this.employeeNames.has(assignee)) {
          employees.push({
            name: this.employeeNames.get(assignee)!,
            tasks: tasks,
            totalTasks: tasks.length
          });
        }
      }

      // Calculate statistics
      console.log('Calculating statistics...');
      const totalTasks = employees.reduce((sum, emp) => sum + emp.tasks.length, 0);
      const highPriorityTasks = employees.reduce((sum, emp) => 
        sum + emp.tasks.filter(t => t.priority === 'High').length, 0);
      const tasksPerPerson = employees.length > 0 ? totalTasks / employees.length : 0;

      console.log('Analysis complete. Statistics:', {
        totalTasks,
        highPriorityTasks,
        tasksPerPerson,
        employeeCount: employees.length
      });

      return {
        employees,
        meetingDetails: {
          ...metadata,
          summary: aiAnalysis.summary,
          keyDecisions: aiAnalysis.keyPoints
        },
        statistics: {
          totalTasks: totalTasks || 0,
          highPriorityTasks: highPriorityTasks || 0,
          tasksPerPerson: Number.isFinite(tasksPerPerson) ? tasksPerPerson : 0
        }
      };
    } catch (error) {
      console.error('Error in text analysis:', error);
      throw new Error('Failed to analyze text');
    }
  }

  private extractMetadata(): {
    date: string;
    startTime: string;
    endTime: string;
    participants: string[];
  } {
    const defaultDate = DateTime.local();
    
    // Extract meeting date
    const dateMatch = this.text.match(/(?:Meeting Date|Date):\s*([A-Za-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})/i);
    const date = dateMatch 
      ? DateTime.fromFormat(dateMatch[1], dateMatch[1].includes('-') ? 'yyyy-MM-dd' : 'MMMM d yyyy').toFormat('yyyy-MM-dd')
      : defaultDate.toFormat('yyyy-MM-dd');

    // Extract duration and time
    const durationMatch = this.text.match(/Duration:\s*(\d+)\s*minutes/i);
    const timeMatch = this.text.match(/(?:\[|started at\s*)(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    
    const startTime = timeMatch 
      ? DateTime.fromFormat(timeMatch[1], 'h:mm a').toFormat('hh:mm a')
      : '10:00 AM';
    
    const duration = durationMatch ? parseInt(durationMatch[1]) : 60;
    const endTime = DateTime.fromFormat(startTime, 'hh:mm a')
      .plus({ minutes: duration })
      .toFormat('hh:mm a');

    // Extract participants
    const participants = Array.from(this.employeeNames.values());

    return {
      date,
      startTime,
      endTime,
      participants
    };
  }

  private extractTaskDetails(text: string): Partial<Task> {
    const defaultDate = DateTime.local();
    
    // Try to extract deadline from text
    const deadlinePatterns = [
      /by\s+(next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /by\s+(?:end\s+of|eow|eom|eoq)\b/i,
      /due\s+(?:on|by)?\s*([a-zA-Z0-9\s,]+)/i,
      /deadline\s*(?:is|:)?\s*([a-zA-Z0-9\s,]+)/i
    ];

    let deadline = this.dateContext?.plus({ days: 7 }) || defaultDate.plus({ days: 7 });
    for (const pattern of deadlinePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Parse the deadline text and update deadline
        const deadlineText = match[1];
        if (deadlineText) {
          const parsedDate = DateTime.fromFormat(deadlineText, "yyyy-MM-dd");
          if (parsedDate.isValid) {
            deadline = parsedDate;
          }
        }
        break;
      }
    }

    // Try to extract priority from text
    const priorityPatterns = {
      High: /\b(?:urgent|critical|asap|high priority|highest priority|p0|p1)\b/i,
      Medium: /\b(?:medium priority|normal priority|p2)\b/i,
      Low: /\b(?:low priority|when possible|p3|p4)\b/i
    };

    let priority: 'High' | 'Medium' | 'Low' | undefined = undefined;
    for (const [level, pattern] of Object.entries(priorityPatterns)) {
      if (pattern.test(text)) {
        priority = level as 'High' | 'Medium' | 'Low';
        break;
      }
    }

    return {
      assignedDate: defaultDate.toFormat('yyyy-MM-dd'),
      deadline: deadline.toFormat('yyyy-MM-dd'),
      priority,
      status: 'pending' as const
    };
  }

  private createTask(text: string): Task | null {
    if (!this.isTaskLike(text)) return null;

    const details = this.extractTaskDetails(text);
    return {
      id: crypto.randomUUID(),
      description: text.trim(),
      assignedTo: this.currentSpeaker,
      assignedDate: details.assignedDate!,
      deadline: details.deadline!,
      priority: details.priority || 'Medium',
      status: 'pending'
    };
  }
} 