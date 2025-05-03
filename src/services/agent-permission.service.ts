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
    
    // Only active subscribers can use agents
    if (business.subscriptionStatus !== SubscriptionStatus.ACTIVE && 
        business.subscriptionStatus !== SubscriptionStatus.TRIALING) {
      return false;
    }
    
    // Check if the agent feature is enabled in the subscription plan
    // This assumes you store subscription plan details with feature flags
    const hasFeatureAccess = this.checkFeatureInSubscription(business, `agent_${agentType}`);
    
    if (!hasFeatureAccess) {
      return false;
    }
    
    // Check if the agent is enabled for this business
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType
    });
    
    // No configuration means no access yet
    if (!agentConfig) {
      return false;
    }
    
    // Check if the agent is enabled
    return agentConfig.isEnabled;
  }

 /**
 * Check if a feature is included in the business subscription
 */
private checkFeatureInSubscription(business: Business, feature: string): boolean {
    // Check the includedFeatures array we added directly to the Business schema
    if (!business.includedFeatures || business.includedFeatures.length === 0) {
      return false;
    }
    
    return business.includedFeatures.includes(feature as AgentFeatureFlag);
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