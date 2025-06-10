// src/controllers/business-storage.controller.ts (Updated with Admin User ID for specific functions)
import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Param, 
  Headers, 
  UnauthorizedException, 
  NotFoundException, 
  Logger, 
  InternalServerErrorException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
  Req
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiHeader, 
  ApiParam, 
  ApiBody, 
  ApiResponse, 
  ApiConsumes,
  ApiQuery 
} from '@nestjs/swagger';
import { BusinessStorageService, UploadResult, DeleteResult } from '../services/business-storage.service';
import { BusinessFileInfo, StorageUsage } from '../services/supabase.service';
import { Business, SubscriptionStatus, AgentFeatureFlag } from '../schemas/business.schema';
import { STAFFLUENT_FEATURES, TIER_FEATURES } from '../constants/features.constants';

@ApiTags('Business Storage')
@Controller('business-storage')
@ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
export class BusinessStorageController {
  private readonly logger = new Logger(BusinessStorageController.name);

  constructor(
    private readonly businessStorageService: BusinessStorageService,
    @InjectModel(Business.name) private businessModel: Model<Business>
  ) {}

  @Post(':businessId/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image file for business storage' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiBody({
    description: 'Image file and category',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload'
        },
        category: {
          type: 'string',
          enum: ['sites', 'general', 'compliance', 'management', 'business', 'legal', 'hr', 'other'],
          description: 'File category',
          default: 'misc'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid file or exceeded limits' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  @ApiResponse({ status: 413, description: 'File too large or storage limit exceeded' })
  async uploadFile(
    @Param('businessId') businessId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string = 'other',
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<UploadResult> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier. Please upgrade your plan.'
        );
      }

      // Validate file upload
      if (!file) {
        throw new BadRequestException('No file provided');
      }

      // 🎯 PASS ADMIN USER ID TO SERVICE
      const result = await this.businessStorageService.uploadImage(
        businessId,
        file.buffer,
        file.originalname,
        category,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );

      this.logger.log(`File uploaded successfully for business ${businessId}: ${file.originalname}`);
      return result;

    } catch (error) {
      this.logger.error(`Error uploading file for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to upload file');
      }
    }
  }

  @Get(':businessId/files')
  @ApiOperation({ summary: 'List all files for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ 
    name: 'category', 
    required: false, 
    enum: ['sites', 'general', 'compliance', 'management', 'business', 'legal', 'hr', 'other'],
    description: 'Filter by file category' 
  })
  @ApiResponse({ status: 200, description: 'Returns list of business files' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  async listFiles(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Query('category') category?: string,
  ): Promise<BusinessFileInfo[]> {
    try {
      // Validate business and API key
      const business = await this.validateBusinessApiKey(businessId, apiKey);

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier'
        );
      }

      // ✅ NO USER ID NEEDED - READ operation
      const files = await this.businessStorageService.listFiles(businessId, category);
      this.logger.log(`Listed ${files.length} files for business ${businessId}`);
      return files;

    } catch (error) {
      this.logger.error(`Error listing files for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to list files');
      }
    }
  }

  @Delete(':businessId/files/:fileName')
  @ApiOperation({ summary: 'Delete a specific file' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'fileName', description: 'Name of file to delete' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(
    @Param('businessId') businessId: string,
    @Param('fileName') fileName: string,
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<DeleteResult> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier'
        );
      }

      // 🎯 PASS ADMIN USER ID TO SERVICE
      const result = await this.businessStorageService.deleteFile(
        businessId, 
        fileName,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
      this.logger.log(`File deleted successfully for business ${businessId}: ${fileName}`);
      return result;

    } catch (error) {
      this.logger.error(`Error deleting file for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to delete file');
      }
    }
  }

  @Delete(':businessId/files')
  @ApiOperation({ summary: 'Bulk delete multiple files' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiBody({
    description: 'Array of file names to delete',
    schema: {
      type: 'object',
      properties: {
        fileNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file names to delete'
        }
      },
      required: ['fileNames']
    }
  })
  @ApiResponse({ status: 200, description: 'Bulk delete completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  async bulkDeleteFiles(
    @Param('businessId') businessId: string,
    @Body() body: { fileNames: string[] },
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<{ successful: string[], failed: string[], message: string }> {
    try {
      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier'
        );
      }

      if (!body.fileNames || !Array.isArray(body.fileNames) || body.fileNames.length === 0) {
        throw new BadRequestException('fileNames array is required and must not be empty');
      }

      // 🎯 PASS ADMIN USER ID TO SERVICE
      const result = await this.businessStorageService.bulkDeleteFiles(
        businessId, 
        body.fileNames,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
      this.logger.log(`Bulk delete completed for business ${businessId}: ${result.message}`);
      return result;

    } catch (error) {
      this.logger.error(`Error bulk deleting files for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to bulk delete files');
      }
    }
  }

