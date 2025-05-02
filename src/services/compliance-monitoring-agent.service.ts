// src/services/compliance-monitoring-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { StaffCertification, CertificationStatus } from '../schemas/staff-certification.schema';
import { ComplianceRule, RuleType, RuleSeverity } from '../schemas/compliance-rule.schema';
import { ComplianceAlert, AlertType, AlertStatus } from '../schemas/compliance-alert.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import { CronJob } from 'cron';
import { addDays, isPast, isFuture, differenceInDays } from 'date-fns';

@Injectable()
export class ComplianceMonitoringAgentService {
  private readonly logger = new Logger(ComplianceMonitoringAgentService.name);
  private businessCronJobs: Map<string, CronJob> = new Map();

  constructor(
    @InjectModel(StaffCertification.name) private certificationModel: Model<StaffCertification>,
    @InjectModel(ComplianceRule.name) private ruleModel: Model<ComplianceRule>,
    @InjectModel(ComplianceAlert.name) private alertModel: Model<ComplianceAlert>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Initialize custom cron jobs for businesses
    this.initializeBusinessCronJobs();
  }

  /**
   * Get certification by ID
   */
  async getCertificationById(certificationId: string): Promise<StaffCertification> {
    return this.certificationModel.findById(certificationId);
  }

  /**
   * Get rule by ID
   */
  async getRuleById(ruleId: string): Promise<ComplianceRule> {
    return this.ruleModel.findById(ruleId);
  }

  /**
   * Get alert by ID
   */
  async getAlertById(alertId: string): Promise<ComplianceAlert> {
    return this.alertModel.findById(alertId);
  }

  /**
   * Initialize cron jobs for each business with the compliance-monitoring agent enabled
   */
  private async initializeBusinessCronJobs() {
    try {
      // Get all enabled compliance-monitoring agent configurations
      const enabledConfigs = await this.agentConfigModel.find({
        agentType: 'compliance-monitoring',
        isEnabled: true
      });

      for (const config of enabledConfigs) {
        this.setupBusinessCronJob(config.businessId, config.monitoringFrequency || 24);
      }

      this.logger.log(`Initialized ${enabledConfigs.length} business-specific compliance monitoring cron jobs`);
    } catch (error) {
      this.logger.error('Failed to initialize business compliance monitoring cron jobs', error.stack);
    }
  }

  /**
   * Setup a cron job for a specific business
   */
  private setupBusinessCronJob(businessId: string, frequencyHours: number) {
    // Create a unique name for this cron job
    const jobName = `compliance-monitoring-${businessId}`;

    // Remove existing job if it exists
    try {
      const existingJob = this.schedulerRegistry.getCronJob(jobName);
      if (existingJob) {
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`Removed existing cron job: ${jobName}`);
      }
    } catch (error) {
      // Job doesn't exist, which is fine
    }

    // Create new cron expression based on frequency
    // Run every X hours (default to daily if not specified)
    const cronExpression = frequencyHours === 24 ? 
      '0 0 * * *' :  // Daily at midnight
      `0 */${Math.min(23, Math.max(1, frequencyHours))} * * *`; // Every X hours

