export interface Task {
  name: string;
  tasks: string[];
  assignedDate: string;
  deadline: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface MeetingAnalysis {
  tasks: Task[];
  summary: string;
  keyPoints: string[];
}

export interface NLPService {
  analyzeText(text: string): Promise<MeetingAnalysis>;
  extractNames(text: string): Promise<string[]>;
  extractTasks(text: string): Promise<string[]>;
  extractDates(text: string): Promise<{ assignedDate: string; deadline: string }>;
  determinePriority(text: string): Promise<'High' | 'Medium' | 'Low'>;
}