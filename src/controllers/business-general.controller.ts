// src/controllers/business-general.controller.ts (Updated with User ID passing)
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
  Put,
  Req
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
  // DEPARTMENT MANAGEMENT ENDPOINTS WITH USER ID
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
    },
    @Req() req: any
  ): Promise<{ success: boolean; departmentId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentData.name) {
        throw new BadRequestException('Department name is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.createDepartment(
        businessId, 
        departmentData,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
    },
    @Req() req: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentId) {
        throw new BadRequestException('Department ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.updateDepartment(
        businessId, 
        departmentId, 
        updateData,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!departmentId) {
        throw new BadRequestException('Department ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.removeDepartment(
        businessId, 
        departmentId,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
  // TEAM MANAGEMENT ENDPOINTS WITH USER ID
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
    },
    @Req() req: any
  ): Promise<{ success: boolean; teamId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamData.name) {
        throw new BadRequestException('Team name is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.createTeam(
        businessId, 
        teamData,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
    },
    @Req() req: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.updateTeam(
        businessId, 
        teamId, 
        updateData,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
    @Headers('business-x-api-key') apiKey: string,
    @Req() req: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      // 🎯 VALIDATE AND GET BUSINESS WITH ADMIN USER ID
      const business = await this.validateBusinessApiKey(businessId, apiKey);
      const adminUserId = business.adminUserId; // Extract admin user ID

      // 🎯 PASS USER ID TO SERVICE
      return await this.businessGeneralService.removeTeam(
        businessId, 
        teamId,
        adminUserId, // Pass admin user ID for activity tracking
        req // Pass request for IP/UserAgent
      );
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
  // SYNC OPERATION ENDPOINTS (NO USER ID NEEDED - READ OPERATIONS)
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
  // OTHER ENDPOINTS (GET operations don't need user ID, but UPDATE operations do)
  // ============================================================================

  @Get('teams/:teamId')
  @ApiOperation({ 
    summary: 'Get a single team with enhanced data and stats',
    description: 'Retrieve comprehensive team information including performance stats and recent activity'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Team retrieved successfully with stats and activity'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async getTeam(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{
    team: any;
    stats: any;
    recentActivity: any[];
  }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getTeam(businessId, teamId);
    } catch (error) {
      this.logger.error(`Error getting team: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve team');
    }
  }

  @Put('teams/:teamId/field-update')
  @ApiOperation({ 
    summary: 'Update field team with enhanced data',
    description: 'Update comprehensive team information including location, vehicle, performance, and operational data'
  })
  @ApiParam({ name: 'teamId', description: 'Team ID (PHP ID or MongoDB ID)' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Field team updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or team not found' })
  async updateFieldTeam(
    @Param('teamId') teamId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() updateData: any
  ): Promise<{
    success: boolean;
    message: string;
    updatedTeam?: any;
    changesApplied?: string[];
    debugInfo: any;
    error?: any;
  }> {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      businessId,
      teamId,
      updateDataKeys: Object.keys(updateData || {}),
      updateDataSize: JSON.stringify(updateData || {}).length
    };

    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!teamId) {
        throw new BadRequestException('Team ID is required');
      }

      if (!updateData || Object.keys(updateData).length === 0) {
        throw new BadRequestException('Update data is required');
      }

      debugInfo['validationPassed'] = true;

      await this.validateBusinessApiKey(businessId, apiKey);
      debugInfo['authPassed'] = true;

      const result = await this.businessGeneralService.updateFieldTeam(businessId, teamId, updateData);
      debugInfo['serviceCallSuccess'] = true;

      return {
        success: result.success,
        message: result.message,
        updatedTeam: result.updatedTeam,
        changesApplied: result.changesApplied,
        debugInfo
      };

    } catch (error) {
      debugInfo['error'] = {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5), // First 5 lines of stack
        type: error.constructor.name
      };

      this.logger.error(`Error updating field team: ${error.message}`, error.stack);
      this.logger.error(`Debug info:`, debugInfo);

      // Return debug info in error response instead of throwing
      return {
        success: false,
        message: 'Failed to update field team',
        debugInfo,
        error: {
          name: error.name,
          message: error.message,
          statusCode: error instanceof BadRequestException ? 400 : 
                     error instanceof UnauthorizedException ? 401 :
                     error instanceof NotFoundException ? 404 : 500
        }
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHOD - UPDATED TO RETURN BUSINESS WITH ADMIN USER ID
  // ============================================================================

  /**
   * Validate business API key and return business with adminUserId
   */
  private async validateBusinessApiKey(businessId: string, apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }

    // Ensure business has adminUserId
    if (!business.adminUserId) {
      this.logger.warn(`Business ${businessId} missing adminUserId - activities will not be tracked`);
    }
    
    return business;
  }

  // ============================================================================
  // REMAINING ENDPOINTS (keeping as-is since they don't require user tracking)
  // Note: Add user ID to any additional CREATE/UPDATE/DELETE operations
  // ============================================================================

  // Department skills endpoints (keeping existing implementation)
  @Put('departments/:departmentId/skills')
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
  // PROJECTS MANAGEMENT ENDPOINTS (GET operations don't need user ID)
  // ============================================================================

  @Get('projects')
  @ApiOperation({ 
    summary: 'Get all projects',
    description: 'Retrieve all projects for the business with pagination and filtering'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by project status' })
  @ApiQuery({ name: 'projectType', required: false, description: 'Filter by project type' })
  @ApiResponse({ 
    status: 200, 
    description: 'Projects retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getProjects(
    @Query('businessId') businessId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('projectType') projectType?: string,
    @Headers('business-x-api-key') apiKey?: string
  ): Promise<{
    projects: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      const options = {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
        status,
        projectType
      };

      return await this.businessGeneralService.getProjects(businessId, options);
    } catch (error) {
      this.logger.error(`Error getting projects: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve projects');
    }
  }

  @Get('projects/:projectId')
  @ApiOperation({ 
    summary: 'Get a single project',
    description: 'Retrieve detailed information for a specific project'
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Project retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or project not found' })
  async getProject(
    @Param('projectId') projectId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ project: any }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!projectId) {
        throw new BadRequestException('Project ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getProject(businessId, projectId);
    } catch (error) {
      this.logger.error(`Error getting project: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve project');
    }
  }

  @Post('projects')
  @ApiOperation({ 
    summary: 'Create a new project',
    description: 'Create a new project for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'Project created successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid project data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createProject(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() projectData: {
      name: string;
      description?: string;
      clientId?: string;
      status?: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; projectId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!projectData.name) {
        throw new BadRequestException('Project name is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.createProject(businessId, projectData);
    } catch (error) {
      this.logger.error(`Error creating project: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create project');
    }
  }

  // ============================================================================
  // CONSTRUCTION SITES MANAGEMENT ENDPOINTS
  // ============================================================================

  @Get('construction-sites')
  @ApiOperation({ 
    summary: 'Get all construction sites',
    description: 'Retrieve all construction sites for the business with pagination and filtering'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by site status' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by site type' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Construction sites retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getConstructionSites(
    @Query('businessId') businessId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('projectId') projectId?: string,
    @Headers('business-x-api-key') apiKey?: string
  ): Promise<{
    sites: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      
      const options = {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
        status,
        type,
        projectId
      };

      return await this.businessGeneralService.getConstructionSites(businessId, options);
    } catch (error) {
      this.logger.error(`Error getting construction sites: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve construction sites');
    }
  }

  @Get('construction-sites/:siteId')
  @ApiOperation({ 
    summary: 'Get a single construction site',
    description: 'Retrieve detailed information for a specific construction site'
  })
  @ApiParam({ name: 'siteId', description: 'Construction Site ID' })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Construction site retrieved successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business or construction site not found' })
  async getConstructionSite(
    @Param('siteId') siteId: string,
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string
  ): Promise<{ site: any }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!siteId) {
        throw new BadRequestException('Construction Site ID is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.getConstructionSite(businessId, siteId);
    } catch (error) {
      this.logger.error(`Error getting construction site: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve construction site');
    }
  }

  @Post('construction-sites')
  @ApiOperation({ 
    summary: 'Create a new construction site',
    description: 'Create a new construction site for the business'
  })
  @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
  @ApiResponse({ 
    status: 201, 
    description: 'Construction site created successfully'
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid site data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createConstructionSite(
    @Query('businessId') businessId: string,
    @Headers('business-x-api-key') apiKey: string,
    @Body() siteData: {
      name: string;
      description?: string;
      appProjectId?: string;
      status?: string;
      type?: string;
      location?: any;
      metadata?: any;
    }
  ): Promise<{ success: boolean; siteId: string; message: string }> {
    try {
      if (!businessId) {
        throw new BadRequestException('Business ID is required');
      }

      if (!siteData.name) {
        throw new BadRequestException('Construction site name is required');
      }

      await this.validateBusinessApiKey(businessId, apiKey);
      return await this.businessGeneralService.createConstructionSite(businessId, siteData);
    } catch (error) {
      this.logger.error(`Error creating construction site: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create construction site');
    }
  }

  // ============================================================================
  // ROUTE PLANNING CONFIGURATION ENDPOINTS
  // ============================================================================

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

  @Get('employees/quality-roles/available')
@ApiOperation({ 
  summary: 'Get employees without quality roles',
  description: 'Retrieve employees who don\'t have quality roles assigned, formatted for dropdown population'
})
@ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
@ApiResponse({ 
  status: 200, 
  description: 'Employees without quality roles retrieved successfully'
})
@ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
@ApiResponse({ status: 404, description: 'Business not found' })
async getEmployeesWithoutQualityRoles(
  @Query('businessId') businessId: string,
  @Headers('business-x-api-key') apiKey: string
): Promise<{
  employees: Array<{
    id: string;
    name: string;
    email: string;
    currentRole?: string;
    department?: string;
  }>;
  total: number;
}> {
  try {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }

    await this.validateBusinessApiKey(businessId, apiKey);
    return await this.businessGeneralService.getEmployeesWithoutQualityRoles(businessId);
  } catch (error) {
    this.logger.error(`Error getting employees without quality roles: ${error.message}`, error.stack);
    if (error instanceof UnauthorizedException || error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerErrorException('Failed to retrieve employees without quality roles');
  }
}
}