    // Create and register new cron job
    const job = new CronJob(cronExpression, () => {
      this.processBusinessCompliance(businessId);
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();

    // Store job reference
    this.businessCronJobs.set(businessId, job);
    this.logger.log(`Setup compliance monitoring cron job for business ${businessId} with frequency: ${frequencyHours} hours`);
  }

  /**
   * Update or create cron job for a business when configuration changes
   */
  async updateBusinessCronJob(businessId: string) {
    try {
      // Get latest configuration
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: 'compliance-monitoring'
      });

      if (!config || !config.isEnabled) {
        // Configuration doesn't exist or is disabled - remove job if it exists
        const jobName = `compliance-monitoring-${businessId}`;
        try {
          this.schedulerRegistry.deleteCronJob(jobName);
          this.businessCronJobs.delete(businessId);
          this.logger.log(`Removed compliance monitoring cron job for business ${businessId}`);
        } catch (error) {
          // Job doesn't exist, which is fine
        }
        return;
      }

      // Setup/update cron job with latest frequency
      this.setupBusinessCronJob(businessId, config.monitoringFrequency || 24);
    } catch (error) {
      this.logger.error(`Failed to update compliance monitoring cron job for business ${businessId}`, error.stack);
    }
  }

  /**
   * Daily cron job that processes certification expirations
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processCertificationExpirations() {
    this.logger.log('Processing certification expirations...');
    
    // Find all active businesses with compliance-monitoring enabled
    const enabledBusinessIds = await this.agentConfigModel.find({
      agentType: 'compliance-monitoring',
      isEnabled: true
    }).distinct('businessId');
    
    // Process certifications for each business
    for (const businessId of enabledBusinessIds) {
      await this.processBusinessCertifications(businessId);
    }
  }

  /**
   * Main compliance monitoring job that runs for each business
   */
  async processBusinessCompliance(businessId: string) {
    this.logger.log(`Processing compliance for business ${businessId}...`);
    
    // Check if agent is enabled for this business
    const hasAccess = await this.agentPermissionService.hasAgentAccess(businessId, 'compliance-monitoring');
    
    if (!hasAccess) {
      this.logger.warn(`Compliance monitoring agent not enabled for business ${businessId}`);
      return;
    }
    
    // Get agent configuration
    const agentConfig = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'compliance-monitoring'
    });
    
    // Process certifications
    await this.processBusinessCertifications(businessId);
    
    // Process compliance rules
    await this.processBusinessRules(businessId, agentConfig);
  }

  /**
   * Process all certifications for a business
   */
  private async processBusinessCertifications(businessId: string) {
    // Get configuration
    const config = await this.agentConfigModel.findOne({
      businessId,
      agentType: 'compliance-monitoring'
    });
    
    const warningDays = config?.certificationWarningDays || 30; // Default to 30 days warning
    
    // Find all active certifications for this business
    const activeCertifications = await this.certificationModel.find({
      businessId,
      status: { $in: [CertificationStatus.ACTIVE, CertificationStatus.EXPIRING_SOON] },
      isDeleted: false
    });
    
    this.logger.log(`Processing ${activeCertifications.length} certifications for business ${businessId}`);
    
    const now = new Date();
    const warningDate = addDays(now, warningDays);
    
    for (const cert of activeCertifications) {
      // Check if expired
      if (isPast(cert.expiryDate)) {
        // Update certificate status
        await this.certificationModel.findByIdAndUpdate(cert._id, {
          status: CertificationStatus.EXPIRED
        });
        
        // Create alert for expired certification
        await this.createCertificationExpiryAlert(cert, businessId, true);
      }
      // Check if expiring soon
      else if (cert.expiryDate <= warningDate && cert.status !== CertificationStatus.EXPIRING_SOON) {
        // Update certificate status
        await this.certificationModel.findByIdAndUpdate(cert._id, {
          status: CertificationStatus.EXPIRING_SOON
        });
        
        // Create alert for expiring certification
        await this.createCertificationExpiryAlert(cert, businessId, false);
      }
    }
  }

  /**
   * Create an alert for an expired or expiring certification
   */
  private async createCertificationExpiryAlert(
    certification: StaffCertification, 
    businessId: string, 
    isExpired: boolean
  ) {
    // Check if an alert already exists
    const existingAlert = await this.alertModel.findOne({
      businessId,
      userId: certification.userId,
      type: AlertType.CERTIFICATION_EXPIRY,
      'relatedData.certificationId': certification._id,
      status: { $in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] }
    });
    
    if (existingAlert) {
      // Update existing alert if status changed
      if (isExpired && existingAlert.severity !== RuleSeverity.HIGH) {
        await this.alertModel.findByIdAndUpdate(existingAlert._id, {
          severity: RuleSeverity.HIGH,
          title: `EXPIRED: ${certification.name} certification`,
          description: `${certification.name} certification has expired on ${certification.expiryDate.toLocaleDateString()}. Staff member cannot be assigned to tasks requiring this certification.`
        });
      }
      return;
    }
    
    // Get user details
    const user = await this.userModel.findById(certification.userId);
    
    if (!user) {
      this.logger.warn(`User not found for certification ${certification._id}`);
      return;
    }
    
    // Create new alert
    const alertData = {
      businessId,
      userId: certification.userId,
      type: AlertType.CERTIFICATION_EXPIRY,
      title: isExpired ? 
        `EXPIRED: ${certification.name} certification` : 
        `EXPIRING SOON: ${certification.name} certification`,
      description: isExpired ?
        `${certification.name} certification for ${user.name} ${user.surname} has expired on ${certification.expiryDate.toLocaleDateString()}. Staff member cannot be assigned to tasks requiring this certification.` :
        `${certification.name} certification for ${user.name} ${user.surname} will expire on ${certification.expiryDate.toLocaleDateString()} (${differenceInDays(certification.expiryDate, new Date())} days remaining). Please ensure timely renewal.`,
      severity: isExpired ? RuleSeverity.HIGH : RuleSeverity.MEDIUM,
      status: AlertStatus.ACTIVE,
      dueDate: isExpired ? new Date() : certification.expiryDate,
      relatedData: {
        certificationId: certification._id,
        certificateName: certification.name,
        expiryDate: certification.expiryDate,
        userName: `${user.name} ${user.surname}`,
        userEmail: user.email
      }
    };
    
    const newAlert = new this.alertModel(alertData);
    await newAlert.save();
    
    this.logger.log(`Created certification ${isExpired ? 'expiry' : 'expiring soon'} alert for user ${user.name} ${user.surname}`);
  }

  /**
   * Process all compliance rules for a business
   */
  private async processBusinessRules(businessId: string, agentConfig: AgentConfiguration) {
    // Find all active rules for this business
    const activeRules = await this.ruleModel.find({
      businessId,
      isActive: true,
      isDeleted: false
    });
    
    this.logger.log(`Processing ${activeRules.length} compliance rules for business ${businessId}`);
    
    for (const rule of activeRules) {
      await this.processComplianceRule(rule, businessId, agentConfig);
    }
  }

  /**
   * Process a specific compliance rule
   */
  private async processComplianceRule(
    rule: ComplianceRule, 
    businessId: string, 
    agentConfig: AgentConfiguration
  ) {
    try {
      switch (rule.type) {
        case RuleType.CERTIFICATION_REQUIREMENT:
          await this.processCertificationRequirementRule(rule, businessId);
          break;
        case RuleType.MAXIMUM_HOURS:
          await this.processMaximumHoursRule(rule, businessId);
          break;
        case RuleType.REQUIRED_REST:
          await this.processRequiredRestRule(rule, businessId);
          break;
        // Add other rule type processors as needed
        default:
          this.logger.log(`Rule type ${rule.type} not implemented yet`);
      }
    } catch (error) {
      this.logger.error(`Error processing rule ${rule._id}: ${error.message}`, error.stack);
    }
  }

  /**
   * Process certification requirement rule
   */
  private async processCertificationRequirementRule(rule: ComplianceRule, businessId: string) {
    // This would check if all staff have required certifications
    // Implementation depends on your specific requirements
    
    // Example implementation:
    if (!rule.requiredCertifications || rule.requiredCertifications.length === 0) {
      return;
    }
    
    // Get all staff for this business
    const businessStaff = await this.userModel.find({
      businessId,
      isDeleted: false,
      // Additional filters as needed
    });
    
    for (const staff of businessStaff) {
      // Check if staff has all required certifications
      for (const certName of rule.requiredCertifications) {
        const hasCert = await this.certificationModel.findOne({
          userId: staff._id,
          businessId,
          name: certName,
          status: { $in: [CertificationStatus.ACTIVE, CertificationStatus.EXPIRING_SOON] },
          isDeleted: false
        });
        
        if (!hasCert) {
          // Create missing certification alert
          await this.createMissingCertificationAlert(staff, certName, rule, businessId);
        }
      }
    }
  }

  /**
   * Create an alert for missing certification
   */
  private async createMissingCertificationAlert(
    user: User,
    certificationName: string,
    rule: ComplianceRule,
    businessId: string
  ) {
    // Check if an alert already exists
    const existingAlert = await this.alertModel.findOne({
      businessId,
      userId: user._id,
      type: AlertType.MISSING_CERTIFICATION,
      'relatedData.certificationName': certificationName,
      'relatedData.ruleId': rule._id,
      status: { $in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] }
    });
    
    if (existingAlert) {
      return; // Alert already exists
    }
    
    // Create new alert
    const alertData = {
      businessId,
      userId: user._id,
      ruleId: rule._id,
      type: AlertType.MISSING_CERTIFICATION,
      title: `Missing Required Certification: ${certificationName}`,
      description: `${user.name} ${user.surname} is missing the required "${certificationName}" certification needed for compliance with "${rule.name}" rule.`,
      severity: rule.severity,
      status: AlertStatus.ACTIVE,
      relatedData: {
        certificationName,
        ruleId: rule._id,
        ruleName: rule.name,
        userName: `${user.name} ${user.surname}`,
        userEmail: user.email
      }
    };
    
    const newAlert = new this.alertModel(alertData);
    await newAlert.save();
    
    this.logger.log(`Created missing certification alert for user ${user.name} ${user.surname}`);
  }

  /**
   * Process maximum hours rule
   */
  private async processMaximumHoursRule(rule: ComplianceRule, businessId: string) {
    // Implementation would check staff hours against maximum allowed
    // This is a placeholder - actual implementation would depend on your schedule/hours data structure
    
    if (!rule.maxWeeklyHours) {
      return;
    }
    
    // You would typically query your scheduling system to get current hours
    // This is a simplified example
    const businessStaff = await this.userModel.find({
      businessId,
      isDeleted: false,
      // Additional filters as needed
    });
    
    for (const staff of businessStaff) {
      // Logic to check weekly hours would go here
      // For example, query your shift/timesheet data and calculate total hours
      
      // Placeholder for example:
      const weeklyHours = 0; // Replace with actual calculation
      
      if (weeklyHours > rule.maxWeeklyHours) {
        await this.createHoursViolationAlert(staff, weeklyHours, rule, businessId);
      }
    }
  }

  /**
   * Process required rest rule
   */
  private async processRequiredRestRule(rule: ComplianceRule, businessId: string) {
    // Implementation would check if staff have adequate rest between shifts
    // This is a placeholder - actual implementation would depend on your schedule data structure
    
    if (!rule.requiredRestHoursBetweenShifts) {
      return;
    }
    
    // Logic to check rest periods between shifts would go here
    // This would involve analyzing your shift schedule data
  }

  /**
   * Create an alert for hours violation
   */
  private async createHoursViolationAlert(
    user: User,
    currentHours: number,
    rule: ComplianceRule,
    businessId: string
  ) {
    // Check if an alert already exists
    const existingAlert = await this.alertModel.findOne({
      businessId,
      userId: user._id,
      type: AlertType.HOURS_VIOLATION,
      'relatedData.ruleId': rule._id,
      status: { $in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] }
    });
    
    if (existingAlert) {
      // Update existing alert if hours changed significantly
      if (Math.abs(existingAlert.relatedData.currentHours - currentHours) > 1) {
        await this.alertModel.findByIdAndUpdate(existingAlert._id, {
          'relatedData.currentHours': currentHours,
          description: `${user.name} ${user.surname} is scheduled for ${currentHours} hours this week, which exceeds the maximum ${rule.maxWeeklyHours} hours limit.`
        });
      }
      return;
    }
    
    // Create new alert
    const alertData = {
      businessId,
      userId: user._id,
      ruleId: rule._id,
      type: AlertType.HOURS_VIOLATION,
      title: `Maximum Weekly Hours Exceeded`,
      description: `${user.name} ${user.surname} is scheduled for ${currentHours} hours this week, which exceeds the maximum ${rule.maxWeeklyHours} hours limit.`,
      severity: rule.severity,
      status: AlertStatus.ACTIVE,
      relatedData: {
        ruleId: rule._id,
        ruleName: rule.name,
        maxHours: rule.maxWeeklyHours,
        currentHours: currentHours,
        userName: `${user.name} ${user.surname}`,
        userEmail: user.email
      }
    };
    
    const newAlert = new this.alertModel(alertData);
    await newAlert.save();
    
    this.logger.log(`Created hours violation alert for user ${user.name} ${user.surname}`);
  }

  /**
   * Get all active alerts for a business with optional filters
   */
  async getBusinessAlerts(
    businessId: string,
    filters: {
      status?: AlertStatus,
      severity?: RuleSeverity,
      type?: AlertType,
      userId?: string
    } = {}
  ): Promise<ComplianceAlert[]> {
    const query: any = { 
      businessId,
      // By default, only return active and acknowledged alerts
      status: { $in: filters.status ? [filters.status] : [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] }
    };
    
    // Add optional filters
    if (filters.severity) query.severity = filters.severity;
    if (filters.type) query.type = filters.type;
    if (filters.userId) query.userId = filters.userId;
    
    return this.alertModel.find(query)
      .populate('userId', 'name surname email')
      .sort({ severity: -1, createdAt: -1 });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<ComplianceAlert> {
    const alert = await this.alertModel.findById(alertId);
    
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    if (alert.status !== AlertStatus.ACTIVE) {
      throw new Error(`Alert is already ${alert.status}`);
    }
    
    return this.alertModel.findByIdAndUpdate(
      alertId,
      {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      },
      { new: true }
    );
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, notes: string): Promise<ComplianceAlert> {
    const alert = await this.alertModel.findById(alertId);
    
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    if (alert.status === AlertStatus.RESOLVED) {
      throw new Error('Alert is already resolved');
    }
    
    return this.alertModel.findByIdAndUpdate(
      alertId,
      {
        status: AlertStatus.RESOLVED,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes
      },
      { new: true }
    );
  }

 // src/services/compliance-monitoring-agent.service.ts (continued)
  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, userId: string, reason: string): Promise<ComplianceAlert> {
    const alert = await this.alertModel.findById(alertId);
    
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    if (alert.status === AlertStatus.DISMISSED) {
      throw new Error('Alert is already dismissed');
    }
    
    return this.alertModel.findByIdAndUpdate(
      alertId,
      {
        status: AlertStatus.DISMISSED,
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: `Dismissed: ${reason}`
      },
      { new: true }
    );
  }

  /**
   * Create staff certification
   */
  async createCertification(certData: Partial<StaffCertification>): Promise<StaffCertification> {
    const newCert = new this.certificationModel(certData);
    return newCert.save();
  }

  /**
   * Update staff certification
   */
  async updateCertification(certId: string, certData: Partial<StaffCertification>): Promise<StaffCertification> {
    return this.certificationModel.findByIdAndUpdate(certId, certData, { new: true });
  }

  /**
   * Get staff certifications
   */
  async getStaffCertifications(
    userId: string,
    businessId: string,
    includeExpired: boolean = false
  ): Promise<StaffCertification[]> {
    const query: any = {
      userId,
      businessId,
      isDeleted: false
    };
    
    if (!includeExpired) {
      query.status = { $ne: CertificationStatus.EXPIRED };
    }
    
    return this.certificationModel.find(query).sort({ expiryDate: 1 });
  }

  /**
   * Create compliance rule
   */
  async createRule(ruleData: Partial<ComplianceRule>): Promise<ComplianceRule> {
    const newRule = new this.ruleModel(ruleData);
    return newRule.save();
  }

  /**
   * Update compliance rule
   */
  async updateRule(ruleId: string, ruleData: Partial<ComplianceRule>): Promise<ComplianceRule> {
    return this.ruleModel.findByIdAndUpdate(ruleId, ruleData, { new: true });
  }

  /**
   * Get business compliance rules
   */
  async getBusinessRules(
    businessId: string,
    includeInactive: boolean = false
  ): Promise<ComplianceRule[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    return this.ruleModel.find(query).sort({ type: 1, name: 1 });
  }

  /**
   * Delete certification (soft delete)
   */
  async deleteCertification(certId: string): Promise<StaffCertification> {
    return this.certificationModel.findByIdAndUpdate(
      certId,
      {
        isDeleted: true
      },
      { new: true }
    );
  }

  /**
   * Delete compliance rule (soft delete)
   */
  async deleteRule(ruleId: string): Promise<ComplianceRule> {
    return this.ruleModel.findByIdAndUpdate(
      ruleId,
      {
        isDeleted: true
      },
      { new: true }
    );
  }

  /**
   * Run a manual compliance check for a specific business
   */
  async runManualComplianceCheck(businessId: string): Promise<number> {
    await this.processBusinessCompliance(businessId);
    
    // Return count of active alerts
    const alertCount = await this.alertModel.countDocuments({
      businessId,
      status: AlertStatus.ACTIVE
    });
    
    return alertCount;
  }

  /**
   * Get compliance summary for a business
   */
  async getComplianceSummary(businessId: string): Promise<any> {
    const alertsByStatus = await this.alertModel.aggregate([
      { $match: { businessId, status: { $ne: AlertStatus.DISMISSED } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const alertsBySeverity = await this.alertModel.aggregate([
      { $match: { businessId, status: { $in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);
    
    const certsByStatus = await this.certificationModel.aggregate([
      { $match: { businessId, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Get expiring certifications for the next 90 days
    const nextThreeMonths = addDays(new Date(), 90);
    const expiringCerts = await this.certificationModel.find({
      businessId,
      status: { $in: [CertificationStatus.ACTIVE, CertificationStatus.EXPIRING_SOON] },
      expiryDate: { $lte: nextThreeMonths },
      isDeleted: false
    }).sort({ expiryDate: 1 }).limit(10)
    .populate('userId', 'name surname');
    
    // Format the certification data
    const upcomingExpirations = expiringCerts.map(cert => ({
      id: cert._id,
      name: cert.name,
      staffName: cert.userId ? `${cert.userId.name} ${cert.userId.surname}` : 'Unknown',
      expiryDate: cert.expiryDate,
      daysRemaining: differenceInDays(cert.expiryDate, new Date())
    }));
    
    // Convert aggregation results to simple objects
    const alertStatusCount = alertsByStatus.reduce((obj, item) => {
      obj[item._id] = item.count;
      return obj;
    }, { active: 0, acknowledged: 0, resolved: 0 });
    
    const alertSeverityCount = alertsBySeverity.reduce((obj, item) => {
      obj[item._id] = item.count;
      return obj;
    }, { low: 0, medium: 0, high: 0, critical: 0 });
    
    const certStatusCount = certsByStatus.reduce((obj, item) => {
      obj[item._id] = item.count;
      return obj;
    }, { active: 0, expiring_soon: 0, expired: 0, pending: 0 });
    
    return {
      alerts: {
        byStatus: alertStatusCount,
        bySeverity: alertSeverityCount,
        total: Object.values(alertStatusCount).reduce((a, b) => a + b, 0)
      },
      certifications: {
        byStatus: certStatusCount,
        total: Object.values(certStatusCount).reduce((a, b) => a + b, 0),
        upcomingExpirations
      }
    };
  }
}