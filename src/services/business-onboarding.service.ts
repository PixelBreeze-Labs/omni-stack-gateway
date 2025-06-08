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
  OnboardingState
} from '../dtos/business-onboarding.dto';
import { User } from 'src/schemas/user.schema';
import { NotificationPreferencesResponse, UpdateNotificationPreferencesDto } from 'src/dtos/user-notification-preferences.dto';
import { ActivityType } from 'src/schemas/app-activity.schema';
import { AppActivityService } from 'src/services/app-activity.service';

@Injectable()
export class BusinessOnboardingService {
  private readonly logger = new Logger(BusinessOnboardingService.name);

  constructor(
    @InjectModel(BusinessOnboarding.name) 
    private businessOnboardingModel: Model<BusinessOnboarding>,
    @InjectModel(User.name) 
    private userModel: Model<User>,
    private appActivityService: AppActivityService
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
/**
 * Update admin user notification preferences based on business ID
 */
async updateNotificationPreferences(
  businessId: string,
  updateDto: UpdateNotificationPreferencesDto
): Promise<NotificationPreferencesResponse> {
  try {
    // Get business to find admin user ID
    const Business = this.userModel.db.model('Business');
    const business = await Business.findById(businessId).exec();
    
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Find the admin user
    const user = await this.userModel.findById(business.adminUserId).exec();
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    // Get current metadata or initialize empty map
    const currentMetadata = user.metadata || new Map();

    // Update only the specified notification preferences
    if (updateDto.emailNotificationsEnabled !== undefined) {
      currentMetadata.set('emailNotificationsEnabled', updateDto.emailNotificationsEnabled.toString());
    }

    if (updateDto.smsNotificationsEnabled !== undefined) {
      currentMetadata.set('smsNotificationsEnabled', updateDto.smsNotificationsEnabled.toString());
    }

    // Add timestamp for when preferences were last updated
    currentMetadata.set('notificationPreferencesUpdatedAt', new Date().toISOString());

    // Update the user with the modified metadata
    const updatedUser = await this.userModel.findByIdAndUpdate(
      business.adminUserId,
      { 
        metadata: currentMetadata,
        updatedAt: new Date() 
      },
      { new: true }
    ).exec();

    await this.appActivityService.createActivity({
      businessId,
      userId: business.adminUserId,
      userName: updatedUser.name || updatedUser.email.split('@')[0],
      userEmail: updatedUser.email,
      type: ActivityType.BUSINESS_SETTINGS_CHANGED,
      action: `Updated notification preferences`,
      description: `Email: ${updateDto.emailNotificationsEnabled ? 'enabled' : 'disabled'}, SMS: ${updateDto.smsNotificationsEnabled ? 'enabled' : 'disabled'}`,
      resourceType: 'business_settings',
      resourceId: businessId,
      resourceName: 'Notification Preferences',
      data: {
        emailNotificationsEnabled: updateDto.emailNotificationsEnabled,
        smsNotificationsEnabled: updateDto.smsNotificationsEnabled,
        previousSettings: {
          email: user.metadata?.get('emailNotificationsEnabled') !== 'false',
          sms: user.metadata?.get('smsNotificationsEnabled') === 'true'
        }
      }
    });

    if (!updatedUser) {
      throw new NotFoundException('Failed to update admin user preferences');
    }

    // Return the current preferences
    const emailEnabled = updatedUser.metadata?.get('emailNotificationsEnabled') !== 'false'; // Default true
    const smsEnabled = updatedUser.metadata?.get('smsNotificationsEnabled') === 'true'; // Default false

    this.logger.log(`Updated notification preferences for admin user ${business.adminUserId} in business ${businessId}`);

    return {
      emailNotificationsEnabled: emailEnabled,
      smsNotificationsEnabled: smsEnabled,
    };

  } catch (error) {
    this.logger.error(`Error updating notification preferences: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Get admin user notification preferences based on business ID
 */
async getNotificationPreferences(
  businessId: string
): Promise<NotificationPreferencesResponse> {
  try {
    // Get business to find admin user ID
    const Business = this.userModel.db.model('Business');
    const business = await Business.findById(businessId).exec();
    
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // Find the admin user
    const user = await this.userModel.findById(business.adminUserId).exec();
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    // Get preferences from metadata, defaulting to true for email and false for SMS
    const emailEnabled = user.metadata?.get('emailNotificationsEnabled') !== 'false'; // Default true
    const smsEnabled = user.metadata?.get('smsNotificationsEnabled') === 'true'; // Default false
   

    return {
      emailNotificationsEnabled: emailEnabled,
      smsNotificationsEnabled: smsEnabled,
    };

  } catch (error) {
    this.logger.error(`Error getting notification preferences: ${error.message}`, error.stack);
    throw error;
  }
}

/**
 * Helper method to check if admin user has email notifications enabled
 */
async hasEmailNotificationsEnabled(businessId: string): Promise<boolean> {
  try {
    const Business = this.userModel.db.model('Business');
    const business = await Business.findById(businessId).exec();
    
    if (!business) {
      return true; // Default to enabled if business not found
    }

    const user = await this.userModel.findById(business.adminUserId).exec();
    return user?.metadata?.get('emailNotificationsEnabled') !== 'false'; // Default true
  } catch (error) {
    this.logger.warn(`Error checking email notification status for business ${businessId}: ${error.message}`);
    return true; // Default to enabled if error
  }
}

/**
 * Helper method to check if admin user has SMS notifications enabled
 */
async hasSmsNotificationsEnabled(businessId: string): Promise<boolean> {
  try {
    const Business = this.userModel.db.model('Business');
    const business = await Business.findById(businessId).exec();
    
    if (!business) {
      return false; // Default to disabled if business not found
    }

    const user = await this.userModel.findById(business.adminUserId).exec();
    return user?.metadata?.get('smsNotificationsEnabled') === 'true'; // Default false
  } catch (error) {
    this.logger.warn(`Error checking SMS notification status for business ${businessId}: ${error.message}`);
    return false; // Default to disabled if error
  }
}

}