// src/services/client-app.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClientApp } from '../interfaces/client-app.interface';
import * as crypto from 'crypto';

@Injectable()
export class ClientAppService {
    constructor(
        @InjectModel('ClientApp') private readonly clientAppModel: Model<ClientApp>
    ) {}

    async create(clientApp: Partial<ClientApp>): Promise<ClientApp> {
        const apiKey = this.generateApiKey();
        const newClientApp = new this.clientAppModel({
            ...clientApp,
            apiKey,
            configuredAt: new Date(),
            status: 'active'
        });
        return await newClientApp.save();
    }

    async findAll(): Promise<ClientApp[]> {
        return await this.clientAppModel.find().exec();
    }

    async findOne(id: string): Promise<ClientApp> {
        return await this.clientAppModel.findById(id).exec();
    }

    async findByApiKey(apiKey: string): Promise<ClientApp> {
        return await this.clientAppModel.findOne({ apiKey }).exec();
    }

    async update(id: string, clientApp: Partial<ClientApp>): Promise<ClientApp> {
        return await this.clientAppModel
            .findByIdAndUpdate(id, clientApp, { new: true })
            .exec();
    }

    async delete(id: string): Promise<ClientApp> {
        return await this.clientAppModel.findByIdAndDelete(id).exec();
    }

    private generateApiKey(): string {
        return `ca_${crypto.randomBytes(24).toString('hex')}`;
    }
}