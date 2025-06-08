// src/controllers/business-quality-inspection.controller.ts
import { 
    Controller, 
    Get, 
    Put, 
    Post, 
    Delete,
    Body, 
    Query,
    Param,
    UseGuards,
    Request,
    Logger,
    BadRequestException,
    InternalServerErrorException
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiQuery, 
    ApiBody, 
    ApiResponse,
    ApiParam
  } from '@nestjs/swagger';
  import { BusinessAuthGuard } from '../guards/business-auth.guard';
  import { QualityInspectionService } from '../services/quality-inspection.service';
  import { QualityInspectionConfiguration } from '../schemas/business.schema';
  
  // DTOs for request/response
  class UpdateQualityConfigDto {
    canInspect: string[];
    canReview: string[];
    finalApprover: string;
    allowSelfReview: boolean;
    requireClientSignoff: boolean;
    requirePhotos: boolean;
    requireSignature: boolean;
    useDetailedInspections: boolean;
  }
  
  class AssignQualityRoleDto {
    userId: string;
    role: string;
  }
  
  @ApiTags('Business Quality Inspection - Admin')
  @Controller('business/quality-inspections')
  @UseGuards(BusinessAuthGuard)
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessQualityInspectionController {
    private readonly logger = new Logger(BusinessQualityInspectionController.name);
  
    constructor(
      private readonly qualityInspectionService: QualityInspectionService
    ) {}
  
    @Put('config')
    @ApiOperation({ summary: 'Update quality inspection configuration' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({ type: UpdateQualityConfigDto })
    @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid configuration' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async updateQualityInspectionConfig(
      @Query('businessId') businessId: string,
      @Body() config: UpdateQualityConfigDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Updating quality inspection config for business: ${businessId}`);
  
        const result = await this.qualityInspectionService.updateQualityInspectionConfig(
          businessId, 
          config as QualityInspectionConfiguration
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            config: result.config
          }
        };
      } catch (error) {
        this.logger.error(`Error updating quality inspection config: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update quality inspection configuration');
      }
    }
  
    @Get('config')
    @ApiOperation({ summary: 'Get quality inspection configuration' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getQualityInspectionConfig(
      @Query('businessId') businessId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting quality inspection config for business: ${businessId}`);
  
        const config = await this.qualityInspectionService.getQualityInspectionConfig(businessId);
  
        return {
          status: 'success',
          message: 'Quality inspection configuration retrieved successfully',
          data: {
            config
          }
        };
      } catch (error) {
        this.logger.error(`Error getting quality inspection config: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get quality inspection configuration');
      }
    }
  
    @Post('team/assign')
    @ApiOperation({ summary: 'Assign quality role to user' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiBody({ type: AssignQualityRoleDto })
    @ApiResponse({ status: 200, description: 'Role assigned successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid role or user' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async assignQualityRole(
      @Query('businessId') businessId: string,
      @Body() assignData: AssignQualityRoleDto,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!assignData.userId || !assignData.role) {
          throw new BadRequestException('User ID and role are required');
        }
  
        this.logger.log(`Assigning quality role ${assignData.role} to user ${assignData.userId} in business: ${businessId}`);
  
        const result = await this.qualityInspectionService.assignQualityRole(
          businessId,
          assignData.userId,
          assignData.role
        );
  
        return {
          status: 'success',
          message: result.message,
          data: {
            qualityTeam: result.qualityTeam
          }
        };
      } catch (error) {
        this.logger.error(`Error assigning quality role: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to assign quality role');
      }
    }
  
    @Delete('team/:userId')
    @ApiOperation({ summary: 'Remove quality role from user' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiParam({ name: 'userId', description: 'User ID to remove from quality team' })
    @ApiResponse({ status: 200, description: 'Role removed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or user not found' })
    async removeQualityRole(
      @Query('businessId') businessId: string,
      @Param('userId') userId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!userId) {
          throw new BadRequestException('User ID is required');
        }
  
        this.logger.log(`Removing quality role from user ${userId} in business: ${businessId}`);
  
        const result = await this.qualityInspectionService.removeQualityRole(businessId, userId);
  
        return {
          status: 'success',
          message: result.message,
          data: {
            qualityTeam: result.qualityTeam
          }
        };
      } catch (error) {
        this.logger.error(`Error removing quality role: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to remove quality role');
      }
    }
  
    @Get('team')
    @ApiOperation({ summary: 'Get quality team members' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Quality team retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    async getQualityTeam(
      @Query('businessId') businessId: string,
      @Request() req: any
    ) {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        this.logger.log(`Getting quality team for business: ${businessId}`);
  
        const qualityTeam = await this.qualityInspectionService.getQualityTeam(businessId);
  
        return {
          status: 'success',
          message: 'Quality team retrieved successfully',
          data: {
            qualityTeam,
            totalMembers: qualityTeam.length
          }
        };
      } catch (error) {
        this.logger.error(`Error getting quality team: ${error.message}`, error.stack);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get quality team');
      }
    }
  }