import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

interface Task {
  id: string;
  description: string;
  assignedTo: string;
  assignedBy: string;
  assignedDate: string;
  deadline: string;
  priority: 'High' | 'Medium' | 'Low';
  context: string;
}

interface MeetingDetails {
  date: string;
  startTime: string;
  endTime: string;
  participants: string[];
  summary: string;
}

interface Statistics {
  totalTasks: number;
  highPriorityTasks: number;
  tasksPerPerson: number;
}

interface ExportContent {
  meetingDetails?: MeetingDetails;
  tasks?: Task[];
  statistics?: Statistics;
}

export async function exportToTxt(content: ExportContent): Promise<Buffer> {
  let text = '';

  if (content.meetingDetails) {
    text += 'Meeting Details\n';
    text += '===============\n';
    text += `Date: ${content.meetingDetails.date}\n`;
    text += `Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}\n`;
    text += `Participants: ${content.meetingDetails.participants.join(', ')}\n`;
    text += `Summary: ${content.meetingDetails.summary}\n\n`;
  }

  if (content.statistics) {
    text += 'Statistics\n';
    text += '==========\n';
    text += `Total Tasks: ${content.statistics.totalTasks}\n`;
    text += `High Priority Tasks: ${content.statistics.highPriorityTasks}\n`;
    text += `Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}\n\n`;
  }

  if (content.tasks && content.tasks.length > 0) {
    text += 'Tasks\n';
    text += '=====\n';
    content.tasks.forEach((task, index) => {
      text += `${index + 1}. ${task.description}\n`;
      text += `   Assigned to: ${task.assignedTo}\n`;
      text += `   Priority: ${task.priority}\n`;
      text += `   Deadline: ${task.deadline}\n`;
      text += `   Context: ${task.context}\n\n`;
    });
  }

  return Buffer.from(text, 'utf-8');
}

export async function exportToDocx(content: ExportContent): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'Meeting Analysis Report', bold: true, size: 32 })],
        }),
        new Paragraph({ text: '' }),

        // Meeting Details
        ...(content.meetingDetails ? [
          new Paragraph({ children: [new TextRun({ text: 'Meeting Details', bold: true, size: 28 })] }),
          new Paragraph({ children: [new TextRun({ text: `Date: ${content.meetingDetails.date}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Participants: ${content.meetingDetails.participants.join(', ')}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Summary: ${content.meetingDetails.summary}` })] }),
          new Paragraph({ text: '' }),
        ] : []),

        // Statistics
        ...(content.statistics ? [
          new Paragraph({ children: [new TextRun({ text: 'Statistics', bold: true, size: 28 })] }),
          new Paragraph({ children: [new TextRun({ text: `Total Tasks: ${content.statistics.totalTasks}` })] }),
          new Paragraph({ children: [new TextRun({ text: `High Priority Tasks: ${content.statistics.highPriorityTasks}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}` })] }),
          new Paragraph({ text: '' }),
        ] : []),

        // Tasks
        ...(content.tasks ? [
          new Paragraph({ children: [new TextRun({ text: 'Tasks', bold: true, size: 28 })] }),
          ...content.tasks.flatMap((task, index) => [
            new Paragraph({ children: [new TextRun({ text: `${index + 1}. ${task.description}`, bold: true })] }),
            new Paragraph({ children: [new TextRun({ text: `Assigned to: ${task.assignedTo}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Priority: ${task.priority}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Deadline: ${task.deadline}` })] }),
            new Paragraph({ children: [new TextRun({ text: `Context: ${task.context}` })] }),
            new Paragraph({ text: '' }),
          ]),
        ] : []),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function exportToXlsx(content: ExportContent): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Meeting Details Sheet
  if (content.meetingDetails) {
    const meetingSheet = workbook.addWorksheet('Meeting Details');
    meetingSheet.columns = [
      { header: 'Field', key: 'field', width: 15 },
      { header: 'Value', key: 'value', width: 50 },
    ];

    meetingSheet.addRows([
      { field: 'Date', value: content.meetingDetails.date },
      { field: 'Time', value: `${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}` },
      { field: 'Participants', value: content.meetingDetails.participants.join(', ') },
      { field: 'Summary', value: content.meetingDetails.summary },
    ]);
  }

  // Statistics Sheet
  if (content.statistics) {
    const statsSheet = workbook.addWorksheet('Statistics');
    statsSheet.columns = [
      { header: 'Metric', key: 'metric', width: 20 },
      { header: 'Value', key: 'value', width: 10 },
    ];

    statsSheet.addRows([
      { metric: 'Total Tasks', value: content.statistics.totalTasks },
      { metric: 'High Priority Tasks', value: content.statistics.highPriorityTasks },
      { metric: 'Tasks per Person', value: content.statistics.tasksPerPerson.toFixed(1) },
    ]);
  }

  // Tasks Sheet
  if (content.tasks) {
    const tasksSheet = workbook.addWorksheet('Tasks');
    tasksSheet.columns = [
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Assigned To', key: 'assignedTo', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Deadline', key: 'deadline', width: 15 },
      { header: 'Context', key: 'context', width: 40 },
    ];

    tasksSheet.addRows(content.tasks.map(task => ({
      description: task.description,
      assignedTo: task.assignedTo,
      priority: task.priority,
      deadline: task.deadline,
      context: task.context,
    })));
  }

  return await workbook.xlsx.writeBuffer() as Buffer;
}

export async function exportToPdf(content: ExportContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument();

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Meeting Analysis Report', { align: 'center' });
    doc.moveDown();

    // Meeting Details
    if (content.meetingDetails) {
      doc.fontSize(18).font('Helvetica-Bold').text('Meeting Details');
      doc.fontSize(12).font('Helvetica');
      doc.text(`Date: ${content.meetingDetails.date}`);
      doc.text(`Time: ${content.meetingDetails.startTime} - ${content.meetingDetails.endTime}`);
      doc.text(`Participants: ${content.meetingDetails.participants.join(', ')}`);
      doc.text(`Summary: ${content.meetingDetails.summary}`);
      doc.moveDown();
    }

    // Statistics
    if (content.statistics) {
      doc.fontSize(18).font('Helvetica-Bold').text('Statistics');
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total Tasks: ${content.statistics.totalTasks}`);
      doc.text(`High Priority Tasks: ${content.statistics.highPriorityTasks}`);
      doc.text(`Tasks per Person: ${content.statistics.tasksPerPerson.toFixed(1)}`);
      doc.moveDown();
    }

    // Tasks
    if (content.tasks) {
      doc.fontSize(18).font('Helvetica-Bold').text('Tasks');
      doc.moveDown();

      content.tasks.forEach((task, index) => {
        doc.fontSize(14).font('Helvetica-Bold').text(`${index + 1}. ${task.description}`);
        doc.fontSize(12).font('Helvetica');
        doc.text(`Assigned to: ${task.assignedTo}`);
        doc.text(`Priority: ${task.priority}`);
        doc.text(`Deadline: ${task.deadline}`);
        doc.text(`Context: ${task.context}`);
        doc.moveDown();
      });
    }

    doc.end();
  });
} 