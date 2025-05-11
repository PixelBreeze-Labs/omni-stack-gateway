// src/services/agent-permission.service.ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentFeatureFlag, Business } from '../schemas/business.schema';
import { SubscriptionStatus } from '../schemas/business.schema';
import { OptimizationStrategy } from 'src/enums/optimization.enum';

@Injectable()
export class AgentPermissionService {
  constructor(
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    @InjectModel(Business.name) private businessModel: Model<Business>
  ) {}

 /**
 * Check if a business has access to a specific agent type
 */
async hasAgentAccess(businessId: string, agentType: string): Promise<boolean> {
  // Check business subscription status
  const business = await this.businessModel.findById(businessId);
  
  if (!business) {
    throw new NotFoundException('Business not found');
  }
  
  // Only active or trialing subscribers can use agents
  if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE && 
      business.subscriptionStatus !== SubscriptionStatus.TRIALING) {
    return false;
  }
  
  // Trial accounts have access to ALL agents
  if (business.subscriptionStatus === SubscriptionStatus.TRIALING) {
    return true;
  }
  
  // For non-trial accounts, check feature access
  // Convert agent type to match the VALUE format in STAFFLUENT_FEATURES
  // e.g., "report-generation" -> "agent_report_generation"
  const featureValue = `agent_${agentType.replace(/-/g, '_').toLowerCase()}`;
  
  // Check if the agent feature is enabled in the subscription plan
  const hasFeatureAccess = this.checkFeatureInSubscription(business, featureValue);
  
