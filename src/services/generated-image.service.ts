import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeneratedImage } from '../schemas/generated-image.schema';
import { CreateGeneratedImageDto, ListGeneratedImagesDto, UpdateGeneratedImageDto } from '../dtos/generated-image.dto';
import { LogService } from './log.service';
import { LogType } from '../schemas/log.schema';

@Injectable()
export class GeneratedImageService {
    constructor(
        @InjectModel(GeneratedImage.name) private imageModel: Model<GeneratedImage>,
        private logService: LogService
    ) {}

    async create(createDto: CreateGeneratedImageDto & { clientId: string }) {
        try {
            const image = await this.imageModel.create({
                ...createDto,
                generationTime: new Date()
            });

            // Log successful creation
            await this.logService.create({
                type: LogType.SUCCESS,
                message: 'Image generated successfully',
                sessionId: createDto.sessionId,
                clientId: createDto.clientId,
                imageId: image.id,
                actionType: 'IMAGE_GENERATION'
            });

            return image;
        } catch (error) {
            // Log error
            await this.logService.create({
                type: LogType.ERROR,
                message: 'Failed to save generated image',
                details: { error: error.message, stack: error.stack },
                sessionId: createDto.sessionId,
                clientId: createDto.clientId,
                actionType: 'IMAGE_GENERATION'
            });

            throw error;
        }
    }

    async findAll(query: ListGeneratedImagesDto & { clientId: string }) {
        const { clientId, entity, templateType, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        // Build filters
        const filters: any = { clientId };
        
        if (entity) {
            filters.entity = entity;
        }
        
        if (templateType) {
            filters.templateType = templateType;
        }

        // Get total count for pagination
        const total = await this.imageModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated images
        const images = await this.imageModel
            .find(filters)
            .sort({ generationTime: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: images,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async findOne(id: string, clientId: string) {
        const image = await this.imageModel.findOne({ _id: id, clientId });
        
        if (!image) {
            throw new NotFoundException('Generated image not found');
        }
        
        return image;
    }

    async updateDownloadTime(id: string, clientId: string) {
        try {
            const image = await this.imageModel.findOne({ _id: id, clientId });
            
            if (!image) {
                throw new NotFoundException('Generated image not found');
            }
            
            const updatedImage = await this.imageModel.findByIdAndUpdate(
                id,
                { $set: { downloadTime: new Date() } },
                { new: true }
            );

            // Log successful download
            await this.logService.create({
                type: LogType.SUCCESS,
                message: 'Image downloaded',
                sessionId: image.sessionId,
                clientId,
                imageId: id,
                actionType: 'IMAGE_DOWNLOAD'
            });

            return updatedImage;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }

            // Log error
            await this.logService.create({
                type: LogType.ERROR,
                message: 'Failed to update image download time',
                details: { error: error.message, stack: error.stack },
                sessionId: 'unknown',
                clientId,
                imageId: id,
                actionType: 'IMAGE_DOWNLOAD'
            });

            throw error;
        }
    }

    async remove(id: string, clientId: string) {
        const image = await this.imageModel.findOne({ _id: id, clientId });
        
        if (!image) {
            throw new NotFoundException('Generated image not found');
        }
        
        await this.imageModel.findByIdAndDelete(id);

        // Log deletion
        await this.logService.create({
            type: LogType.INFO,
            message: 'Image deleted',
            sessionId: image.sessionId,
            clientId,
            imageId: id,
            actionType: 'IMAGE_DELETION'
        });

        return { message: 'Image deleted successfully' };
    }

    async getImageStats(clientId: string) {
        // Get total images
        const totalImages = await this.imageModel.countDocuments({ clientId });
        
        // Get images by entity
        const entityStats = await this.imageModel.aggregate([
            { $match: { clientId } },
            { $group: { _id: '$entity', count: { $sum: 1 } } }
        ]);
        
        // Get images by template type
        const templateStats = await this.imageModel.aggregate([
            { $match: { clientId } },
            { $group: { _id: '$templateType', count: { $sum: 1 } } }
        ]);
        
        // Get download rate
        const downloadedImages = await this.imageModel.countDocuments({ 
            clientId, 
            downloadTime: { $exists: true, $ne: null } 
        });
        
        return {
            total: totalImages,
            downloadRate: totalImages ? (downloadedImages / totalImages) * 100 : 0,
            byEntity: entityStats,
            byTemplate: templateStats
        };
    }

    async findByTemplateType(templateType: string, clientId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        
        // Build filters
        const filters = { clientId, templateType };
        
        // Get total count for pagination
        const total = await this.imageModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);
        
        // Get paginated images
        const images = await this.imageModel
            .find(filters)
            .sort({ generationTime: -1 })
            .skip(skip)
            .limit(limit);
        
        return {
            items: images,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async getTemplateStats(templateType: string, clientId: string) {
        // Get total images for this template
        const totalTemplateImages = await this.imageModel.countDocuments({ 
            clientId, 
            templateType 
        });
        
        // Get download rate for this template
        const downloadedTemplateImages = await this.imageModel.countDocuments({ 
            clientId, 
            templateType,
            downloadTime: { $exists: true, $ne: null } 
        });
        
        // Get entity distribution for this template
        const entityStats = await this.imageModel.aggregate([
            { $match: { clientId, templateType } },
            { $group: { _id: '$entity', count: { $sum: 1 } } }
        ]);
        
        return {
            total: totalTemplateImages,
            downloadRate: totalTemplateImages ? (downloadedTemplateImages / totalTemplateImages) * 100 : 0,
            byEntity: entityStats
        };
    }

}