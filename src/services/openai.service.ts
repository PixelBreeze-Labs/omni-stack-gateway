import OpenAI from 'openai';
import {Injectable} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";

interface CreateCompletionRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
}


@Injectable()
export class OpenAIService {
    private openai: OpenAI;

    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get('OPENAI_API_KEY')
        });
    }

    async createCompletion(params: CreateCompletionRequest) {
        try {
            const response = await this.openai.chat.completions.create(params);
            return response;
        } catch (error) {
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }
}