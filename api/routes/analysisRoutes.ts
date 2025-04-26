import { Router } from 'express';
import { analyzeText } from '../controllers/analysisController';

const router = Router();

// Route for text analysis
router.post('/analyze', analyzeText);

export default router; 
