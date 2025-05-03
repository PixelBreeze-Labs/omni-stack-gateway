// src/services/resource-request-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ResourceItem, ResourceType, ResourceStatus } from '../schemas/resource-item.schema';
import { ResourceRequest, RequestStatus, RequestPriority, RequestSource } from '../schemas/resource-request.schema';
import { ResourceUsage } from '../schemas/resource-usage.schema';
import { ResourceForecast, ForecastStatus } from '../schemas/resource-forecast.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import { EmailService } from './email.service';
import { CronJob } from 'cron';
import { format, addDays, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, differenceInDays } from 'date-fns';

@Injectable()
export class ResourceRequestAgentService {
  private readonly logger = new Logger(ResourceRequestAgentService.name);
  private businessCronJobs: Map<string, CronJob[]> = new Map();
  private readonly SYSTEM_USER_ID = '000000000000000000000000'; // System user ID for automated actions

  constructor(
    @InjectModel(ResourceItem.name) private resourceItemModel: Model<ResourceItem>,
    @InjectModel(ResourceRequest.name) private resourceRequestModel: Model<ResourceRequest>,
    @InjectModel(ResourceUsage.name) private resourceUsageModel: Model<ResourceUsage>,
    @InjectModel(ResourceForecast.name) private resourceForecastModel: Model<ResourceForecast>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly emailService: EmailService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Initialize monitoring for all businesses with agent enabled
    this.initializeResourceMonitoring();
  }

  /**
   * Initialize resource monitoring for all businesses
   */
  private async initializeResourceMonitoring() {
    try {
      // Get all businesses with resource-request agent enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'resource-request',
        isEnabled: true
      }).distinct('businessId');
      
      for (const businessId of enabledBusinessIds) {
        await this.setupBusinessResourceMonitoring(businessId);
      }
      
