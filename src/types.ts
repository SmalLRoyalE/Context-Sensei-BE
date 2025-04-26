export interface Task {
  id: string;
  description: string;
  assignedTo: string;
  assignedDate: string;
  deadline: string;
  priority: TaskPriority;
  status: 'pending' | 'in_progress' | 'completed';
}

export type TaskPriority = 'High' | 'Medium' | 'Low';

export interface Employee {
  name: string;
  tasks: Task[];
  totalTasks: number;
}

export interface MeetingDetails {
  date: string;
  startTime: string;
  endTime: string;
  participants: string[];
  summary: string;
  keyDecisions?: string[];  // Added keyDecisions as optional field
}

export interface Statistics {
  totalTasks: number;
  highPriorityTasks: number;
  tasksPerPerson: number;
}

export interface AnalysisResults {
  employees: Employee[];
  statistics: Statistics;
  meetingDetails: MeetingDetails;
} 