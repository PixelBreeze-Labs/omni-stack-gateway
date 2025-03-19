// src/services/checkin-form-config.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CheckinFormConfig } from '../schemas/checkin-form-config.schema';
import { CreateCheckinFormConfigDto, UpdateCheckinFormConfigDto } from '../dtos/checkin-form.dto';
import { nanoid } from 'nanoid';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    propertyId?: string;
    isActive?: boolean;
}

@Injectable()
export class CheckinFormConfigService {
    private readonly logger = new Logger(CheckinFormConfigService.name);

    constructor(
        @InjectModel(CheckinFormConfig.name) private checkinFormConfigModel: Model<CheckinFormConfig>
    ) {}

    /**
     * Generate a unique short code for a check-in form
     */
    private async generateUniqueShortCode(length: number = 8): Promise<string> {
        const shortCode = nanoid(length);

        // Check if this short code already exists
        const existingForm = await this.checkinFormConfigModel.findOne({ shortCode });

        // If it exists, recursively generate a new one
        if (existingForm) {
            return this.generateUniqueShortCode(length);
        }

        return shortCode;
    }

    /**
     * Create a new check-in form configuration
     */
    async create(clientId: string, createDto: CreateCheckinFormConfigDto): Promise<CheckinFormConfig> {
        try {
            // Generate a unique short code
            const shortCode = await this.generateUniqueShortCode();

            // Create the form config
            const newFormConfig = new this.checkinFormConfigModel({
                ...createDto,
                clientId,
                shortCode,
                isActive: createDto.isActive !== undefined ? createDto.isActive : true
            });

            return newFormConfig.save();
        } catch (error) {
            this.logger.error(`Error creating check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Update an existing check-in form configuration
     */
    async update(clientId: string, shortCode: string, updateDto: UpdateCheckinFormConfigDto): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            });

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Update fields if provided
            if (updateDto.name !== undefined) formConfig.name = updateDto.name;
            if (updateDto.propertyId !== undefined) formConfig.propertyId = updateDto.propertyId;
            if (updateDto.formConfig !== undefined) formConfig.formConfig = updateDto.formConfig;
            if (updateDto.isActive !== undefined) formConfig.isActive = updateDto.isActive;
            if (updateDto.expiresAt !== undefined) formConfig.expiresAt = updateDto.expiresAt;
            if (updateDto.metadata !== undefined) formConfig.metadata = updateDto.metadata;

            return formConfig.save();
        } catch (error) {
            this.logger.error(`Error updating check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a check-in form config by its short code
     */
    async findByShortCode(shortCode: string): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({ shortCode }).lean();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            return formConfig;
        } catch (error) {
            this.logger.error(`Error finding check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a check-in form config by ID
     */
    async findById(clientId: string, id: string): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                _id: id,
                clientId
            }).lean();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with ID ${id} not found`);
            }

            return formConfig;
        } catch (error) {
            this.logger.error(`Error finding check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * List all check-in form configs with filtering and pagination
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, propertyId, isActive } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add property filter if provided
            if (propertyId) {
                filter.propertyId = propertyId;
            }

            // Add active status filter if provided
            if (isActive !== undefined) {
                filter.isActive = isActive;
            }

            // Add search filter if provided
            if (search) {
                filter.name = { $regex: search, $options: 'i' };
            }

            // Execute the query with pagination
            const [formConfigs, total] = await Promise.all([
                this.checkinFormConfigModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.checkinFormConfigModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: formConfigs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            };
        } catch (error) {
            this.logger.error(`Error finding check-in form configs: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Soft delete a check-in form config by setting isActive to false
     */
    async softDelete(clientId: string, shortCode: string): Promise<{ success: boolean }> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            });

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Soft delete by marking as inactive
            formConfig.isActive = false;
            await formConfig.save();

            return { success: true };
        } catch (error) {
            this.logger.error(`Error soft deleting check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Hard delete a check-in form config (admin only)
     */
    async hardDelete(clientId: string, shortCode: string): Promise<{ success: boolean }> {
        try {
            const result = await this.checkinFormConfigModel.deleteOne({
                shortCode,
                clientId
            });

            if (result.deletedCount === 0) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            return { success: true };
        } catch (error) {
            this.logger.error(`Error hard deleting check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }
}