      this.logger.log(`Initialized resource monitoring for ${enabledBusinessIds.length} businesses`);
    } catch (error) {
      this.logger.error('Failed to initialize resource monitoring', error.stack);
    }
  }

  /**
   * Setup resource monitoring for a specific business
   */
  private async setupBusinessResourceMonitoring(businessId: string) {
    // Clear any existing jobs for this business
    this.clearBusinessJobs(businessId);
    
    // Get agent configuration
    const config = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'resource-request'
    });
    
    if (!config || !config.isEnabled) {
      this.logger.warn(`Resource request agent not enabled for business ${businessId}`);
      return;
    }
    
    // Schedule inventory check job
    const inventoryCheckFrequency = config.inventoryCheckFrequency || 24; // Default to daily
    const inventoryCheckCron = this.getCronExpression(inventoryCheckFrequency);
    
    const inventoryJobName = `resource-inventory-${businessId}`;
    const inventoryJob = new CronJob(inventoryCheckCron, () => {
      this.checkInventoryLevels(businessId);
    });
    
    this.schedulerRegistry.addCronJob(inventoryJobName, inventoryJob);
    inventoryJob.start();
    
    // Schedule forecast job
    const forecastFrequency = config.forecastFrequency || 168; // Default to weekly
    const forecastCron = this.getCronExpression(forecastFrequency);
    
    const forecastJobName = `resource-forecast-${businessId}`;
    const forecastJob = new CronJob(forecastCron, () => {
      this.generateResourceForecasts(businessId);
    });
    
    this.schedulerRegistry.addCronJob(forecastJobName, forecastJob);
    forecastJob.start();
    
    // Track jobs for this business
    this.businessCronJobs.set(businessId, [inventoryJob, forecastJob]);
    
    this.logger.log(`Setup resource monitoring for business ${businessId}`);
  }

  /**
   * Generate a cron expression based on frequency in hours
   */
  private getCronExpression(frequencyHours: number): string {
    if (frequencyHours % 24 === 0) {
      // Daily or multiple days
      const days = frequencyHours / 24;
      if (days === 1) {
        return '0 0 * * *'; // Daily at midnight
      } else {
        return `0 0 */${days} * *`; // Every N days at midnight
      }
    } else {
      // Hourly
      return `0 */${frequencyHours} * * *`; // Every N hours
    }
  }

  /**
   * Clear existing cron jobs for a business
   */
  private clearBusinessJobs(businessId: string) {
    const existingJobs = this.businessCronJobs.get(businessId) || [];
    
    for (const job of existingJobs) {
      job.stop();
    }
    
    const inventoryJobName = `resource-inventory-${businessId}`;
    const forecastJobName = `resource-forecast-${businessId}`;
    
    try {
      this.schedulerRegistry.deleteCronJob(inventoryJobName);
      this.schedulerRegistry.deleteCronJob(forecastJobName);
    } catch (e) {
      // Jobs might not exist, which is fine
    }
    
    this.businessCronJobs.delete(businessId);
  }

  /**
   * Update business monitoring configuration
   */
  async updateBusinessMonitoring(businessId: string) {
    return this.setupBusinessResourceMonitoring(businessId);
  }

  /**
   * Check inventory levels and create automated requests
   */
  async checkInventoryLevels(businessId: string) {
    this.logger.log(`Checking inventory levels for business ${businessId}`);
    
    try {
      // Check if agent is enabled for this business
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        businessId, 
        'resource-request'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Resource request agent not enabled for business ${businessId}`);
        return;
      }
      
      // Get configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'resource-request'
      });
      
      // Get all active resources for this business
      const resources = await this.resourceItemModel.find({
        businessId,
        isDeleted: false,
        status: { $ne: ResourceStatus.DISPOSED }
      });
      
      // Filter resources that need replenishment
      const lowResources = resources.filter(resource => 
        resource.currentQuantity <= resource.minQuantity &&
        resource.status !== ResourceStatus.ORDERED
      );
      
      if (lowResources.length === 0) {
        this.logger.log(`No low inventory items found for business ${businessId}`);
        return;
      }
      
      // Group resources by supplier for efficient ordering
      const resourcesBySupplier = this.groupResourcesBySupplier(lowResources);
      
      // Create requests
      let requestsCreated = 0;
      
      for (const [supplier, items] of Object.entries(resourcesBySupplier)) {
        // Check if there's an open request for this supplier
        const existingRequest = await this.resourceRequestModel.findOne({
          businessId,
          status: { $in: [RequestStatus.DRAFT, RequestStatus.PENDING] },
          'items.resourceItemId': { $in: items.map(item => item._id) }
        });
        
        if (existingRequest) {
          // Update existing request
          this.logger.log(`Updating existing request ${existingRequest.requestNumber} for supplier ${supplier}`);
          
          // Add missing items
          const existingItemIds = existingRequest.items.map(item => item.resourceItemId?.toString());
          const newItems = items.filter(item => !existingItemIds.includes(item._id.toString()));
          
          if (newItems.length > 0) {
            const newRequestItems = newItems.map(item => ({
                resourceItemId: item._id.toString(), // Convert to string
                name: item.name,
                type: item.type,
                quantity: this.calculateOptimalOrderQuantity(item),
                unitCost: item.unitCost,
                totalCost: item.unitCost * this.calculateOptimalOrderQuantity(item),
                notes: 'Automatically added due to low inventory'
              }));
            
            existingRequest.items.push(...newRequestItems);
            
            // Update history
            existingRequest.history.push({
              action: 'update',
              timestamp: new Date(),
              userId: this.SYSTEM_USER_ID,
              note: `Automatically added ${newItems.length} items due to low inventory`
            });
            
            await existingRequest.save();
          }
        } else {
          // Create new request
          const requestNumber = await this.generateRequestNumber(businessId);
          
          const requestItems = items.map(item => ({
            resourceItemId: item._id,
            name: item.name,
            type: item.type,
            quantity: this.calculateOptimalOrderQuantity(item),
            unitCost: item.unitCost,
            totalCost: item.unitCost * this.calculateOptimalOrderQuantity(item),
            notes: 'Automatically generated due to low inventory'
          }));
          
          // Get approver based on configuration
          const approverIds = config.approverUserIds || [];
          
          const newRequest = new this.resourceRequestModel({
            businessId,
            requestNumber,
            requestedBy: this.SYSTEM_USER_ID,
            status: config.autoApprove ? RequestStatus.APPROVED : RequestStatus.PENDING,
            priority: this.determinePriority(items),
            source: RequestSource.AUTOMATED,
            neededBy: this.calculateNeededByDate(items, config),
            items: requestItems,
            notes: `Automated request generated for ${supplier || 'multiple suppliers'}`,
            metadata: {
              supplier,
              generatedBy: 'resource-request-agent',
              approverIds
            },
            history: [
              {
                action: 'create',
                timestamp: new Date(),
                userId: this.SYSTEM_USER_ID,
                note: 'Automatically generated by Resource Request Agent'
              }
            ]
          });
          
          if (config.autoApprove) {
            newRequest.approvedBy = this.SYSTEM_USER_ID;
            newRequest.approvedAt = new Date();
            newRequest.history.push({
              action: 'approve',
              timestamp: new Date(),
              userId: this.SYSTEM_USER_ID,
              note: 'Automatically approved based on business configuration',
              previousStatus: RequestStatus.PENDING,
              newStatus: RequestStatus.APPROVED
            });
          }
          
          await newRequest.save();
          requestsCreated++;
          
          // Mark resources as ordered
          for (const item of items) {
            await this.resourceItemModel.findByIdAndUpdate(item._id, {
              status: ResourceStatus.ORDERED
            });
          }
          
          // Send notifications
          await this.sendRequestNotifications(newRequest, config);
        }
      }
      
      this.logger.log(`Created ${requestsCreated} new automated requests for business ${businessId}`);
    } catch (error) {
      this.logger.error(`Error checking inventory levels for business ${businessId}:`, error.stack);
    }
  }

  /**
   * Group resources by supplier for efficient ordering
   */
  private groupResourcesBySupplier(resources: ResourceItem[]): Record<string, ResourceItem[]> {
    const result: Record<string, ResourceItem[]> = {};
    
    for (const resource of resources) {
      const supplier = resource.supplier || 'unknown';
      
      if (!result[supplier]) {
        result[supplier] = [];
      }
      
      result[supplier].push(resource);
    }
    
    return result;
  }

  /**
   * Calculate the optimal order quantity for a resource
   */
  private calculateOptimalOrderQuantity(resource: ResourceItem): number {
    // If optimal quantity is set, order up to that level
    if (resource.optimalQuantity) {
      return resource.optimalQuantity - resource.currentQuantity;
    }
    
    // If max quantity is set, order up to that level
    if (resource.maxQuantity) {
      return resource.maxQuantity - resource.currentQuantity;
    }
    
    // Default to twice the minimum quantity
    return Math.max(resource.minQuantity, 1) * 2;
  }

  /**
   * Determine the priority for a request based on the items
   */
  private determinePriority(items: ResourceItem[]): RequestPriority {
    // Check if any item is completely depleted
    const anyDepleted = items.some(item => item.currentQuantity === 0);
    
    if (anyDepleted) {
      return RequestPriority.URGENT;
    }
    
    // Check if any item is critically low (less than 25% of minimum)
    const anyCritical = items.some(item => 
      item.currentQuantity < (item.minQuantity * 0.25)
    );
    
    if (anyCritical) {
      return RequestPriority.HIGH;
    }
    
    // Check if any item is very low (less than 50% of minimum)
    const anyVeryLow = items.some(item => 
      item.currentQuantity < (item.minQuantity * 0.5)
    );
    
    if (anyVeryLow) {
      return RequestPriority.MEDIUM;
    }
    
    // Default to low priority
    return RequestPriority.LOW;
  }

  /**
   * Calculate the needed by date based on items and configuration
   */
  private calculateNeededByDate(items: ResourceItem[], config: AgentConfiguration): Date {
    const priority = this.determinePriority(items);
    const now = new Date();
    
    // Default lead times based on priority
    const defaultLeadTimes = {
      [RequestPriority.URGENT]: 1, // 1 day
      [RequestPriority.HIGH]: 3,   // 3 days
      [RequestPriority.MEDIUM]: 7, // 7 days
      [RequestPriority.LOW]: 14    // 14 days
    };
    
    // Get lead time from config or use default
    const leadTime = config.leadTimes?.[priority] || defaultLeadTimes[priority];
    
    return addDays(now, leadTime);
  }

  /**
   * Generate a unique request number
   */
  private async generateRequestNumber(businessId: string): Promise<string> {
    const business = await this.businessModel.findById(businessId);
    const businessCode = business?.name?.substring(0, 3).toUpperCase() || 'BUS';
    
    const today = new Date();
    const dateCode = format(today, 'yyyyMMdd');
    
    // Count existing requests for this business today
    const count = await this.resourceRequestModel.countDocuments({
      businessId,
      requestNumber: { $regex: `${businessCode}-${dateCode}` }
    });
    
    const sequenceNumber = (count + 1).toString().padStart(3, '0');
    
    return `${businessCode}-${dateCode}-${sequenceNumber}`;
  }

  /**
   * Send notifications for a new request
   */
  private async sendRequestNotifications(request: ResourceRequest, config: AgentConfiguration) {
    try {
      // Send to approvers if pending approval
      if (request.status === RequestStatus.PENDING) {
        const approverIds = config.approverUserIds || [];
        
        if (approverIds.length > 0) {
          const approvers = await this.userModel.find({
            _id: { $in: approverIds }
          });
          
          for (const approver of approvers) {
            await this.sendApprovalRequestEmail(request, approver);
          }
        }
      }
      
      // Send to inventory manager or admin
      const managerIds = config.managerUserIds || [];
      
      if (managerIds.length > 0) {
        const managers = await this.userModel.find({
          _id: { $in: managerIds }
        });
        
        for (const manager of managers) {
          await this.sendInventoryAlertEmail(request, manager);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending notifications for request ${request._id}:`, error.message);
    }
  }

  /**
   * Send approval request email
   */
  private async sendApprovalRequestEmail(request: ResourceRequest, approver: User) {
    // Format items for email
    const itemsList = request.items.map(item => 
      `- ${item.name} (${item.quantity} ${item.unitCost ? '@ ' + item.unitCost + ' each' : ''})`
    ).join('\n');
    
    // Format needed by date
    const neededByDate = request.neededBy ? format(request.neededBy, 'MMM d, yyyy') : 'As soon as possible';
    
    const templateData = {
      approverName: `${approver.name} ${approver.surname}`,
      requestNumber: request.requestNumber,
      requestType: 'Resource Request',
      priority: request.priority,
      itemsList,
      totalItems: request.items.length,
      totalCost: request.items.reduce((sum, item) => sum + (item.totalCost || 0), 0),
      currency: '$', // Replace with actual currency
      requestUrl: `${process.env.APP_URL}/resource-requests/${request._id}`,
      neededByDate
    };
    
    await this.emailService.sendTemplateEmail(
      'Staffluent Resource Agent',
      process.env.EMAIL_FROM,
      approver.email,
      `Resource Request Approval: ${request.requestNumber}`,
      'templates/resource-request/approval-request.html',
      templateData
    );
  }

  /**
   * Send inventory alert email
   */
  private async sendInventoryAlertEmail(request: ResourceRequest, manager: User) {
    // Format items for email
    const itemsList = request.items.map(item => 
      `- ${item.name} (${item.quantity} ${item.unitCost ? '@ ' + item.unitCost + ' each' : ''})`
    ).join('\n');
    
    // Format needed by date
    const neededByDate = request.neededBy ? format(request.neededBy, 'MMM d, yyyy') : 'As soon as possible';
    
    const templateData = {
      managerName: `${manager.name} ${manager.surname}`,
      requestNumber: request.requestNumber,
      requestType: 'Resource Request',
      status: request.status,
      priority: request.priority,
      itemsList,
      totalItems: request.items.length,
      totalCost: request.items.reduce((sum, item) => sum + (item.totalCost || 0), 0),
      currency: '$', // Replace with actual currency
      requestUrl: `${process.env.APP_URL}/resource-requests/${request._id}`,
      neededByDate,
      isAutoApproved: request.status === RequestStatus.APPROVED
    };
    
    await this.emailService.sendTemplateEmail(
      'Staffluent Resource Agent',
      process.env.EMAIL_FROM,
      manager.email,
      `Low Inventory Alert: ${request.requestNumber}`,
      'templates/resource-request/inventory-alert.html',
      templateData
    );
  }

  /**
   * Generate resource forecasts
   */
  async generateResourceForecasts(businessId: string) {
    this.logger.log(`Generating resource forecasts for business ${businessId}`);
    
    try {
      // Check if agent is enabled for this business
      const hasAccess = await this.agentPermissionService.hasAgentAccess(
        businessId, 
        'resource-request'
      );
      
      if (!hasAccess) {
        this.logger.warn(`Resource request agent not enabled for business ${businessId}`);
        return;
      }
      
      // Get configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'resource-request'
      });
      
      // Get all active resources for this business
      const resources = await this.resourceItemModel.find({
        businessId,
        isDeleted: false,
        status: { $ne: ResourceStatus.DISPOSED }
      });
      
      // Get historical usage data (last 90 days)
      const now = new Date();
      const startDate = subDays(now, 90);
      
      const historicalUsage = await this.resourceUsageModel.find({
        businessId,
        date: { $gte: startDate, $lte: now }
      });
      
      // Generate forecasts for each resource
      let forecastsGenerated = 0;
      
      for (const resource of resources) {
        // Skip resources that don't need tracking
        if (!resource.minQuantity && !resource.optimalQuantity) {
          continue;
        }
        
        // Get historical usage for this resource
        const resourceUsage = historicalUsage.filter(usage => 
          usage.resourceItemId.toString() === resource._id.toString()
        );
        
        // Skip resources with no historical data
        if (resourceUsage.length === 0) {
          continue;
        }
        
        // Calculate forecast periods (next 30, 60, 90 days)
        const forecastPeriods = [30, 60, 90];
        
        for (const days of forecastPeriods) {
          const forecastDate = addDays(now, days);
          
          // Check if forecast already exists
          const existingForecast = await this.resourceForecastModel.findOne({
            businessId,
            resourceItemId: resource._id,
            forecastDate: {
              $gte: startOfDay(forecastDate),
              $lte: endOfDay(forecastDate)
            }
          });
          
          if (existingForecast) {
            // Update existing forecast
            const projectedQuantity = this.calculateProjectedQuantity(resource, resourceUsage, days);
            
            existingForecast.projectedQuantity = projectedQuantity;
            existingForecast.confidenceLevel = this.calculateConfidenceLevel(resourceUsage, days);
            existingForecast.status = ForecastStatus.PROJECTED;
            
            // Update factors
            existingForecast.factors = {
              historicalUsage: this.calculateAverageUsage(resourceUsage),
              seasonality: this.calculateSeasonalityFactor(resourceUsage, forecastDate),
              projectGrowth: this.calculateProjectGrowthFactor(resourceUsage),
              eventImpact: 1.0 // Default no impact
            };
            
            await existingForecast.save();
          } else {
            // Create new forecast
            const projectedQuantity = this.calculateProjectedQuantity(resource, resourceUsage, days);
            
            const newForecast = new this.resourceForecastModel({
              businessId,
              resourceItemId: resource._id,
              forecastDate,
              projectedQuantity,
              confidenceLevel: this.calculateConfidenceLevel(resourceUsage, days),
              status: ForecastStatus.PROJECTED,
              factors: {
                historicalUsage: this.calculateAverageUsage(resourceUsage),
                seasonality: this.calculateSeasonalityFactor(resourceUsage, forecastDate),
                projectGrowth: this.calculateProjectGrowthFactor(resourceUsage),
                eventImpact: 1.0 // Default no impact
              }
            });
            
            await newForecast.save();
            forecastsGenerated++;
          }
        }
      }
      
      this.logger.log(`Generated ${forecastsGenerated} new forecasts for business ${businessId}`);
      
      // Check if we need to create advance orders based on forecasts
      if (config.enableAdvanceOrders) {
        await this.processAdvanceOrders(businessId, config);
      }
    } catch (error) {
      this.logger.error(`Error generating resource forecasts for business ${businessId}:`, error.stack);
    }
  }

  /**
   * Calculate the average usage from historical data
   */
  private calculateAverageUsage(usageData: ResourceUsage[]): number {
    if (usageData.length === 0) {
      return 0;
    }
    
    const totalUsage = usageData.reduce((sum, usage) => sum + usage.quantity, 0);
    
    return totalUsage / usageData.length;
  }

  /**
   * Calculate seasonality factor based on historical data
   */
  private calculateSeasonalityFactor(usageData: ResourceUsage[], forecastDate: Date): number {
    // This would be a more complex algorithm in a real implementation
    // For simplicity, we're using a dummy algorithm here
    
    // Get month of forecast date
    const forecastMonth = forecastDate.getMonth();
    
    // Group usage by month
    const usageByMonth: Record<number, number[]> = {};
    
    for (const usage of usageData) {
      const month = usage.date.getMonth();
      
      if (!usageByMonth[month]) {
        usageByMonth[month] = [];
      }
      
      usageByMonth[month].push(usage.quantity);
    }
    
    // Calculate average usage for forecast month
    if (!usageByMonth[forecastMonth] || usageByMonth[forecastMonth].length === 0) {
      return 1.0; // Default no seasonality
    }
    
    const forecastMonthAvg = usageByMonth[forecastMonth].reduce((sum, qty) => sum + qty, 0) / 
      usageByMonth[forecastMonth].length;
    
    // Calculate overall average
    const allUsage = usageData.map(usage => usage.quantity);
    const overallAvg = allUsage.reduce((sum, qty) => sum + qty, 0) / allUsage.length;
    
    if (overallAvg === 0) {
      return 1.0;
    }
    
    // Calculate seasonality factor
    return forecastMonthAvg / overallAvg;
  }

  /**
   * Calculate project growth factor based on historical data
   */
  private calculateProjectGrowthFactor(usageData: ResourceUsage[]): number {
    // This would be a more complex algorithm in a real implementation
    // For simplicity, we're using a dummy algorithm here
    
    if (usageData.length < 30) {
      return 1.0; // Not enough data
    }
    
    // Sort by date
    const sortedUsage = [...usageData].sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Split into first half and second half
    const midpoint = Math.floor(sortedUsage.length / 2);
    const firstHalf = sortedUsage.slice(0, midpoint);
    const secondHalf = sortedUsage.slice(midpoint);
    
    // Calculate averages
    const firstHalfAvg = firstHalf.reduce((sum, usage) => sum + usage.quantity, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, usage) => sum + usage.quantity, 0) / secondHalf.length;
    
    if (firstHalfAvg === 0) {
      return 1.0;
    }
    
    // Calculate growth factor
    return secondHalfAvg / firstHalfAvg;
  }

  /**
   * Calculate projected quantity needed based on historical data
   */
  private calculateProjectedQuantity(
    resource: ResourceItem,
    usageData: ResourceUsage[],
    forecastDays: number
  ): number {
    const averageUsage = this.calculateAverageUsage(usageData);
    const seasonalityFactor = this.calculateSeasonalityFactor(usageData, addDays(new Date(), forecastDays));
    const growthFactor = this.calculateProjectGrowthFactor(usageData);
    
    // Calculate projected daily usage
    const dailyUsage = averageUsage * seasonalityFactor * growthFactor;
    
    // Calculate projected usage for the forecast period
    const projectedUsage = dailyUsage * forecastDays;
    
    // Calculate how much more is needed based on current quantity
    const additionalNeeded = Math.max(0, projectedUsage - resource.currentQuantity);
    
    return Math.ceil(additionalNeeded);
  }

  /**
   * Calculate confidence level for a forecast
   */
  private calculateConfidenceLevel(usageData: ResourceUsage[], forecastDays: number): number {
    // This would be a more complex algorithm in a real implementation
    // For simplicity, we're using a dummy algorithm here
    
    // Factors affecting confidence:
    // 1. Amount of historical data
    // 2. Consistency of usage
    // 3. Length of forecast period
    
    // Data amount factor
    const dataPoints = usageData.length;
    const dataFactor = Math.min(1, dataPoints / 60); // Max confidence at 60+ data points
    
    // Consistency factor (using coefficient of variation)
    const quantities = usageData.map(usage => usage.quantity);
    const mean = quantities.reduce((sum, qty) => sum + qty, 0) / quantities.length;
    
    if (mean === 0) {
      return 0.5; // Default medium confidence
    }
    
    const squaredDiffs = quantities.map(qty => Math.pow(qty - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / quantities.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;
    
    const consistencyFactor = Math.max(0, 1 - cv / 2); // Lower CV means higher consistency
    
    // Forecast period factor
    const periodFactor = Math.max(0, 1 - forecastDays / 180); // Shorter periods are more confident
    
    // Combined confidence
    const confidence = (dataFactor * 0.4) + (consistencyFactor * 0.4) + (periodFactor * 0.2);
    
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Process advance orders based on forecasts
   */
  private async processAdvanceOrders(businessId: string, config: AgentConfiguration) {
    this.logger.log(`Processing advance orders for business ${businessId}`);
    
    try {
      // Get forecasts for the advance order period
      const advanceOrderDays = config.advanceOrderDays || 30;
      const targetDate = addDays(new Date(), advanceOrderDays);
      
      const forecasts = await this.resourceForecastModel.find({
        businessId,
        status: ForecastStatus.PROJECTED,
        forecastDate: {
          $gte: startOfDay(targetDate),
          $lte: endOfDay(targetDate)
        },
        projectedQuantity: { $gt: 0 },
        confidenceLevel: { $gte: config.minimumConfidence || 0.7 }
      }).populate('resourceItemId');
      
      if (forecasts.length === 0) {
        this.logger.log(`No forecasts ready for advance orders for business ${businessId}`);
        return;
      }
      
      // Group forecasts by resource type and supplier
      const forecastsBySupplier: Record<string, any[]> = {};
      
      for (const forecast of forecasts) {
        const resource = forecast.resourceItemId as any;
        
        if (!resource || resource.isDeleted) {
          continue;
        }
        
        const supplier = resource.supplier || 'unknown';
        
        if (!forecastsBySupplier[supplier]) {
          forecastsBySupplier[supplier] = [];
        }
        
        forecastsBySupplier[supplier].push({
          forecast,
          resource
        });
      }
      
      // Create advance order requests
      let requestsCreated = 0;
      
      for (const [supplier, items] of Object.entries(forecastsBySupplier)) {
        // Check if there's an open request for this supplier
        const resourceIds = items.map(item => item.resource._id);
        
        const existingRequest = await this.resourceRequestModel.findOne({
          businessId,
          status: { $in: [RequestStatus.DRAFT, RequestStatus.PENDING] },
          source: RequestSource.PREDICTION,
          'items.resourceItemId': { $in: resourceIds }
        });
        
        if (existingRequest) {
          // Update existing request
          this.logger.log(`Updating existing forecast request ${existingRequest.requestNumber} for supplier ${supplier}`);
          
          // Add missing items
          const existingItemIds = existingRequest.items.map(item => item.resourceItemId.toString());
          const newItems = items.filter(item => !existingItemIds.includes(item.resource._id.toString()));
          
          if (newItems.length > 0) {
            const newRequestItems = newItems.map(item => ({
              resourceItemId: item.resource._id,
              name: item.resource.name,
              type: item.resource.type,
              quantity: item.forecast.projectedQuantity,
              unitCost: item.resource.unitCost,
              totalCost: item.resource.unitCost * item.forecast.projectedQuantity,
              notes: `Forecast-based request (${Math.round(item.forecast.confidenceLevel * 100)}% confidence)`
            }));
            
            existingRequest.items.push(...newRequestItems);
            
            // Update history
            existingRequest.history.push({
              action: 'update',
              timestamp: new Date(),
              userId: this.SYSTEM_USER_ID,
              note: `Automatically added ${newItems.length} items based on usage forecasts`
            });
            
            await existingRequest.save();
          }
        } else {
          // Create new request
          const requestNumber = await this.generateRequestNumber(businessId);
          
          const requestItems = items.map(item => ({
            resourceItemId: item.resource._id,
            name: item.resource.name,
            type: item.resource.type,
            quantity: item.forecast.projectedQuantity,
            unitCost: item.resource.unitCost,
            totalCost: item.resource.unitCost * item.forecast.projectedQuantity,
            notes: `Forecast-based request (${Math.round(item.forecast.confidenceLevel * 100)}% confidence)`
          }));
          
          // Calculate needed by date (advance order days minus lead time)
          const leadTime = config.leadTimes?.[RequestPriority.MEDIUM] || 7;
          const neededBy = addDays(new Date(), advanceOrderDays - leadTime);
          
          const newRequest = new this.resourceRequestModel({
            businessId,
            requestNumber,
            requestedBy: this.SYSTEM_USER_ID,
            status: RequestStatus.PENDING,
            priority: RequestPriority.MEDIUM,
            source: RequestSource.PREDICTION,
            neededBy,
            items: requestItems,
            notes: `Forecast-based request for ${supplier || 'multiple suppliers'} based on projected usage`,
            metadata: {
              supplier,
              generatedBy: 'resource-request-agent',
              forecastBased: true,
              confidenceAverage: items.reduce((sum, item) => sum + item.forecast.confidenceLevel, 0) / items.length
            },
            history: [
              {
                action: 'create',
                timestamp: new Date(),
                userId: this.SYSTEM_USER_ID,
                note: 'Automatically generated based on usage forecasts'
              }
            ]
          });
          
          await newRequest.save();
          requestsCreated++;
          
          // Update forecasts
          for (const item of items) {
            await this.resourceForecastModel.findByIdAndUpdate(item.forecast._id, {
              relatedRequestId: newRequest._id,
              status: ForecastStatus.CONFIRMED
            });
          }
          
          // Send notifications
          await this.sendForecastRequestNotifications(newRequest, config);
        }
      }
      
      this.logger.log(`Created ${requestsCreated} new forecast-based requests for business ${businessId}`);
    } catch (error) {
      this.logger.error(`Error processing advance orders for business ${businessId}:`, error.stack);
    }
  }

  /**
   * Send notifications for a forecast-based request
   */
  private async sendForecastRequestNotifications(request: ResourceRequest, config: AgentConfiguration) {
    try {
      // Send to approvers
      const approverIds = config.approverUserIds || [];
      
      if (approverIds.length > 0) {
        const approvers = await this.userModel.find({
          _id: { $in: approverIds }
        });
        
        for (const approver of approvers) {
          await this.sendForecastRequestEmail(request, approver);
        }
      }
      
      // Send to inventory manager or admin
      const managerIds = config.managerUserIds || [];
      
      if (managerIds.length > 0) {
        const managers = await this.userModel.find({
          _id: { $in: managerIds }
        });
        
        for (const manager of managers) {
          await this.sendForecastRequestEmail(request, manager);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending notifications for forecast request ${request._id}:`, error.message);
    }
  }

  /**
   * Send forecast request email
   */
  private async sendForecastRequestEmail(request: ResourceRequest, user: User) {
    // Format items for email
    const itemsList = request.items.map(item => 
      `- ${item.name} (${item.quantity} ${item.unitCost ? '@ ' + item.unitCost + ' each' : ''})`
    ).join('\n');
    
    // Format needed by date
    const neededByDate = request.neededBy ? format(request.neededBy, 'MMM d, yyyy') : 'As soon as possible';
    
    const templateData = {
      userName: `${user.name} ${user.surname}`,
      requestNumber: request.requestNumber,
      requestType: 'Forecast-Based Resource Request',
      priority: request.priority,
      itemsList,
      totalItems: request.items.length,
      totalCost: request.items.reduce((sum, item) => sum + (item.totalCost || 0), 0),
      currency: '$', // Replace with actual currency
      requestUrl: `${process.env.APP_URL}/resource-requests/${request._id}`,
      neededByDate,
      confidenceLevel: Math.round((request.metadata?.confidenceAverage || 0.7) * 100)
    };
    
    await this.emailService.sendTemplateEmail(
      'Staffluent Resource Agent',
      process.env.EMAIL_FROM,
      user.email,
      `Forecast-Based Resource Request: ${request.requestNumber}`,
      'templates/resource-request/forecast-request.html',
      templateData
    );
  }

  /**
   * Get resource item by ID
   */
  async getResourceItemById(resourceId: string): Promise<ResourceItem> {
    return this.resourceItemModel.findById(resourceId);
  }

  /**
   * Get resource request by ID
   */
  async getResourceRequestById(requestId: string): Promise<ResourceRequest> {
    return this.resourceRequestModel.findById(requestId);
  }

  /**
   * Get resource forecast by ID
   */
  async getResourceForecastById(forecastId: string): Promise<ResourceForecast> {
    return this.resourceForecastModel.findById(forecastId);
  }

  /**
   * Create a resource item
   */
  async createResourceItem(itemData: Partial<ResourceItem>): Promise<ResourceItem> {
    const newItem = new this.resourceItemModel(itemData);
    return newItem.save();
  }

  /**
   * Update a resource item
   */
  async updateResourceItem(itemId: string, itemData: Partial<ResourceItem>): Promise<ResourceItem> {
    return this.resourceItemModel.findByIdAndUpdate(itemId, itemData, { new: true });
  }

  /**
   * Create a resource request manually
   */
  async createResourceRequest(requestData: Partial<ResourceRequest>): Promise<ResourceRequest> {
    // Generate request number if not provided
    if (!requestData.requestNumber) {
      requestData.requestNumber = await this.generateRequestNumber(requestData.businessId);
    }
    
    // Set default values
    requestData.source = requestData.source || RequestSource.MANUAL;
    
    // Add history entry
    requestData.history = [
      {
        action: 'create',
        timestamp: new Date(),
        userId: requestData.requestedBy,
        note: 'Request created manually'
      }
    ];
    
    const newRequest = new this.resourceRequestModel(requestData);
    return newRequest.save();
  }

  /**
   * Update a resource request
   */
  async updateResourceRequest(
    requestId: string, 
    requestData: Partial<ResourceRequest>,
    userId: string
  ): Promise<ResourceRequest> {
    const request = await this.resourceRequestModel.findById(requestId);
    
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }
    
    // Track status change for history
    const previousStatus = request.status;
    let statusChanged = false;
    
    if (requestData.status && requestData.status !== previousStatus) {
      statusChanged = true;
      
      // Handle status-specific updates
      if (requestData.status === RequestStatus.APPROVED) {
        requestData.approvedBy = userId;
        requestData.approvedAt = new Date();
      } else if (requestData.status === RequestStatus.REJECTED) {
        requestData.rejectedBy = userId;
        requestData.rejectedAt = new Date();
      }
    }
    
    // Update request
    Object.assign(request, requestData);
    
    // Add history entry
    if (!request.history) {
      request.history = [];
    }
    
    if (statusChanged) {
      request.history.push({
        action: requestData.status.toLowerCase(),
        timestamp: new Date(),
        userId,
        note: requestData.notes || `Status changed from ${previousStatus} to ${requestData.status}`,
        previousStatus,
        newStatus: requestData.status
      });
    } else {
      request.history.push({
        action: 'update',
        timestamp: new Date(),
        userId,
        note: requestData.notes || 'Request updated'
      });
    }
    
    return request.save();
  }

  /**
   * Get resources for a business with optional filters
   */
  async getBusinessResources(
    businessId: string,
    filters: {
      type?: ResourceType | ResourceType[],
      status?: ResourceStatus | ResourceStatus[],
      minQuantity?: number,
      supplier?: string
    } = {}
  ): Promise<ResourceItem[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    // Add optional filters
    if (filters.type) {
      if (Array.isArray(filters.type)) {
        query.type = { $in: filters.type };
      } else {
        query.type = filters.type;
      }
    }
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.status = { $in: filters.status };
      } else {
        query.status = filters.status;
      }
    }
    
    if (filters.minQuantity !== undefined) {
      query.currentQuantity = { $lte: filters.minQuantity };
    }
    
    if (filters.supplier) {
      query.supplier = filters.supplier;
    }
    
    return this.resourceItemModel.find(query).sort({ name: 1 });
  }

  /**
   * Get requests for a business with optional filters
   */
  async getBusinessRequests(
    businessId: string,
    filters: {
      status?: RequestStatus | RequestStatus[],
      priority?: RequestPriority | RequestPriority[],
      source?: RequestSource | RequestSource[],
      requestedBy?: string,
      startDate?: Date,
      endDate?: Date
    } = {}
  ): Promise<ResourceRequest[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    // Add optional filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.status = { $in: filters.status };
      } else {
        query.status = filters.status;
      }
    }
    
    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        query.priority = { $in: filters.priority };
      } else {
        query.priority = filters.priority;
      }
    }
    
    if (filters.source) {
      if (Array.isArray(filters.source)) {
        query.source = { $in: filters.source };
      } else {
        query.source = filters.source;
      }
    }
    
    if (filters.requestedBy) {
      query.requestedBy = filters.requestedBy;
    }
    
    // Date filters
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }
    
    return this.resourceRequestModel.find(query)
      .populate('requestedBy', 'name surname email')
      .populate('approvedBy', 'name surname email')
      .sort({ createdAt: -1 });
  }

  /**
   * Record resource usage
   */
  async recordResourceUsage(usageData: Partial<ResourceUsage>): Promise<ResourceUsage> {
    // Create usage record
    const usage = new this.resourceUsageModel(usageData);
    await usage.save();
    
    // Update resource quantity
    await this.resourceItemModel.findByIdAndUpdate(
      usageData.resourceItemId,
      { $inc: { currentQuantity: -usageData.quantity } }
    );
    
    return usage;
  }

  /**
   * Get resource usage for a business with optional filters
   */
  async getResourceUsage(
    businessId: string,
    filters: {
      resourceItemId?: string,
      userId?: string,
      clientId?: string,
      projectId?: string,
      startDate?: Date,
      endDate?: Date
    } = {}
  ): Promise<ResourceUsage[]> {
    const query: any = { businessId };
    
    // Add optional filters
    if (filters.resourceItemId) {
      query.resourceItemId = filters.resourceItemId;
    }
    
    if (filters.userId) {
      query.userId = filters.userId;
    }
    
    if (filters.clientId) {
      query.clientId = filters.clientId;
    }
    
    if (filters.projectId) {
      query.projectId = filters.projectId;
    }
    
    // Date filters
    if (filters.startDate || filters.endDate) {
      query.date = {};
      
      if (filters.startDate) {
        query.date.$gte = filters.startDate;
      }
      
      if (filters.endDate) {
        query.date.$lte = filters.endDate;
      }
    }
    
    return this.resourceUsageModel.find(query)
      .populate('resourceItemId', 'name type')
      .populate('userId', 'name surname')
      .populate('clientId', 'name')
      .sort({ date: -1 });
  }

  /**
   * Get resource forecasts for a business with optional filters
   */
  async getResourceForecasts(
    businessId: string,
    filters: {
      resourceItemId?: string,
      status?: ForecastStatus | ForecastStatus[],
      minConfidence?: number,
      startDate?: Date,
      endDate?: Date
    } = {}
  ): Promise<ResourceForecast[]> {
    const query: any = { businessId };
    
    // Add optional filters
    if (filters.resourceItemId) {
      query.resourceItemId = filters.resourceItemId;
    }
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.status = { $in: filters.status };
      } else {
        query.status = filters.status;
      }
    }
    
    if (filters.minConfidence !== undefined) {
      query.confidenceLevel = { $gte: filters.minConfidence };
    }
    
    // Date filters
    if (filters.startDate || filters.endDate) {
      query.forecastDate = {};
      
      if (filters.startDate) {
        query.forecastDate.$gte = filters.startDate;
      }
      
      if (filters.endDate) {
        query.forecastDate.$lte = filters.endDate;
      }
    }
    
    return this.resourceForecastModel.find(query)
      .populate('resourceItemId', 'name type currentQuantity minQuantity')
      .populate('relatedRequestId', 'requestNumber status')
      .sort({ forecastDate: 1 });
  }

  /**
   * Update business agent configuration
   */
  async updateBusinessConfiguration(
    businessId: string,
    config: Partial<AgentConfiguration>
  ): Promise<AgentConfiguration> {
    const existingConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'resource-request'
    });
    
    if (existingConfig) {
      // Update existing configuration
      Object.assign(existingConfig, config);
      const updatedConfig = await existingConfig.save();
      
      // Update monitoring settings if needed
      await this.updateBusinessMonitoring(businessId);
      
      return updatedConfig;
    } else {
      // Create new configuration
      const newConfig = new this.agentConfigModel({
        businessId,
        agentType: 'resource-request',
        isEnabled: true,
        ...config
      });
      
      const savedConfig = await newConfig.save();
      
      // Setup monitoring
      await this.setupBusinessResourceMonitoring(businessId);
      
      return savedConfig;
    }
  }

  /**
   * Get business agent configuration
   */
  async getBusinessConfiguration(
    businessId: string
  ): Promise<AgentConfiguration> {
    return this.agentConfigModel.findOne({
      businessId,
      agentType: 'resource-request'
    });
  }

  /**
   * Get resource optimization suggestions
   */
  async getResourceOptimizationSuggestions(
    businessId: string
  ): Promise<any[]> {
    this.logger.log(`Generating resource optimization suggestions for business ${businessId}`);
    
    try {
      // Get all resources for this business
      const resources = await this.resourceItemModel.find({
        businessId,
        isDeleted: false
      });
      
      // Get historical usage data (last 90 days)
      const now = new Date();
      const startDate = subDays(now, 90);
      
      const usageData = await this.resourceUsageModel.find({
        businessId,
        date: { $gte: startDate, $lte: now }
      });
      
      // Get pending requests
      const pendingRequests = await this.resourceRequestModel.find({
        businessId,
        status: { $in: [RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.ORDERED] }
      });
      
      // Generate optimization suggestions
      const suggestions = [];
      
      // Check for overstock items
      for (const resource of resources) {
        if (!resource.minQuantity || !resource.maxQuantity) {
          continue; // Skip resources without defined thresholds
        }
        
        // Get usage data for this resource
        const resourceUsage = usageData.filter(usage => 
          usage.resourceItemId.toString() === resource._id.toString()
        );
        
        // Skip resources with no usage data
        if (resourceUsage.length === 0) {
          continue;
        }
        
        // Calculate average daily usage
        const totalUsage = resourceUsage.reduce((sum, usage) => sum + usage.quantity, 0);
        const daysInPeriod = differenceInDays(now, startDate) || 1; // Avoid division by zero
        const dailyUsage = totalUsage / daysInPeriod;
        
        // Check if current stock level is excessive
        if (resource.currentQuantity > resource.maxQuantity) {
          suggestions.push({
            type: 'overstock',
            resourceId: resource._id,
            resourceName: resource.name,
            currentQuantity: resource.currentQuantity,
            recommendedMaximum: resource.maxQuantity,
            excessQuantity: resource.currentQuantity - resource.maxQuantity,
            reason: 'Current stock exceeds maximum threshold',
            suggestedAction: 'Reduce inventory levels',
            priority: 'medium',
            estimatedSavings: (resource.currentQuantity - resource.maxQuantity) * (resource.unitCost || 0)
          });
        }
        
        // Check stock turnover rate
        if (dailyUsage > 0) {
          const daysOfSupply = resource.currentQuantity / dailyUsage;
          
          // Check if stock will last more than 90 days
          if (daysOfSupply > 90 && resource.currentQuantity > resource.minQuantity * 2) {
            suggestions.push({
              type: 'slow_turnover',
              resourceId: resource._id,
              resourceName: resource.name,
              currentQuantity: resource.currentQuantity,
              dailyUsage: dailyUsage.toFixed(2),
              daysOfSupply: Math.round(daysOfSupply),
              reason: 'Current stock will last more than 90 days',
              suggestedAction: 'Consider reducing reorder quantities',
              priority: 'low',
              estimatedSavings: 'Improved cash flow and reduced storage costs'
            });
          }
          
          // Check if stock turnover is too fast (less than 7 days)
          if (daysOfSupply < 7 && resource.currentQuantity < resource.minQuantity * 2) {
            suggestions.push({
              type: 'fast_turnover',
              resourceId: resource._id,
              resourceName: resource.name,
              currentQuantity: resource.currentQuantity,
              dailyUsage: dailyUsage.toFixed(2),
              daysOfSupply: Math.round(daysOfSupply),
              reason: 'Current stock will be depleted in less than 7 days',
              suggestedAction: 'Consider increasing reorder quantities or buffer stock',
              priority: 'high',
              estimatedSavings: 'Reduced risk of stockouts and emergency orders'
            });
          }
        }
        
        // Check for inactive resources (no usage in 60 days)
        const latestUsage = resourceUsage.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
        
        if (latestUsage && differenceInDays(now, latestUsage.date) > 60 && resource.currentQuantity > 0) {
          suggestions.push({
            type: 'inactive',
            resourceId: resource._id,
            resourceName: resource.name,
            currentQuantity: resource.currentQuantity,
            lastUsed: latestUsage.date,
            daysSinceLastUse: differenceInDays(now, latestUsage.date),
            reason: 'Resource has not been used in over 60 days',
            suggestedAction: 'Consider reducing stock or repurposing',
            priority: 'medium',
            estimatedSavings: resource.currentQuantity * (resource.unitCost || 0)
          });
        }
      }
      
      // Check for duplicate or similar requests
      const requestsBySupplier: Record<string, ResourceRequest[]> = {};
      
      for (const request of pendingRequests) {
        // Extract supplier from metadata or items
        let supplier = request.metadata?.supplier;
        
        if (!supplier && request.items.length > 0 && request.items[0].resourceItemId) {
          const resource = await this.resourceItemModel.findById(request.items[0].resourceItemId);
          supplier = resource?.supplier || 'unknown';
        }
        
        if (!requestsBySupplier[supplier]) {
          requestsBySupplier[supplier] = [];
        }
        
        requestsBySupplier[supplier].push(request);
      }
      
      // Check for consolidation opportunities
      for (const [supplier, requests] of Object.entries(requestsBySupplier)) {
        if (requests.length > 1) {
          suggestions.push({
            type: 'consolidate_orders',
            supplier,
            requestCount: requests.length,
            requestIds: requests.map(r => r._id),
            requestNumbers: requests.map(r => r.requestNumber),
            reason: `Multiple pending orders (${requests.length}) for the same supplier`,
            suggestedAction: 'Consider consolidating orders to reduce shipping costs',
            priority: 'medium',
            estimatedSavings: 'Reduced shipping and handling fees'
          });
        }
      }
      
      return suggestions;
    } catch (error) {
      this.logger.error(`Error generating optimization suggestions for business ${businessId}:`, error.stack);
      return [];
    }
  }

  /**
   * Run a manual inventory check
   */
  async runManualInventoryCheck(businessId: string): Promise<number> {
    await this.checkInventoryLevels(businessId);
    
    // Return count of low inventory items
    const lowInventoryCount = await this.resourceItemModel.countDocuments({
      businessId,
      isDeleted: false,
      currentQuantity: { $lte: { $ref: 'minQuantity' } }
    });
    
    return lowInventoryCount;
  }

  /**
   * Run a manual forecast update
   */
  async runManualForecastUpdate(businessId: string): Promise<number> {
    await this.generateResourceForecasts(businessId);
    
    // Return count of forecasts
    const forecastCount = await this.resourceForecastModel.countDocuments({
      businessId,
      status: ForecastStatus.PROJECTED
    });
    
    return forecastCount;
  }

  /**
   * Get resource inventory summary
   */
  async getResourceInventorySummary(businessId: string): Promise<any> {
    // Get all resources for this business
    const resources = await this.resourceItemModel.find({
      businessId,
      isDeleted: false
    });
    
    // Count by status
    const statusCounts = {};
    for (const status of Object.values(ResourceStatus)) {
      statusCounts[status] = resources.filter(r => r.status === status).length;
    }
    
    // Count by type
    const typeCounts = {};
    for (const type of Object.values(ResourceType)) {
      typeCounts[type] = resources.filter(r => r.type === type).length;
    }
    
    // Count critical inventory levels
    const criticalItems = resources.filter(r => 
      r.minQuantity !== undefined && 
      r.currentQuantity <= r.minQuantity
    );
    
    const warningItems = resources.filter(r => 
      r.minQuantity !== undefined && 
      r.currentQuantity > r.minQuantity &&
      r.currentQuantity < r.minQuantity * 1.5
    );
    
    // Calculate total inventory value
    const totalValue = resources.reduce((sum, r) => 
      sum + ((r.currentQuantity || 0) * (r.unitCost || 0)), 0
    );
    
    // Get recently requested items
    const recentRequests = await this.resourceRequestModel.find({
      businessId,
      isDeleted: false
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('requestedBy', 'name surname');
    
    // Get upcoming deliveries
    const upcomingDeliveries = await this.resourceRequestModel.find({
      businessId,
      status: RequestStatus.ORDERED,
      'fulfillment.expectedDelivery': { $exists: true }
    })
    .sort({ 'fulfillment.expectedDelivery': 1 })
    .limit(5);
    
    return {
      totalResources: resources.length,
      byStatus: statusCounts,
      byType: typeCounts,
      inventoryLevels: {
        critical: criticalItems.length,
        warning: warningItems.length,
        healthy: resources.length - criticalItems.length - warningItems.length
      },
      totalValue,
      // In the getResourceInventorySummary method
      recentRequests: recentRequests.map(r => {
        // Define a type for the populated requestedBy
        interface UserDoc {
          name: string;
          surname: string;
        }
        
        let requestedByText = 'System';
        
        // Check if requestedBy exists AND is an object
        if (r.requestedBy && typeof r.requestedBy === 'object') {
          // Use type assertion to tell TypeScript this is a UserDoc
          const user = r.requestedBy as UserDoc;
          if (user.name && user.surname) {
            requestedByText = `${user.name} ${user.surname}`;
          }
        }
        
        return {
          id: r._id,
          requestNumber: r.requestNumber,
          status: r.status,
          itemCount: r.items.length,
          requestedBy: requestedByText,
          createdAt: (r as any).createdAt // Cast to any to bypass the createdAt TypeScript error
        };
      }),
      upcomingDeliveries: upcomingDeliveries.map(r => ({
        id: r._id,
        requestNumber: r.requestNumber,
        itemCount: r.items.length,
        expectedDelivery: r.fulfillment?.expectedDelivery,
        supplier: r.fulfillment?.supplier || r.metadata?.supplier || 'Unknown'
      }))
    };
  }
}