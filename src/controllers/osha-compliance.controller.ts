// src/controllers/osha-compliance.controller.ts
import { 
    Controller, 
    Get, 
    Post, 
    Put, 
    Delete, 
    Body, 
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException 
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
  import { OshaComplianceService } from '../services/osha-compliance.service';
  import { BusinessService } from '../services/business.service';
  import { 
    CreateOshaComplianceRequirementDto, 
    UpdateOshaComplianceRequirementDto,
    OshaComplianceRequirementQueryDto 
  } from '../dtos/osha-compliance-requirement.dto';
  import { OshaComplianceRequirement } from '../schemas/osha-compliance-requirement.schema';
  
  @ApiTags('OSHA Compliance')
  @Controller('osha/requirements')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class OshaComplianceController {
    private readonly logger = new Logger(OshaComplianceController.name);
  
    constructor(
      private readonly oshaComplianceService: OshaComplianceService,
      private readonly businessService: BusinessService
    ) {}
  
    @Post()
    @ApiOperation({ summary: 'Create a new OSHA compliance requirement' })
    @ApiBody({ type: CreateOshaComplianceRequirementDto })
    @ApiResponse({ status: 201, description: 'OSHA compliance requirement created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async createRequirement(
      @Body() createDto: CreateOshaComplianceRequirementDto,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<OshaComplianceRequirement> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(createDto.businessId, apiKey);
        
        return await this.oshaComplianceService.create(createDto);
      } catch (error) {
        this.logger.error(`Error creating OSHA compliance requirement: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to create OSHA compliance requirement');
      }
    }
  
    @Get()
    @ApiOperation({ summary: 'Get all OSHA compliance requirements with optional filters' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'constructionSiteId', required: false, description: 'Filter by construction site' })
    @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
    @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
    @ApiQuery({ name: 'assignedTo', required: false, description: 'Filter by assigned employee' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
    @ApiResponse({ status: 200, description: 'OSHA compliance requirements retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getRequirements(
      @Query() queryDto: OshaComplianceRequirementQueryDto,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        // Validate business API key
        if (!queryDto.businessId) {
          throw new UnauthorizedException('Business ID is required');
        }
        await this.validateBusinessApiKey(queryDto.businessId, apiKey);
        
        return await this.oshaComplianceService.findAll(queryDto);
      } catch (error) {
        this.logger.error(`Error fetching OSHA compliance requirements: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch OSHA compliance requirements');
      }
    }
  
    @Get(':id')
    @ApiOperation({ summary: 'Get a single OSHA compliance requirement by ID' })
    @ApiParam({ name: 'id', description: 'OSHA compliance requirement ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'OSHA compliance requirement retrieved successfully' })
    @ApiResponse({ status: 404, description: 'OSHA compliance requirement not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getRequirement(
      @Param('id') id: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<OshaComplianceRequirement> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const requirement = await this.oshaComplianceService.findById(id, businessId);
        if (!requirement) {
          throw new NotFoundException('OSHA compliance requirement not found');
        }
        
        return requirement;
      } catch (error) {
        this.logger.error(`Error fetching OSHA compliance requirement: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch OSHA compliance requirement');
      }
    }
  
    @Put(':id')
    @ApiOperation({ summary: 'Update an OSHA compliance requirement' })
    @ApiParam({ name: 'id', description: 'OSHA compliance requirement ID' })
    @ApiBody({ type: UpdateOshaComplianceRequirementDto })
    @ApiResponse({ status: 200, description: 'OSHA compliance requirement updated successfully' })
    @ApiResponse({ status: 404, description: 'OSHA compliance requirement not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async updateRequirement(
      @Param('id') id: string,
      @Body() updateDto: UpdateOshaComplianceRequirementDto,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<OshaComplianceRequirement> {
      try {
        // Validate business API key
        if (!updateDto.businessId) {
          throw new UnauthorizedException('Business ID is required');
        }
        await this.validateBusinessApiKey(updateDto.businessId, apiKey);
        
        const updatedRequirement = await this.oshaComplianceService.update(id, updateDto);
        if (!updatedRequirement) {
          throw new NotFoundException('OSHA compliance requirement not found');
        }
        
        return updatedRequirement;
      } catch (error) {
        this.logger.error(`Error updating OSHA compliance requirement: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update OSHA compliance requirement');
      }
    }
  
    @Delete(':id')
    @ApiOperation({ summary: 'Delete an OSHA compliance requirement' })
    @ApiParam({ name: 'id', description: 'OSHA compliance requirement ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'OSHA compliance requirement deleted successfully' })
    @ApiResponse({ status: 404, description: 'OSHA compliance requirement not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async deleteRequirement(
      @Param('id') id: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<{ message: string }> {
      try {
        // Validate business API key
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const deleted = await this.oshaComplianceService.delete(id, businessId);
        if (!deleted) {
          throw new NotFoundException('OSHA compliance requirement not found');
        }
        
        return { message: 'OSHA compliance requirement deleted successfully' };
      } catch (error) {
        this.logger.error(`Error deleting OSHA compliance requirement: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to delete OSHA compliance requirement');
      }
    }
  
    private async validateBusinessApiKey(businessId: string, apiKey: string) {
      if (!apiKey) {
        throw new UnauthorizedException('Business API key missing');
      }
      
      const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
      if (!business) {
        throw new UnauthorizedException('Invalid API key for this business');
      }
      
      return business;
    }
  }