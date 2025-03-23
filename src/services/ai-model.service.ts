// src/services/ai-model.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiModel } from '../schemas/ai-model.schema';
import { Client } from '../schemas/client.schema';

@Injectable()
export class AiModelService {
    private readonly logger = new Logger(AiModelService.name);

    constructor(
        @InjectModel(AiModel.name) private aiModelModel: Model<AiModel>,
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    /**
     * Sync AI models from NextJS
     */
    async syncAiModelsFromNextjs(clientId: string, nextjsModels: any[]): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
        modelMappings: { nextJsId: string; visionTrackId: string }[];
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;
            const modelMappings: { nextJsId: string; visionTrackId: string }[] = [];

            // Process each AI model
            for (const nextjsModel of nextjsModels) {
                try {
                    // Check if model exists by external ID
                    const existingModel = await this.aiModelModel.findOne({
                        'externalIds.nextJsId': nextjsModel.id.toString()
                    });

                    if (existingModel) {
                        // Model exists - check if it needs to be updated
                        let needsUpdate = false;

                        // Compare and update fields
                        if (existingModel.name !== nextjsModel.name) {
                            existingModel.name = nextjsModel.name;
                            needsUpdate = true;
                        }

                        // ... rest of the update logic ...

                        if (needsUpdate) {
                            await existingModel.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Add the mapping regardless of whether an update was needed
                        modelMappings.push({
                            nextJsId: nextjsModel.id.toString(),
                            visionTrackId: existingModel._id.toString()
                        });
                    } else {
                        // Model doesn't exist - create it
                        const newModel = await this.aiModelModel.create({
                            name: nextjsModel.name,
                            description: nextjsModel.description,
                            clientId: clientId,
                            isActive: nextjsModel.active,
                            version: nextjsModel.version,
                            externalIds: {
                                nextJsId: nextjsModel.id.toString()
                            },
                            metadata: {
                                type: nextjsModel.type,
                                capabilities: nextjsModel.capabilities,
                                configOptions: nextjsModel.configOptions,
                                source: nextjsModel.source,
                                compatibleWith: nextjsModel.compatibleWith
                            }
                        });

                        created++;

                        // Add the mapping for the newly created model
                        modelMappings.push({
                            nextJsId: nextjsModel.id.toString(),
                            visionTrackId: newModel._id.toString()
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error processing AI model ${nextjsModel.id}: ${error.message}`);
                    errors++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`,
                created,
                updated,
                unchanged,
                errors,
                modelMappings
            };
        } catch (error) {
            this.logger.error(`Error syncing AI models from NextJS: ${error.message}`, error.stack);
            throw error;
        }
    }
    /**
     * Update NextJS ID for a model
     */
    async updateNextJsId(id: string, nextJsId: string) {
        const model = await this.aiModelModel.findById(id);
        if (!model) {
            throw new NotFoundException('AI model not found');
        }

        if (!model.externalIds) {
            model.externalIds = {};
        }

        model.externalIds.nextJsId = nextJsId;
        await model.save();

        return { success: true, model };
    }
}