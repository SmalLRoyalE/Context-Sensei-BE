import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TextAnalyzer } from './utils/textAnalysis';
import { Task, Employee, AnalysisResults } from './types';
import { Document } from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Packer } from 'docx';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}

async function analyzeTextWithAI(text: string): Promise<{ summary: string; keyPoints: string[] }> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('Hugging Face API key not configured');
  }

  try {
    // Summary generation using bart-large-cnn model
    const summaryResponse = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-cnn", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,  // API key used here
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          max_length: 250,
          min_length: 100,
        },
      }),
    });

    // Key points extraction using bart-large-xsum model
    const keyPointsResponse = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-xsum", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,  // API key used here
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          max_length: 150,
          num_return_sequences: 5,
        },
      }),
    });

    if (!summaryResponse.ok || !keyPointsResponse.ok) {
      throw new Error('Failed to get response from Hugging Face API');
    }

    const summaryData = await summaryResponse.json();
    const keyPointsData = await keyPointsResponse.json();

    return {
      summary: summaryData[0].summary_text,
      keyPoints: keyPointsData.map((item: any) => item.summary_text),
    };
  } catch (error) {
    console.error('AI Analysis error:', error);
    throw new Error('Failed to analyze text with AI');
  }
}

function extractTasks(text: string): Task[] {
  const tasks: Task[] = [];
  const lines = text.split('\n');
  let currentSpeaker = '';

  const taskPatterns = [
    /(?:action item|task|todo|to-do|assigned to)\s*[:|-]\s*(.+)/i,
    /\b(?:need to|should|must|will|going to|has to)\s+([^.!?]+)/i,
    /(\w+)\s+(?:to|will|should)\s+([^.!?]+)/i,
    /(\w+)\s+is?\s+responsible\s+for\s+([^.!?]+)/i
  ];

  lines.forEach((line) => {
    const speakerMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*:/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
      return;
    }

    taskPatterns.forEach(pattern => {
      const match = line.match(pattern);
      if (match) {
        const taskDescription = match[1] || match[2];
        if (taskDescription && taskDescription.length > 5) {
          const task: Task = {
            id: generateUniqueId(),
            description: taskDescription.trim(),
            assignedTo: currentSpeaker,
            assignedDate: new Date().toISOString().split('T')[0],
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            priority: 'Medium',
            status: 'pending'
          };
          tasks.push(task);
        }
      }
    });
  });

  return tasks;
}

async function parseText(text: string): Promise<AnalysisResults> {
  // Get AI analysis
  const aiAnalysis = await analyzeTextWithAI(text);
  
  // Extract tasks
  const tasks = extractTasks(text);

  // Group tasks by employee
  const employeeMap = new Map<string, Task[]>();
  tasks.forEach(task => {
    if (!employeeMap.has(task.assignedTo)) {
      employeeMap.set(task.assignedTo, []);
    }
    employeeMap.get(task.assignedTo)!.push(task);
  });

  // Create employee list with statistics
  const employees = Array.from(employeeMap.entries()).map(([name, tasks]) => ({
    name,
    tasks,
    totalTasks: tasks.length
  }));

  const totalTasks = employees.reduce((sum, emp) => sum + emp.totalTasks, 0);

  return {
    employees,
    statistics: {
      totalTasks,
      highPriorityTasks: tasks.filter(t => t.priority === 'High').length,
      tasksPerPerson: employees.length > 0 ? totalTasks / employees.length : 0
    },
    meetingDetails: {
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00 AM',
      endTime: '10:00 AM',
      participants: employees.map(e => e.name),
      summary: aiAnalysis.summary
    }
  };
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
    if (!huggingFaceApiKey) {
      return res.status(500).json({ error: 'Hugging Face API key not configured' });
    }

    const analyzer = new TextAnalyzer(text, huggingFaceApiKey);
    const results = await analyzer.analyze();
    
    res.json(results);
  } catch (error) {
    console.error('Error analyzing text:', error);
    res.status(500).json({ error: 'Failed to analyze text' });
  }
});

