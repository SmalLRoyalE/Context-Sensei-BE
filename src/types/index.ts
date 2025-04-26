export type TaskPriority = 'High' | 'Medium' | 'Low';

export interface Task {
  id: string;
  description: string;
  assignedTo: string;
  assignedDate: string;
  deadline: string;
  priority?: 'High' | 'Medium' | 'Low';
  status: 'pending' | 'in_progress' | 'completed';
}

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
}

export interface Statistics {
  totalTasks: number;
  highPriorityTasks: number;
  tasksPerPerson: number;
}

export interface AnalysisResults {
  employees: Employee[];
  meetingDetails: MeetingDetails;
  statistics: Statistics;
} 