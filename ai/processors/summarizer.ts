import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const processTextAnalysis = async (text: string): Promise<string> => {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Please provide a concise summary of the following text:\n\n${text}`,
            max_tokens: 150,
            temperature: 0.7,
        });

        return response.data.choices[0]?.text?.trim() || 'No summary available';
    } catch (error) {
        console.error('Error in text summarization:', error);
        throw new Error('Failed to summarize text');
    }
}; 
