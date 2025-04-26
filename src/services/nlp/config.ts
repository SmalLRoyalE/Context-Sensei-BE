export const NLP_CONFIG = {
  openai: {
    model: "text-davinci-003",
    maxTokens: {
      names: 100,
      tasks: 200,
      dates: 100,
      summary: 150,
      keyPoints: 200
    }
  },
  priorityKeywords: {
    high: ['urgent', 'immediately', 'asap', 'high priority', 'critical'],
    medium: ['soon', 'medium priority', 'important'],
    low: ['when possible', 'low priority', 'optional']
  },
  dateFormats: [
    'yyyy-MM-dd',
    'dd/MM/yyyy',
    'MM/dd/yyyy',
    'MMMM d, yyyy',
    'd MMMM yyyy'
  ]
}; 