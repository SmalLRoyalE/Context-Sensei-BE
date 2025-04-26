import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const recognizeEntities = async (text: string): Promise<{ [key: string]: string[] }> => {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Identify and categorize entities (people, organizations, locations, dates) from the following text. Return them in JSON format with categories as keys and arrays of entities as values:\n\n${text}`,
            max_tokens: 200,
            temperature: 0.7,
        });

        const entitiesText = response.data.choices[0]?.text?.trim() || '{}';
        return JSON.parse(entitiesText);
    } catch (error) {
        console.error('Error in entity recognition:', error);
        throw new Error('Failed to recognize entities');
    }
}; 
