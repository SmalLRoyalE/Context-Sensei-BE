import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const extractActionItems = async (text: string): Promise<string[]> => {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Extract action items from the following text. Return them as a bulleted list:\n\n${text}`,
            max_tokens: 200,
            temperature: 0.7,
        });

        const actionItems = response.data.choices[0]?.text?.trim() || '';
        return actionItems.split('\n').filter(item => item.trim().startsWith('-'));
    } catch (error) {
        console.error('Error in action item extraction:', error);
        throw new Error('Failed to extract action items');
    }
}; 
