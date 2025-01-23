// src/services/client-app.service.ts
import {Injectable, NotFoundException, UnauthorizedException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ClientApp } from '../schemas/client-app.schema';
import { CreateClientAppDto, UpdateClientAppDto, ListClientAppDto } from '../dtos/client-app.dto';

@Injectable()
export class ClientAppService {
    constructor(
        @InjectModel('ClientApp') private clientAppModel: Model<ClientApp>
    ) {}

    async findAll(query: ListClientAppDto) {
        const { limit = 10, skip = 0, search, status } = query;
        const filter: any = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            filter.status = status;
        }

        return this.clientAppModel
            .find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ configuredAt: -1 });
    }

    async findOne(id: string) {
        const clientApp = await this.clientAppModel.findById(id);
        if (!clientApp) throw new NotFoundException('Client App not found');
        return clientApp;
    }

    async create(createClientAppDto: CreateClientAppDto) {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const clientApp = new this.clientAppModel({
            ...createClientAppDto,
            apiKey,
            configuredAt: new Date(),
            status: 'active',
            reportConfig: {
                form: {
                    title: 'Report Issue',
                    subtitle: 'Tell us what happened',
                    nameInput: {
                        placeholder: 'Your name',
                        required: false
                    },
                    messageInput: {
                        placeholder: 'Describe the issue',
                        required: true
                    },
                    submitButton: {
                        text: 'Submit',
                        backgroundColor: '#0f172a',
                        textColor: '#ffffff',
                        iconColor: '#ffffff'
                    }
                },
                email: {
                    recipients: [createClientAppDto.email || 'support@example.com'],
                    fromName: createClientAppDto.name,
                    fromEmail: 'no-reply@example.com',
                    subject: 'New Issue Report',
                    template: null
                }
            }
        });
        return clientApp.save();
    }

    async update(id: string, updateClientAppDto: UpdateClientAppDto) {
        const clientApp = await this.clientAppModel
            .findByIdAndUpdate(id, updateClientAppDto, { new: true });
        if (!clientApp) throw new NotFoundException('Client App not found');
        return clientApp;
    }

    async remove(id: string) {
        const result = await this.clientAppModel.findByIdAndDelete(id);
        if (!result) throw new NotFoundException('Client App not found');
    }

    async findByApiKey(apiKey: string): Promise<ClientApp> {
        const clientApp = await this.clientAppModel.findOne({ apiKey });
        if (!clientApp) throw new UnauthorizedException('Invalid API key1');
        return clientApp;
    }
}