// Export endpoints
app.post('/api/export/:format', async (req, res) => {
  const { format } = req.params;
  const { content } = req.body;

  try {
    switch (format) {
      case 'txt':
        // Plain text export
        const textContent = generateTextExport(content);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename=analysis-report.txt');
        return res.send(textContent);

      case 'docx':
        // DOCX export with proper Document handling
        const doc = await generateDocxExport(content);
        const buffer = await Packer.toBuffer(doc); // Use Packer from docx package
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=analysis-report.docx');
        return res.send(buffer);

      case 'xlsx':
        // Excel export
        const workbook = await generateExcelExport(content);
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=analysis-report.xlsx');
        return res.send(excelBuffer);

      case 'pdf':
        // PDF export
        const pdfDoc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=analysis-report.pdf');
        pdfDoc.pipe(res);
        await generatePDFExport(pdfDoc, content);
        pdfDoc.end();
        return;

      default:
        return res.status(400).json({
          error: {
            message: `Invalid format: ${format}`,
            code: 'INVALID_FORMAT'
          }
        });
    }
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'An error occurred during export',
        code: 'EXPORT_ERROR'
      }
    });
  }
});

function generateTextExport(content: any): string {
  let text = '';

  // Add meeting details
  if (content.meetingDetails) {
    text += 'Meeting Details\n';
    text += '==============\n\n';
    text += `Date: ${content.meetingDetails.date}\n`;
    text += `Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}\n`;
    text += `Participants: ${content.meetingDetails.participants.join(', ')}\n`;
    text += `Summary: ${content.meetingDetails.summary}\n\n`;
  }

  // Add statistics
  if (content.statistics) {
    text += 'Statistics\n';
    text += '==========\n\n';
    text += `Total Tasks: ${content.statistics.totalTasks}\n`;
    text += `High Priority Tasks: ${content.statistics.highPriorityTasks}\n`;
    text += `Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}\n\n`;
  }

  // Add tasks
  if (content.tasks) {
    text += 'Tasks\n';
    text += '=====\n\n';
    content.tasks.forEach((task: Task) => {
      text += `Assignee: ${task.assignedTo}\n`;
      text += `Description: ${task.description}\n`;
      text += `Priority: ${task.priority}\n`;
      text += `Assigned Date: ${task.assignedDate}\n`;
      text += `Deadline: ${task.deadline}\n\n`;
    });
  }

  return text;
}

async function generateDocxExport(content: any): Promise<Document> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Meeting Details
        {
          text: 'Meeting Details',
          heading: 1,
          bold: true,
          spacing: { after: 200 }
        },
        {
          text: `Date: ${content.meetingDetails.date}`,
          spacing: { after: 100 }
        },
        {
          text: `Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}`,
          spacing: { after: 100 }
        },
        {
          text: `Participants: ${content.meetingDetails.participants.join(', ')}`,
          spacing: { after: 100 }
        },
        {
          text: `Summary: ${content.meetingDetails.summary}`,
          spacing: { after: 200 }
        },

        // Statistics
        {
          text: 'Statistics',
          heading: 1,
          bold: true,
          spacing: { after: 200 }
        },
        {
          text: `Total Tasks: ${content.statistics.totalTasks}`,
          spacing: { after: 100 }
        },
        {
          text: `High Priority Tasks: ${content.statistics.highPriorityTasks}`,
          spacing: { after: 100 }
        },
        {
          text: `Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}`,
          spacing: { after: 200 }
        },

        // Tasks
        {
          text: 'Tasks',
          heading: 1,
          bold: true,
          spacing: { after: 200 }
        },
        ...content.tasks.map((task: Task) => ({
          text: [
            `Assignee: ${task.assignedTo}\n`,
            `Description: ${task.description}\n`,
            `Priority: ${task.priority}\n`,
            `Assigned Date: ${task.assignedDate}\n`,
            `Deadline: ${task.deadline}\n\n`
          ].join(''),
          spacing: { after: 100 }
        }))
      ]
    }]
  });

  return doc;
}

