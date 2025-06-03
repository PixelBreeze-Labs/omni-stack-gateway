// src/controllers/business-general.controller.ts (Updated with Team Endpoints)
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
import { RoutePlanningConfiguration } from '../schemas/business.schema';

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
      metadata?: any;
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
      metadata?: any;
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

  @Get('departments')
  @ApiOperation({ 
    summary: 'Get all departments',
    description: 'Retrieve all departments for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Departments retrieved successfully'
  })
  async getDepartments(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ departments: any[] }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getDepartments(businessId);
    } catch (error) {
      this.logger.error(`Error getting departments: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve departments');
    }
  }

  // ============================================================================
  // TEAM MANAGEMENT ENDPOINTS (NEW)
  // ============================================================================

  @Post('teams')
  @ApiOperation({ 
    summary: 'Create a new team',
    description: 'Create a new team for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'Team created successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data or team already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createTeam(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() teamData: {
      name: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; teamId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamData.name) {
        throw new BadRequestException('Team name is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.createTeam(businessId, teamData);
    } catch (error) {
      this.logger.error(`Error creating team: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create team');
    }
  }

  @Put('teams/:teamId')
  @ApiOperation({ 
    summary: 'Update an existing team',
    description: 'Update team information'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Team updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async updateTeam(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() updateData: {
      name?: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.updateTeam(businessId, teamId, updateData);
    } catch (error) {
      this.logger.error(`Error updating team: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update team');
    }
  }
  
  @Delete('teams/:teamId')
  @ApiOperation({ 
    summary: 'Remove a team',
    description: 'Remove a team from the business'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Team removed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async removeTeam(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.removeTeam(businessId, teamId);
    } catch (error) {
      this.logger.error(`Error removing team: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to remove team');
    }
  }

  @Get('teams')
  @ApiOperation({ 
    summary: 'Get all teams',
    description: 'Retrieve all teams for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Teams retrieved successfully'
  })
  async getTeams(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ teams: any[] }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getTeams(businessId);
    } catch (error) {
      this.logger.error(`Error getting teams: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve teams');
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

  // ============================================================================
  // DEPARTMENT SKILLS ENDPOINTS (Existing - keeping as is)
  // ============================================================================

  @Put('departments/:departmentId/skills')
  @ApiOperation({ 
    summary: 'Update department skill requirements',
    description: 'Update skill requirements for a specific department'
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Department skills updated successfully'
  })
  async updateDepartmentSkills(
    @Param('departmentId') departmentId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() skillsData: {
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
      return await this.businessGeneralService.updateDepartmentSkills(businessId, departmentId, skillsData);
    } catch (error) {
      this.logger.error(`Error updating department skills: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update department skills');
    }
  }

  @Get('departments/:departmentId/skills')
  @ApiOperation({ 
    summary: 'Get department skill requirements',
    description: 'Get skill requirements for a specific department'
  })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Department skills retrieved successfully'
  })
  async getDepartmentSkills(
    @Param('departmentId') departmentId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<any> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentId) {
        throw new BadRequestException('Department ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getDepartmentSkills(businessId, departmentId);
    } catch (error) {
      this.logger.error(`Error getting department skills: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get department skills');
    }
  }

  @Post('departments/sync-skills')
  @ApiOperation({ 
    summary: 'Sync department skills with business requirements',
    description: 'Sync all department skill requirements with business-level skill configuration'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Department skills synced successfully'
  })
  async syncDepartmentSkills(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ success: boolean; message: string; syncedDepartments: number }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.syncDepartmentSkills(businessId);
    } catch (error) {
      this.logger.error(`Error syncing department skills: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to sync department skills');
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

  @Get('route-planning/config')
@ApiOperation({ 
  summary: 'Get route planning configuration',
  description: 'Retrieve current route planning configuration for the business'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Route planning configuration retrieved successfully'
})
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async getRoutePlanningConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string
): Promise<{ config: RoutePlanningConfiguration | null }> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    const business = await this.validateBusinessApiKey(businessId, apiKey);
    return { config: business.routePlanningConfig || null };
  } catch (error) {
    this.logger.error(`Error getting route planning config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to retrieve route planning configuration');
  }
}

@Put('route-planning/config')
@ApiOperation({ 
  summary: 'Update route planning configuration',
  description: 'Update route planning configuration for the business'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Route planning configuration updated successfully'
})
@ApiResponse({ status: 400, description: 'Bad request - Invalid configuration data' })
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async updateRoutePlanningConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string,
  @Body() configData: Partial<RoutePlanningConfiguration>
): Promise<{ success: boolean; message: string }> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    if (!configData || Object.keys(configData).length === 0) {
      throw new BadRequestException('Configuration data is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.updateRoutePlanningConfig(businessId, configData);
  } catch (error) {
    this.logger.error(`Error updating route planning config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to update route planning configuration');
  }
}

@Post('route-planning/config/reset')
@ApiOperation({ 
  summary: 'Reset route planning configuration to defaults',
  description: 'Reset route planning configuration to default values'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Route planning configuration reset successfully'
})
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async resetRoutePlanningConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string
): Promise<{ success: boolean; message: string; config: RoutePlanningConfiguration }> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.resetRoutePlanningConfig(businessId);
  } catch (error) {
    this.logger.error(`Error resetting route planning config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to reset route planning configuration');
  }
}

@Put('route-planning/config/integrations/google-maps')
@ApiOperation({ 
  summary: 'Update Google Maps integration settings',
  description: 'Update Google Maps API integration configuration'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Google Maps integration updated successfully'
})
@ApiResponse({ status: 400, description: 'Bad request - Invalid Google Maps configuration' })
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async updateGoogleMapsConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string,
  @Body() googleMapsConfig: {
    apiKey?: string;
    enabled: boolean;
    geocodingEnabled?: boolean;
    directionsEnabled?: boolean;
    trafficEnabled?: boolean;
  }
): Promise<{ success: boolean; message: string; isValid?: boolean; errors?: string[] }> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    if (googleMapsConfig.enabled === undefined) {
      throw new BadRequestException('Enabled status is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.updateGoogleMapsConfig(businessId, googleMapsConfig);
  } catch (error) {
    this.logger.error(`Error updating Google Maps config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to update Google Maps configuration');
  }
}