  return hasFeatureAccess;
}

  /**
   * Check if a feature is included in the business subscription
   */
  private checkFeatureInSubscription(business: Business, feature: string): boolean {
    // First check if the business is on a trial - trials get all features
    if (business.subscriptionStatus === SubscriptionStatus.TRIALING) {
        // For agent features, check against the TIER_FEATURES['trialing'] list
        if (feature.startsWith('agent_')) {
            // Import your TIER_FEATURES from constants
            const { TIER_FEATURES } = require('../constants/features.constants');
            return TIER_FEATURES['trialing'].includes(feature);
        }
        return true; // For simplicity, trials get everything
    }
    
    // Then check the explicit includedFeatures array
    if (business.includedFeatures && business.includedFeatures.length > 0) {
        return business.includedFeatures.includes(feature as AgentFeatureFlag);
    }
    
    // If no explicit features and not trialing, check against tier features
    if (business.subscriptionDetails?.planId) {
        const tier = this.getSubscriptionTier(business);
        if (tier) {
            const { TIER_FEATURES } = require('../constants/features.constants');
            return TIER_FEATURES[tier].includes(feature);
        }
    }
    
    return false;
  }

  // Add this helper method
  private getSubscriptionTier(business: Business): string | null {
    // If business is in trial, use trialing tier
    if (business.subscriptionStatus === 'trialing') {
        return 'trialing';
    }

    // If business subscription is not active, return null
    if (business.subscriptionStatus !== 'active') {
        return null;
    }

    // Get the tier from subscription details
    const planId = business.subscriptionDetails?.planId;
    if (!planId) {
        return 'basic'; // Default to basic if no plan ID
    }

    // Extract tier from plan ID
    const tierFromPlanId = planId.includes('basic') ? 'basic' :
        planId.includes('professional') ? 'professional' :
            planId.includes('enterprise') ? 'enterprise' : 'basic';

    // Check metadata for tier info as fallback
    const tierFromMetadata = business.metadata?.get('subscriptionTier') || null;

    return tierFromPlanId || tierFromMetadata || 'basic';
  }

  /**
   * Enable an agent for a business
   */
  async enableAgent(clientId: string, businessId: string, agentType: string): Promise<AgentConfiguration> {
    // First check if the business should have access to this agent
    const business = await this.businessModel.findOne({ 
      _id: businessId,
      clientId,
      isDeleted: { $ne: true }
    });
    
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    
    if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE && 
        business.subscriptionStatus !== SubscriptionStatus.TRIALING) {
      throw new UnauthorizedException('Business subscription is not active');
    }
    
    // Create or update the agent configuration
    let agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType
    });
    
    if (agentConfig) {
      // Update existing configuration
      agentConfig.isEnabled = true;
      return agentConfig.save();
    } else {
      // Create new configuration with defaults
      agentConfig = new this.agentConfigModel({
        businessId,
        clientId,
        agentType,
        isEnabled: true,
        // Default configuration based on agent type
        ...this.getDefaultConfiguration(agentType)
      });
      
      return agentConfig.save();
    }
  }

  /**
   * Disable an agent for a business
   */
  async disableAgent(businessId: string, agentType: string): Promise<AgentConfiguration> {
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType
    });
    
    if (!agentConfig) {
      throw new NotFoundException('Agent configuration not found');
    }
    
    agentConfig.isEnabled = false;
    return agentConfig.save();
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfiguration(
    businessId: string, 
    agentType: string, 
    config: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType
    });
    
    if (!agentConfig) {
      throw new NotFoundException('Agent configuration not found');
    }
    
    // Update configuration fields
    Object.assign(agentConfig, config);
    
    return agentConfig.save();
  }

  private getDefaultConfiguration(agentType: string): Partial<AgentConfiguration> {
    switch (agentType) {
      case 'auto-assignment':
        return {
          requireApproval: true,
          weights: {
            skillMatch: 0.4,
            availability: 0.3,
            proximity: 0.1,
            workload: 0.2
          },
          assignmentFrequency: 5,
          notificationSettings: {
            emailNotifications: true,
            managerEmails: [],
            notifyOnAssignment: true,
            notifyOnRejection: false
          },
          respectMaxWorkload: true,
          maxTasksPerStaff: 10
        };
      
      case 'compliance-monitoring':
        return {
          requireApproval: false,
          monitoringFrequency: 24,
          certificationWarningDays: 30,
          notificationSettings: {
            emailNotifications: true,
            managerEmails: [],
            notifyOnAssignment: false,
            notifyOnRejection: false
          }
        };
      
      case 'report-generation':
        return {
          requireApproval: true,
          notificationSettings: {
            emailNotifications: true,
            managerEmails: [],
            notifyOnAssignment: true,
            notifyOnRejection: false
          }
        };
      
      case 'client-communication':
        return {
          autoResponseEnabled: false,
          scheduledUpdatesEnabled: false,
          notificationSettings: {
            emailNotifications: true,
            managerEmails: [],
            notifyOnAssignment: false,
            notifyOnRejection: false
          }
        };
      
      case 'resource-request':
        return {
          inventoryCheckFrequency: 24,
          forecastFrequency: 168,
          autoApprove: false,
          approverUserIds: [],
          leadTimes: {},
          enableAdvanceOrders: false,
          advanceOrderDays: 30
        };
      
      case 'shift-optimization':
        return {
          weeklyOptimizationCron: '0 1 * * 0', // Sunday at 1 AM
          dailyForecastCron: '0 0 * * *', // Midnight daily
          optimizationStrategy: OptimizationStrategy.WORKLOAD_BALANCED,
          sendOptimizationNotifications: true,
          sendForecastNotifications: true,
        };
      
      default:
        return {};
    }
  }

  /**
   * Get agent configuration
   */
  async getAgentConfiguration(businessId: string, agentType: string): Promise<AgentConfiguration> {
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType
    });
    
    if (!agentConfig) {
      throw new NotFoundException('Agent configuration not found');
    }
    
    return agentConfig;
  }

  /**
   * List all agent configurations for a business
   */
  async listBusinessAgentConfigurations(businessId: string): Promise<AgentConfiguration[]> {
    return this.agentConfigModel.find({ businessId });
  }

  /**
 * Get available agent types for a business based on subscription
 */
async getAvailableAgents(businessId: string): Promise<string[]> {
  const business = await this.businessModel.findById(businessId);
  
  if (!business) {
    throw new NotFoundException('Business not found');
  }
  
  // Only active subscribers can use agents
  if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE && 
      business.subscriptionStatus !== SubscriptionStatus.TRIALING) {
    return [];
  }
  
  // Get the business's subscription tier
  const tier = this.getSubscriptionTier(business);
  
  // Map tier to available agent types
  switch(tier) {
    case 'basic':
      return ['auto-assignment'];
    case 'professional':
      return ['auto-assignment', 'compliance-monitoring', 'client-communication'];
    case 'enterprise':
    case 'trialing':
      return ['auto-assignment', 'compliance-monitoring', 'client-communication', 
              'report-generation', 'resource-request', 'shift-optimization'];
    default:
      return [];
  }
}

  /**
   * List all businesses with a specific agent enabled
   */
  async listBusinessesWithAgent(clientId: string, agentType: string): Promise<string[]> {
    const configurations = await this.agentConfigModel.find({
      clientId,
      agentType,
      isEnabled: true
    });
    
    return configurations.map(config => config.businessId);
  }
}