async function generateExcelExport(content: any): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  // Meeting Details Sheet
  const meetingSheet = workbook.addWorksheet('Meeting Details');
  meetingSheet.addRows([
    ['Meeting Details'],
    ['Date', content.meetingDetails.date],
    ['Time', `${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}`],
    ['Participants', content.meetingDetails.participants.join(', ')],
    ['Summary', content.meetingDetails.summary]
  ]);

  // Statistics Sheet
  const statsSheet = workbook.addWorksheet('Statistics');
  statsSheet.addRows([
    ['Statistics'],
    ['Total Tasks', content.statistics.totalTasks],
    ['High Priority Tasks', content.statistics.highPriorityTasks],
    ['Tasks per Person', content.statistics.tasksPerPerson.toFixed(1)]
  ]);

  // Tasks Sheet
  const tasksSheet = workbook.addWorksheet('Tasks');
  tasksSheet.columns = [
    { header: 'Assignee', key: 'assignee', width: 20 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Priority', key: 'priority', width: 15 },
    { header: 'Assigned Date', key: 'assignedDate', width: 15 },
    { header: 'Deadline', key: 'deadline', width: 15 }
  ];

  content.tasks.forEach((task: Task) => {
    tasksSheet.addRow({
      assignee: task.assignedTo,
      description: task.description,
      priority: task.priority,
      assignedDate: task.assignedDate,
      deadline: task.deadline
    });
  });

  return workbook;
}

async function generatePDFExport(doc: PDFKit.PDFDocument, content: any): Promise<void> {
  // Meeting Details
  doc.fontSize(16).text('Meeting Details', { underline: true });
  doc.moveDown();
  doc.fontSize(12)
    .text(`Date: ${content.meetingDetails.date}`)
    .text(`Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}`)
    .text(`Participants: ${content.meetingDetails.participants.join(', ')}`)
    .text(`Summary: ${content.meetingDetails.summary}`);
  doc.moveDown(2);

  // Statistics
  doc.fontSize(16).text('Statistics', { underline: true });
  doc.moveDown();
  doc.fontSize(12)
    .text(`Total Tasks: ${content.statistics.totalTasks}`)
    .text(`High Priority Tasks: ${content.statistics.highPriorityTasks}`)
    .text(`Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}`);
  doc.moveDown(2);

  // Tasks
  doc.fontSize(16).text('Tasks', { underline: true });
  doc.moveDown();
  content.tasks.forEach((task: Task) => {
    doc.fontSize(12)
      .text(`Assignee: ${task.assignedTo}`)
      .text(`Description: ${task.description}`)
      .text(`Priority: ${task.priority}`)
      .text(`Assigned Date: ${task.assignedDate}`)
      .text(`Deadline: ${task.deadline}`);
    doc.moveDown();
  });
}

// Add task update endpoint
app.patch('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { priority } = req.body;

    // Validate priority if provided
    if (priority !== undefined && !['High', 'Medium', 'Low'].includes(priority)) {
      return res.status(400).json({
        error: {
          message: 'Invalid priority value',
          code: 'INVALID_PRIORITY'
        }
      });
    }

    // In a real application, you would update this in a database
    // For now, we'll just return success
    return res.json({ success: true });
  } catch (error) {
    console.error('Task update error:', error);
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Failed to update task',
        code: 'UPDATE_ERROR'
      }
    });
  }
});

app.get('/api/test-connection', async (req, res) => {
  try {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured' 
      });
    }

    // Test with a simple text to verify API connection
    const testText = "This is a test message to verify the API connection.";
    
    // Test summary model
    const summaryResponse = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-cnn", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: testText,
        parameters: {
          max_length: 100,
          min_length: 30,
        },
      }),
    });

    if (!summaryResponse.ok) {
      throw new Error(`API request failed with status: ${summaryResponse.status}`);
    }

    const summaryData = await summaryResponse.json();

    res.json({
      success: true,
      message: 'API connection successful',
      testResponse: summaryData
    });

  } catch (error) {
    console.error('API test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test API connection'
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 