@Put('route-planning/config/integrations/weather')
@ApiOperation({ 
  summary: 'Update weather integration settings',
  description: 'Update weather API integration configuration'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Weather integration updated successfully'
})
@ApiResponse({ status: 400, description: 'Bad request - Invalid weather configuration' })
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async updateWeatherConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string,
  @Body() weatherConfig: {
    enabled: boolean;
    considerInRouting?: boolean;
    delayThresholds?: {
      rain?: number;
      snow?: number;
      wind?: number;
      temperature?: { min: number; max: number };
    };
  }
): Promise<{ success: boolean; message: string }> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    if (weatherConfig.enabled === undefined) {
      throw new BadRequestException('Enabled status is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.updateWeatherConfig(businessId, weatherConfig);
  } catch (error) {
    this.logger.error(`Error updating weather config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to update weather configuration');
  }
}

@Post('route-planning/config/validate')
@ApiOperation({ 
  summary: 'Validate route planning configuration',
  description: 'Validate current route planning configuration and integrations'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Configuration validation completed'
})
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async validateRoutePlanningConfig(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  integrationStatus: {
    googleMaps: { enabled: boolean; valid: boolean; errors?: string[] };
    weather: { enabled: boolean; valid: boolean; errors?: string[] };
  };
}> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.validateRoutePlanningConfig(businessId);
  } catch (error) {
    this.logger.error(`Error validating route planning config: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to validate route planning configuration');
  }
}
}