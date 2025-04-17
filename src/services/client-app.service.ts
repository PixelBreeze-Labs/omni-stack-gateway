// src/services/client-app.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ClientApp } from '../schemas/client-app.schema';
import { ClientService } from './client.service';
import {
    CreateClientAppDto,
    UpdateClientAppDto,
    ListClientAppDto
} from '../dtos/client-app.dto';

@Injectable()
export class ClientAppService {
    constructor(
        @InjectModel('ClientApp') private clientAppModel: Model<ClientApp>,
        private clientService: ClientService
    ) {}

    async findAll(query: ListClientAppDto): Promise<{
        data: any[];
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

        // Enhance with client data
        const enhancedData = await this.enhanceWithClientData(data);

        return {
            data: enhancedData,
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
        
        // Enhance with client data
        const enhancedData = await this.enhanceWithClientData([clientApp]);
        return enhancedData[0];
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
        
        const savedApp = await clientApp.save();
        
        // Enhance with client data
        const enhancedData = await this.enhanceWithClientData([savedApp]);
        return enhancedData[0];
    }

    async update(id: string, updateClientAppDto: UpdateClientAppDto) {
        const clientApp = await this.clientAppModel.findByIdAndUpdate(id, updateClientAppDto, { new: true });
        if (!clientApp) throw new NotFoundException('Client App not found');
        
        // Enhance with client data
        const enhancedData = await this.enhanceWithClientData([clientApp]);
        return enhancedData[0];
    }

    async remove(id: string) {
        const result = await this.clientAppModel.findByIdAndDelete(id);
        if (!result) throw new NotFoundException('Client App not found');
        return { success: true };
    }

    async findByApiKey(apiKey: string): Promise<any> {
        const clientApp = await this.clientAppModel.findOne({ apiKey });
        if (!clientApp) throw new NotFoundException('Invalid API key');
        
        // Enhance with client data
        const enhancedData = await this.enhanceWithClientData([clientApp]);
        return enhancedData[0];
    }

    // Helper method to enhance client apps with client data
    private async enhanceWithClientData(clientApps: ClientApp[]): Promise<any[]> {
        if (!clientApps || clientApps.length === 0) {
            return [];
        }
        
        // Get all client app IDs
        const appIds = clientApps.map(app => app._id.toString());
        
        // Get client info for these app IDs
        const clientInfoMap = await this.clientService.getClientInfoForApps(appIds);
        
        // Enhance each app with its client info
        return clientApps.map(app => {
            const appObj = app.toObject ? app.toObject() : { ...app };
            const appId = appObj._id.toString();
            
            // Add client data if available
            if (clientInfoMap[appId]) {
                appObj.client = clientInfoMap[appId];
            } else {
                // Add empty client data as fallback
                appObj.client = { name: null, code: null };
            }
            
            return appObj;
        });
    }
}