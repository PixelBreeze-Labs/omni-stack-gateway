// src/controllers/business-general.controller.ts
import { 
    Controller, 
    Get, 
    Param, 
    Query, 
    Headers, 
    UnauthorizedException, 
    NotFoundException, 
    Logger, 
    InternalServerErrorException,
    BadRequestException,
    Post,
    Delete,
    Body,
    Put
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiHeader, 
    ApiParam, 
    ApiResponse, 
    ApiQuery 
  } from '@nestjs/swagger';
  import { BusinessGeneralService } from '../services/business-general.service';
  import { BusinessService } from '../services/business.service';
  import {
    SimpleStaffProfileResponse,
    FullStaffProfileResponse,
  } from '../dtos/business-general.dto';
  
  @ApiTags('Business General Management')
  @Controller('business/general')
  @ApiHeader({ 
    name: 'business-x-api-key', 
    required: true, 
    description: 'Business API key for authentication' 
  })
  export class BusinessGeneralController {
    private readonly logger = new Logger(BusinessGeneralController.name);
  
    constructor(
      private readonly businessGeneralService: BusinessGeneralService,
      private readonly businessService: BusinessService
    ) {}
  
  
    // ============================================================================
    // INDIVIDUAL STAFF PROFILE ENDPOINTS
    // ============================================================================
  
    @Get(':staffId/profile/simple')
    @ApiOperation({ 
      summary: 'Get simple staff profile',
      description: 'Retrieve basic staff profile information including contact details, role, and basic performance metrics'
    })
    @ApiParam({ name: 'staffId', description: 'Staff Profile ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Simple staff profile retrieved successfully',
      type: SimpleStaffProfileResponse
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Staff profile not found' })
    async getSimpleStaffProfile(
      @Param('staffId') staffId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<SimpleStaffProfileResponse> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!staffId) {
          throw new BadRequestException('Staff ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessGeneralService.getSimpleStaffProfile(staffId, businessId);
      } catch (error) {
        this.logger.error(`Error getting simple staff profile: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve staff profile');
      }
    }
  
    @Get(':staffId/profile/full')
    @ApiOperation({ 
      summary: 'Get full staff profile',
      description: 'Retrieve comprehensive staff profile including skills, work experience, performance history, goals, and all detailed information'
    })
    @ApiParam({ name: 'staffId', description: 'Staff Profile ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ 
      status: 200, 
      description: 'Full staff profile retrieved successfully',
      type: FullStaffProfileResponse
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Staff profile not found' })
    async getFullStaffProfile(
      @Param('staffId') staffId: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<FullStaffProfileResponse> {
      try {
        if (!businessId) {
          throw new BadRequestException('Business ID is required');
        }
  
        if (!staffId) {
          throw new BadRequestException('Staff ID is required');
        }
  
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessGeneralService.getFullStaffProfile(staffId, businessId);
      } catch (error) {
        this.logger.error(`Error getting full staff profile: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to retrieve full staff profile');
      }
    }
  
    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================
  
    /**
     * Validate business API key (reused from business-skills controller)
     */
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


  // ============================================================================
  // DEPARTMENT MANAGEMENT ENDPOINTS
  // ============================================================================

  @Post('departments')
  @ApiOperation({ 
    summary: 'Create a new department',
    description: 'Create a new department for the business with skill requirements'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'Department created successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data or department already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createDepartment(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() departmentData: {
      name: string;
      requiredSkills?: string[];
      optionalSkills?: string[];
      skillWeights?: Record<string, number>;
    }
  ): Promise<{ success: boolean; departmentId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentData.name) {
        throw new BadRequestException('Department name is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.createDepartment(businessId, departmentData);
    } catch (error) {
      this.logger.error(`Error creating department: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create department');
    }
  }

  @Put('departments/:departmentId')
  @ApiOperation({ 
    summary: 'Update an existing department',
    description: 'Update department information including skills and requirements'
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Department updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or department not found' })
  async updateDepartment(
    @Param('departmentId') departmentId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() updateData: {
      name?: string;
      requiredSkills?: string[];
      optionalSkills?: string[];
      skillWeights?: Record<string, number>;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentId) {
        throw new BadRequestException('Department ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.updateDepartment(businessId, departmentId, updateData);
    } catch (error) {
      this.logger.error(`Error updating department: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update department');
    }
  }

  @Delete('departments/:departmentId')
  @ApiOperation({ 
    summary: 'Remove a department',
    description: 'Remove a department from the business'
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Department removed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or department not found' })
  async removeDepartment(
    @Param('departmentId') departmentId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentId) {
        throw new BadRequestException('Department ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.removeDepartment(businessId, departmentId);
    } catch (error) {
      this.logger.error(`Error removing department: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to remove department');
    }
  }

  // ============================================================================
  // SYNC OPERATION ENDPOINTS
  // ============================================================================

  @Post('sync/employees')
  @ApiOperation({ 
    summary: 'Sync employees from VenueBoost',
    description: 'Trigger manual synchronization of employees from VenueBoost system'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Employee sync completed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async syncEmployees(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    externalIdUpdates?: number;
    externalIdFailures?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.syncEmployeesFromVenueBoost(businessId);
    } catch (error) {
      this.logger.error(`Error syncing employees: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to sync employees');
    }
  }

  @Post('sync/tasks')
  @ApiOperation({ 
    summary: 'Sync tasks from VenueBoost',
    description: 'Trigger manual synchronization of tasks from VenueBoost system'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Task sync completed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async syncTasks(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{
    success: boolean;
    message: string;
    syncedCount?: number;
    logs: string[];
    summary?: any;
  }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }
  
      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.syncTasksFromVenueBoost(businessId);
    } catch (error) {
      this.logger.error(`Error syncing tasks: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to sync tasks');
    }
  }

}