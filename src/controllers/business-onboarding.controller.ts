// src/controllers/business-onboarding.controller.ts
import { 
    Controller, 
    Get, 
    Post, 
    Put, 
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
  import { BusinessOnboardingService } from '../services/business-onboarding.service';
  import { BusinessService } from '../services/business.service';
  import { 
    CreateBusinessOnboardingDto, 
    UpdateBusinessOnboardingDto,
    BusinessOnboardingResponse 
  } from '../dtos/business-onboarding.dto';
  import { BusinessOnboarding, OnboardingType } from '../schemas/business-onboarding.schema';
import { NotificationPreferencesResponse, UpdateNotificationPreferencesDto } from 'src/dtos/user-notification-preferences.dto';
  
  @ApiTags('Business Onboarding')
  @Controller('business/onboarding')
  @ApiHeader({ name: 'business-x-api-key', required: true, description: 'Business API key for authentication' })
  export class BusinessOnboardingController {
    private readonly logger = new Logger(BusinessOnboardingController.name);
  
    constructor(
      private readonly businessOnboardingService: BusinessOnboardingService,
      private readonly businessService: BusinessService
    ) {}
  
    @Post()
    @ApiOperation({ summary: 'Initialize business onboarding' })
    @ApiBody({ type: CreateBusinessOnboardingDto })
    @ApiResponse({ status: 201, description: 'Business onboarding initialized successfully' })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async initializeOnboarding(
      @Body() createDto: CreateBusinessOnboardingDto,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<BusinessOnboarding> {
      try {
        await this.validateBusinessApiKey(createDto.businessId, apiKey);
        return await this.businessOnboardingService.initialize(createDto);
      } catch (error) {
        this.logger.error(`Error initializing onboarding: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to initialize onboarding');
      }
    }
  
    @Get()
    @ApiOperation({ summary: 'Get business onboarding progress' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiQuery({ name: 'type', required: false, description: 'Onboarding type (walkthrough or setup_guide)' })
    @ApiResponse({ status: 200, description: 'Onboarding progress retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getOnboardingProgress(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string,
      @Query('type') type?: OnboardingType
    ) {
      try {
        if (!businessId) {
          throw new UnauthorizedException('Business ID is required');
        }
        await this.validateBusinessApiKey(businessId, apiKey);
        
        return await this.businessOnboardingService.getProgress(businessId, type);
      } catch (error) {
        this.logger.error(`Error fetching onboarding progress: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch onboarding progress');
      }
    }
  
    @Get('analytics')
    @ApiOperation({ summary: 'Get onboarding completion analytics' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getAnalytics(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ) {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessOnboardingService.getAnalytics(businessId);
      } catch (error) {
        this.logger.error(`Error fetching onboarding analytics: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch onboarding analytics');
      }
    }
  
    @Put(':id')
    @ApiOperation({ summary: 'Update onboarding progress' })
    @ApiParam({ name: 'id', description: 'Onboarding record ID' })
    @ApiBody({ type: UpdateBusinessOnboardingDto })
    @ApiResponse({ status: 200, description: 'Onboarding updated successfully' })
    @ApiResponse({ status: 404, description: 'Onboarding record not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async updateOnboarding(
      @Param('id') id: string,
      @Body() updateDto: UpdateBusinessOnboardingDto,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<BusinessOnboarding> {
      try {
        // Get existing record to validate business ID
        const existing = await this.businessOnboardingService.findById(id);
        if (!existing) {
          throw new NotFoundException('Onboarding record not found');
        }
  
        await this.validateBusinessApiKey(existing.businessId, apiKey);
        
        const updated = await this.businessOnboardingService.update(id, updateDto);
        if (!updated) {
          throw new NotFoundException('Onboarding record not found');
        }
        
        return updated;
      } catch (error) {
        this.logger.error(`Error updating onboarding: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update onboarding');
      }
    }
  
    @Get(':id')
    @ApiOperation({ summary: 'Get single onboarding record by ID' })
    @ApiParam({ name: 'id', description: 'Onboarding record ID' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Onboarding record retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Onboarding record not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    async getOnboarding(
      @Param('id') id: string,
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<BusinessOnboarding> {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
        
        const onboarding = await this.businessOnboardingService.findByIdAndBusiness(id, businessId);
        if (!onboarding) {
          throw new NotFoundException('Onboarding record not found');
        }
        
        return onboarding;
      } catch (error) {
        this.logger.error(`Error fetching onboarding record: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to fetch onboarding record');
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

    @Put('notification-preferences')
    @ApiOperation({ summary: 'Update admin user notification preferences' })
    @ApiBody({ type: UpdateNotificationPreferencesDto })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Notification preferences updated successfully', type: NotificationPreferencesResponse })
    @ApiResponse({ status: 400, description: 'Bad request - Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or admin user not found' })
    async updateNotificationPreferences(
      @Query('businessId') businessId: string,
      @Body() updateDto: UpdateNotificationPreferencesDto,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<NotificationPreferencesResponse> {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessOnboardingService.updateNotificationPreferences(businessId, updateDto);
      } catch (error) {
        this.logger.error(`Error updating notification preferences: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to update notification preferences');
      }
    }
    
    @Get('notification-preferences')
    @ApiOperation({ summary: 'Get admin user notification preferences' })
    @ApiQuery({ name: 'businessId', required: true, description: 'Business ID' })
    @ApiResponse({ status: 200, description: 'Notification preferences retrieved successfully', type: NotificationPreferencesResponse })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
    @ApiResponse({ status: 404, description: 'Business or admin user not found' })
    async getNotificationPreferences(
      @Query('businessId') businessId: string,
      @Headers('business-x-api-key') apiKey: string
    ): Promise<NotificationPreferencesResponse> {
      try {
        await this.validateBusinessApiKey(businessId, apiKey);
        return await this.businessOnboardingService.getNotificationPreferences(businessId);
      } catch (error) {
        this.logger.error(`Error getting notification preferences: ${error.message}`, error.stack);
        if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to get notification preferences');
      }
    }
  }