  @Get(':businessId/storage/usage')
  @ApiOperation({ summary: 'Get storage usage information for business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Returns storage usage information' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  async getStorageUsage(
    @Param('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<StorageUsage> {
    try {
      // Validate business and API key
      const business = await this.validateBusinessApiKey(businessId, apiKey);

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier'
        );
      }

      // ✅ NO USER ID NEEDED - READ operation
      const usage = await this.businessStorageService.getStorageUsage(businessId);
      this.logger.log(`Retrieved storage usage for business ${businessId}: ${usage.totalSizeMB}MB / ${usage.limitMB}MB`);
      return usage;

    } catch (error) {
      this.logger.error(`Error getting storage usage for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get storage usage');
      }
    }
  }

  @Get(':businessId/files/:fileName/info')
  @ApiOperation({ summary: 'Get information about a specific file' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiParam({ name: 'fileName', description: 'Name of file to get info for' })
  @ApiResponse({ status: 200, description: 'Returns file information' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 403, description: 'Feature not available for current subscription tier' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileInfo(
    @Param('businessId') businessId: string,
    @Param('fileName') fileName: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<BusinessFileInfo> {
    try {
      // Validate business and API key
      const business = await this.validateBusinessApiKey(businessId, apiKey);

      // Check if business has document storage feature
      const hasFeature = this.checkFeatureInSubscription(business, STAFFLUENT_FEATURES.DOCUMENT_STORAGE);

      if (!hasFeature) {
        throw new BadRequestException(
          'Document storage feature is not available for your current subscription tier'
        );
      }

      // ✅ NO USER ID NEEDED - READ operation
      const fileInfo = await this.businessStorageService.getFileInfo(businessId, fileName);
      this.logger.log(`Retrieved file info for business ${businessId}: ${fileName}`);
      return fileInfo;

    } catch (error) {
      this.logger.error(`Error getting file info for business ${businessId}: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || 
          error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed to get file info');
      }
    }
  }

  /**
   * Validate business API key and return business document WITH ADMIN USER ID
   */
  private async validateBusinessApiKey(businessId: string, apiKey: string): Promise<Business> {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessModel.findOne({
      _id: businessId,
      apiKey: apiKey,
      isActive: true,
      isDeleted: false
    });
    
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }

    // Ensure business has adminUserId
    if (!business.adminUserId) {
      this.logger.warn(`Business ${businessId} missing adminUserId - activities will not be tracked`);
    }
    
    return business;
  }

  /**
   * Check if a feature is included in the business subscription
   */
  private checkFeatureInSubscription(business: Business, feature: string): boolean {
    // First check if the business is on a trial - trials get all features
    if (business.subscriptionStatus === SubscriptionStatus.TRIALING) {
      // Check against the TIER_FEATURES['trialing'] list
      return TIER_FEATURES['trialing'].includes(feature);
    }
    
    // Then check the explicit includedFeatures array
    if (business.includedFeatures && business.includedFeatures.length > 0) {
      return business.includedFeatures.includes(feature as AgentFeatureFlag);
    }
    
    // If no explicit features and not trialing, check against tier features
    if (business.subscriptionDetails?.planId) {
      const tier = this.getSubscriptionTier(business);
      if (tier) {
        return TIER_FEATURES[tier].includes(feature);
      }
    }
    
    return false;
  }

  /**
   * Get subscription tier from business subscription details
   */
  private getSubscriptionTier(business: Business): string | null {
    if (!business.subscriptionDetails?.planId) {
      return 'basic'; // Default to basic if no plan
    }

    const planId = business.subscriptionDetails.planId.toLowerCase();
    
    if (planId.includes('enterprise')) {
      return 'enterprise';
    } else if (planId.includes('professional') || planId.includes('pro')) {
      return 'professional';
    } else {
      return 'basic';
    }
  }
}