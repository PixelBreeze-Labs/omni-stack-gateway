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
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;

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

                        if (existingModel.description !== nextjsModel.description) {
                            existingModel.description = nextjsModel.description;
                            needsUpdate = true;
                        }

                        if (existingModel.version !== nextjsModel.version) {
                            existingModel.version = nextjsModel.version;
                            needsUpdate = true;
                        }

                        if (existingModel.isActive !== nextjsModel.active) {
                            existingModel.isActive = nextjsModel.active;
                            needsUpdate = true;
                        }

                        // Update metadata with model type and capabilities
                        if (!existingModel.metadata) {
                            existingModel.metadata = {};
                        }

                        if (existingModel.metadata.type !== nextjsModel.type) {
                            existingModel.metadata.type = nextjsModel.type;
                            needsUpdate = true;
                        }

                        if (JSON.stringify(existingModel.metadata.capabilities) !== JSON.stringify(nextjsModel.capabilities)) {
                            existingModel.metadata.capabilities = nextjsModel.capabilities;
                            needsUpdate = true;
                        }

                        if (JSON.stringify(existingModel.metadata.configOptions) !== JSON.stringify(nextjsModel.configOptions)) {
                            existingModel.metadata.configOptions = nextjsModel.configOptions;
                            needsUpdate = true;
                        }

                        // Store the source info
                        if (existingModel.metadata.source !== nextjsModel.source) {
                            existingModel.metadata.source = nextjsModel.source;
                            needsUpdate = true;
                        }

                        // Store compatibility info
                        if (JSON.stringify(existingModel.metadata.compatibleWith) !== JSON.stringify(nextjsModel.compatibleWith)) {
                            existingModel.metadata.compatibleWith = nextjsModel.compatibleWith;
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await existingModel.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in NextJS
                        // If visionTrackId is not set or doesn't match our model ID
                        if (!nextjsModel.visionTrackId || nextjsModel.visionTrackId !== existingModel._id.toString()) {
                            // TODO: This would require a call to NextJS API to update the ID reference
                            // This will be implemented in the controller that receives the sync request
                        }
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
                errors
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