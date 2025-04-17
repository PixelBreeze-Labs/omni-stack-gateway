// src/services/client-app.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ClientApp } from '../schemas/client-app.schema';
import {
    CreateClientAppDto,
    UpdateClientAppDto,
    ListClientAppDto
} from '../dtos/client-app.dto';

@Injectable()
export class ClientAppService {
    constructor(
        @InjectModel('ClientApp') private clientAppModel: Model<ClientApp>
    ) {}

    async findAll(query: ListClientAppDto): Promise<{
        data: ClientApp[];
        total: number;
        message: string;
        metrics: {
            totalApps: number;
            activeApps: number;
            inactiveApps: number;
            recentApps: number;
        };
    }> {
        // Use destructuring with only properties that exist in ListClientAppDto
        const { limit = 10, skip = 0, search, status, type } = query as ListClientAppDto & { type?: string };

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

        if (type) {
            filter.type = type;
        }

        const data = await this.clientAppModel
            .find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ configuredAt: -1 });

        const total = await this.clientAppModel.countDocuments(filter);

        const [totalApps, activeApps, inactiveApps, recentApps] = await Promise.all([
            this.clientAppModel.countDocuments(),
            this.clientAppModel.countDocuments({ status: 'active' }),
            this.clientAppModel.countDocuments({ status: 'inactive' }),
            this.clientAppModel.countDocuments({
                configuredAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            })
        ]);

        return {
            data,
            total,
            message: 'Client apps fetched successfully',
            metrics: {
                totalApps,
                activeApps,
                inactiveApps,
                recentApps
            }
        };
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
        const clientApp = await this.clientAppModel.findByIdAndUpdate(id, updateClientAppDto, { new: true });
        if (!clientApp) throw new NotFoundException('Client App not found');
        return clientApp;
    }

    async remove(id: string) {
        const result = await this.clientAppModel.findByIdAndDelete(id);
        if (!result) throw new NotFoundException('Client App not found');
        return { success: true };
    }

    async findByApiKey(apiKey: string): Promise<ClientApp> {
        const clientApp = await this.clientAppModel.findOne({ apiKey });
        if (!clientApp) throw new NotFoundException('Invalid API key');
        return clientApp;
    }
}