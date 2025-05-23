// src/services/business-onboarding.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  BusinessOnboarding, 
  OnboardingType,
  OnboardingStatus,
  SetupStep
} from '../schemas/business-onboarding.schema';
import { 
  CreateBusinessOnboardingDto, 
  UpdateBusinessOnboardingDto,
  BusinessOnboardingResponse,
  OnboardingState
} from '../dtos/business-onboarding.dto';

@Injectable()
export class BusinessOnboardingService {
  private readonly logger = new Logger(BusinessOnboardingService.name);

  constructor(
    @InjectModel(BusinessOnboarding.name) 
    private businessOnboardingModel: Model<BusinessOnboarding>
  ) {}

  async initialize(createDto: CreateBusinessOnboardingDto): Promise<BusinessOnboarding> {
    try {
      // Check if onboarding already exists for this business and type
      const existing = await this.businessOnboardingModel
        .findOne({ 
          businessId: createDto.businessId, 
          type: createDto.type,
          isDeleted: false 
        })
        .exec();

      if (existing) {
        // Update existing record instead of creating new one
        const updateData = {
          completionCount: existing.completionCount + 1,
          lastActiveAt: new Date(),
          deviceType: createDto.deviceType,
          userAgent: createDto.userAgent,
          isPWA: createDto.isPWA
        };

        // Only reset if they want to start fresh
        if (createDto.isFirstTime) {
          updateData['currentStep'] = 0;
          updateData['status'] = OnboardingStatus.IN_PROGRESS;
          updateData['startedAt'] = new Date();
          updateData['completedSteps'] = [];
          updateData['progressPercentage'] = 0;
        }

        return await this.businessOnboardingModel
          .findByIdAndUpdate(existing._id, updateData, { new: true })
          .exec();
      }

      // Create new onboarding record
      const onboarding = new this.businessOnboardingModel({
        ...createDto,
        status: OnboardingStatus.NOT_STARTED,
        completionCount: 1,
        isFirstTime: true,
        startedAt: new Date(),
        lastActiveAt: new Date()
      });

      return await onboarding.save();
    } catch (error) {
      this.logger.error(`Error initializing onboarding: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getProgress(businessId: string, type?: OnboardingType): Promise<OnboardingState | BusinessOnboarding> {
    try {
      const query: any = { 
        businessId,
        isDeleted: false 
      };
      
      if (type) {
        query.type = type;
        const record = await this.businessOnboardingModel.findOne(query).exec();
        return record;
      }

      // Return both walkthrough and setup guide progress
      const records = await this.businessOnboardingModel.find(query).exec();
      
      const walkthrough = records.find(r => r.type === OnboardingType.WALKTHROUGH);
      const setupGuide = records.find(r => r.type === OnboardingType.SETUP_GUIDE);

      const state: OnboardingState = {
        walkthrough: {
          isActive: walkthrough?.status === OnboardingStatus.IN_PROGRESS || false,
          currentStep: walkthrough?.currentStep || 0,
          isComplete: walkthrough?.status === OnboardingStatus.COMPLETED || false,
          completionCount: walkthrough?.completionCount || 0
        },
        setupGuide: {
          isActive: setupGuide?.status === OnboardingStatus.IN_PROGRESS || false,
          currentStep: setupGuide?.currentStep || 0,
          isComplete: setupGuide?.status === OnboardingStatus.COMPLETED || false,
          completedSteps: setupGuide?.completedSteps || [],
          progressPercentage: setupGuide?.progressPercentage || 0
        }
      };

      return state;
    } catch (error) {
      this.logger.error(`Error getting onboarding progress: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateBusinessOnboardingDto): Promise<BusinessOnboarding> {
    try {
      const updateData = {
        ...updateDto,
        lastActiveAt: new Date()
      };

      const updated = await this.businessOnboardingModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();

      if (!updated) {
        throw new NotFoundException('Onboarding record not found');
      }

      return updated;
    } catch (error) {
      this.logger.error(`Error updating onboarding: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<BusinessOnboarding> {
    try {
      const onboarding = await this.businessOnboardingModel
        .findOne({ _id: id, isDeleted: false })
        .exec();

      if (!onboarding) {
        throw new NotFoundException('Onboarding record not found');
      }

      return onboarding;
    } catch (error) {
      this.logger.error(`Error finding onboarding by ID: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByIdAndBusiness(id: string, businessId: string): Promise<BusinessOnboarding> {
    try {
      const onboarding = await this.businessOnboardingModel
        .findOne({ _id: id, businessId, isDeleted: false })
        .exec();

      if (!onboarding) {
        throw new NotFoundException('Onboarding record not found');
      }

      return onboarding;
    } catch (error) {
      this.logger.error(`Error finding onboarding by ID and business: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAnalytics(businessId: string) {
    try {
      const records = await this.businessOnboardingModel
        .find({ businessId, isDeleted: false })
        .exec();

      const analytics = {
        totalOnboardingRecords: records.length,
        byType: {
          walkthrough: {
            total: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            avgCompletionTime: 0
          },
          setupGuide: {
            total: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            avgProgress: 0,
            stepsCompletion: {
              welcome: 0,
              departments: 0,
              roles: 0,
              employees: 0,
              teams: 0
            }
          }
        },
        deviceBreakdown: {
          desktop: 0,
          mobile: 0,
          tablet: 0,
          pwa: 0
        },
        totalCompletions: 0,
        avgSessionsToComplete: 0
      };

      records.forEach(record => {
        const type = record.type;
        analytics.byType[type].total++;

        // Status breakdown
        switch (record.status) {
          case OnboardingStatus.COMPLETED:
            analytics.byType[type].completed++;
            analytics.totalCompletions++;
            break;
          case OnboardingStatus.IN_PROGRESS:
            analytics.byType[type].inProgress++;
            break;
          case OnboardingStatus.NOT_STARTED:
            analytics.byType[type].notStarted++;
            break;
        }

        // Device breakdown
        if (record.deviceType) {
          analytics.deviceBreakdown[record.deviceType]++;
        }
        if (record.isPWA) {
          analytics.deviceBreakdown.pwa++;
        }

        // Type-specific analytics
        if (type === OnboardingType.SETUP_GUIDE) {
          analytics.byType.setupGuide.avgProgress += record.progressPercentage;
          
          // Step completion tracking
          record.completedSteps.forEach(step => {
            if (analytics.byType.setupGuide.stepsCompletion[step] !== undefined) {
              analytics.byType.setupGuide.stepsCompletion[step]++;
            }
          });
        }

        if (type === OnboardingType.WALKTHROUGH && record.completedAt && record.startedAt) {
          const completionTime = (record.completedAt.getTime() - record.startedAt.getTime()) / (1000 * 60); // minutes
          analytics.byType.walkthrough.avgCompletionTime += completionTime;
        }
      });

      // Calculate averages
      if (analytics.byType.setupGuide.total > 0) {
        analytics.byType.setupGuide.avgProgress = Math.round(
          analytics.byType.setupGuide.avgProgress / analytics.byType.setupGuide.total
        );
      }

      if (analytics.byType.walkthrough.completed > 0) {
        analytics.byType.walkthrough.avgCompletionTime = Math.round(
          analytics.byType.walkthrough.avgCompletionTime / analytics.byType.walkthrough.completed
        );
      }

      if (analytics.totalCompletions > 0) {
        const totalSessions = records.reduce((sum, r) => sum + r.completionCount, 0);
        analytics.avgSessionsToComplete = Math.round(totalSessions / analytics.totalCompletions);
      }

      return analytics;
    } catch (error) {
      this.logger.error(`Error getting onboarding analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markStepComplete(businessId: string, type: OnboardingType, step: SetupStep): Promise<BusinessOnboarding> {
    try {
      const record = await this.businessOnboardingModel
        .findOne({ businessId, type, isDeleted: false })
        .exec();

      if (!record) {
        throw new NotFoundException('Onboarding record not found');
      }

      // Add step to completed steps if not already there
      if (!record.completedSteps.includes(step)) {
        record.completedSteps.push(step);
        record.lastActiveAt = new Date();

        // Update status if all steps completed
        if (record.completedSteps.length >= record.totalSteps) {
          record.status = OnboardingStatus.COMPLETED;
          record.completedAt = new Date();
        } else if (record.status === OnboardingStatus.NOT_STARTED) {
          record.status = OnboardingStatus.IN_PROGRESS;
          record.startedAt = new Date();
        }

        return await record.save();
      }

      return record;
    } catch (error) {
      this.logger.error(`Error marking step complete: ${error.message}`, error.stack);
      throw error;
    }
  }

  async completeOnboarding(businessId: string, type: OnboardingType): Promise<BusinessOnboarding> {
    try {
      const updated = await this.businessOnboardingModel
        .findOneAndUpdate(
          { businessId, type, isDeleted: false },
          {
            status: OnboardingStatus.COMPLETED,
            completedAt: new Date(),
            lastActiveAt: new Date(),
            progressPercentage: 100
          },
          { new: true }
        )
        .exec();

      if (!updated) {
        throw new NotFoundException('Onboarding record not found');
      }

      return updated;
    } catch (error) {
      this.logger.error(`Error completing onboarding: ${error.message}`, error.stack);
      throw error;
    }
  }

  async dismissOnboarding(businessId: string, type: OnboardingType, reason?: string): Promise<BusinessOnboarding> {
    try {
      const metadata = { dismissalReason: reason };
      
      const updated = await this.businessOnboardingModel
        .findOneAndUpdate(
          { businessId, type, isDeleted: false },
          {
            status: OnboardingStatus.DISMISSED,
            lastActiveAt: new Date(),
            metadata
          },
          { new: true }
        )
        .exec();

      if (!updated) {
        throw new NotFoundException('Onboarding record not found');
      }

      return updated;
    } catch (error) {
      this.logger.error(`Error dismissing onboarding: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getIncompleteOnboarding(days: number = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      return await this.businessOnboardingModel
        .find({
          status: { $in: [OnboardingStatus.NOT_STARTED, OnboardingStatus.IN_PROGRESS] },
          createdAt: { $gte: cutoffDate },
          isDeleted: false
        })
        .populate('businessId')
        .sort({ lastActiveAt: -1 })
        .exec();
    } catch (error) {
      this.logger.error(`Error getting incomplete onboarding: ${error.message}`, error.stack);
      throw error;
    }
  }
}