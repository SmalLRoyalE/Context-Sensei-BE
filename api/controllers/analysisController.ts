import { Request, Response } from 'express';
import { processTextAnalysis } from '../../ai/processors/summarizer';
import { extractActionItems } from '../../ai/processors/actionItemExtractor';
import { recognizeEntities } from '../../ai/processors/entityRecognition';

export const analyzeText = async (req: Request, res: Response) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        // Process the text through various analyzers
        const summary = await processTextAnalysis(text);
        const actionItems = await extractActionItems(text);
        const entities = await recognizeEntities(text);

        // Combine all analysis results
        const analysisResults = {
            summary,
            actionItems,
            entities,
            timestamp: new Date().toISOString()
        };

        res.status(200).json(analysisResults);
    } catch (error) {
        console.error('Error in text analysis:', error);
        res.status(500).json({ error: 'Failed to analyze text' });
    }
}; 
