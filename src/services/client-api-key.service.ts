// src/services/api-key.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import * as crypto from 'crypto';

@Injectable()
export class ClientApiKeyService {
    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    async generateApiKey(): Promise<string> {
        const key = crypto.randomBytes(32).toString('hex');
        return `sk_${key}`;
    }

    async validateApiKey(apiKey: string): Promise<boolean> {
        const client = await this.clientModel.findOne({ apiKey });
        return !!client;
    }
}