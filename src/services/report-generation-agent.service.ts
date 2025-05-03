// src/services/report-generation-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ReportTemplate, ReportScheduleType, ReportFormat, ReportDataSource } from '../schemas/report-template.schema';
import { GeneratedReport, ReportStatus } from '../schemas/generated-report.schema';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { AgentPermissionService } from './agent-permission.service';
import { CronJob } from 'cron';
import { format, subDays, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import { EmailService } from '../services/email.service';



@Injectable()
export class ReportGenerationAgentService {
  private readonly logger = new Logger(ReportGenerationAgentService.name);
  private businessCronJobs: Map<string, CronJob[]> = new Map();
  private emailTransporter: any;

  constructor(
    @InjectModel(ReportTemplate.name) private templateModel: Model<ReportTemplate>,
    @InjectModel(GeneratedReport.name) private reportModel: Model<GeneratedReport>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
    private readonly agentPermissionService: AgentPermissionService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService
  ) {
    // Initialize scheduled reports
    this.initializeScheduledReports();
  }

  /**
   * Initialize scheduled reports for all businesses
   */
  private async initializeScheduledReports() {
    try {
      // Get all businesses with report-generation enabled
      const enabledBusinessIds = await this.agentConfigModel.find({
        agentType: 'report-generation',
        isEnabled: true
      }).distinct('businessId');
      
      for (const businessId of enabledBusinessIds) {
        await this.setupBusinessReportSchedules(businessId);
      }
      
      this.logger.log(`Initialized report schedules for ${enabledBusinessIds.length} businesses`);
    } catch (error) {
      this.logger.error('Failed to initialize scheduled reports', error.stack);
    }
  }

  /**
   * Setup report schedules for a specific business
   */
  private async setupBusinessReportSchedules(businessId: string) {
    // Clear any existing jobs for this business
    this.clearBusinessJobs(businessId);
    
    // Get all active report templates for this business
    const templates = await this.templateModel.find({
      businessId,
      isActive: true,
      isDeleted: false
    });
    
    const jobs: CronJob[] = [];
    
    for (const template of templates) {
      const cronExpression = this.getCronExpressionForTemplate(template);
      
      if (cronExpression) {
        const jobName = `report-${template._id}`;
        
        const job = new CronJob(cronExpression, () => {
            this.generateReportFromTemplate(template._id.toString());
        });
        
        try {
          this.schedulerRegistry.addCronJob(jobName, job);
          job.start();
          jobs.push(job);
          
          this.logger.log(`Scheduled report "${template.name}" for business ${businessId} with cron: ${cronExpression}`);
        } catch (error) {
          this.logger.error(`Failed to schedule report "${template.name}"`, error.stack);
        }
      }
    }
    
    // Store jobs for this business
    this.businessCronJobs.set(businessId, jobs);
    
    return jobs.length;
  }

  /**
   * Clear existing cron jobs for a business
   */
  private clearBusinessJobs(businessId: string) {
    const existingJobs = this.businessCronJobs.get(businessId) || [];
    
    for (const job of existingJobs) {
      job.stop();
    }
    
    this.businessCronJobs.delete(businessId);
  }

  /**
   * Get cron expression for a report template
   */
  private getCronExpressionForTemplate(template: ReportTemplate): string {
    const config = template.scheduleConfig;
    
    if (!config) {
      return null;
    }
    
    // Use custom cron if specified
    if (config.customCron) {
      return config.customCron;
    }
    
    const minute = config.minute || 0;
    const hour = config.hour || 0;
    
    switch (template.scheduleType) {
      case ReportScheduleType.DAILY:
        return `${minute} ${hour} * * *`;
        
      case ReportScheduleType.WEEKLY:
        const dayOfWeek = config.dayOfWeek !== undefined ? config.dayOfWeek : 1; // Default to Monday
        return `${minute} ${hour} * * ${dayOfWeek}`;
        
      case ReportScheduleType.MONTHLY:
        const dayOfMonth = config.dayOfMonth || 1; // Default to 1st of month
        return `${minute} ${hour} ${dayOfMonth} * *`;
        
      case ReportScheduleType.QUARTERLY:
        // Run on 1st day of Jan, Apr, Jul, Oct
        return `${minute} ${hour} 1 1,4,7,10 *`;
        
      default:
        return null;
    }
  }

  /**
   * Generate a report from template
   */
  async generateReportFromTemplate(templateId: string): Promise<GeneratedReport> {
    try {
      // Get template
      const template = await this.templateModel.findById(templateId);
      
      if (!template || !template.isActive || template.isDeleted) {
        throw new Error(`Template ${templateId} is not active or not found`);
      }
      
      // Check if business has access to report-generation agent
      const hasAccess = await this.agentPermissionService.hasAgentAccess(template.businessId, 'report-generation');
      
      if (!hasAccess) {
        throw new Error(`Business ${template.businessId} does not have access to report-generation agent`);
      }
      
      // Create new report record
      const reportRecord = new this.reportModel({
        businessId: template.businessId,
        templateId: template._id,
        name: template.name,
        format: template.format,
        status: ReportStatus.PROCESSING,
        recipientEmails: template.recipientEmails,
        startDate: this.getReportStartDate(template),
        endDate: new Date(),
        generatedAt: new Date()
      });
      
      await reportRecord.save();
      
      // Fetch data for report
      const reportData = await this.fetchReportData(template);
      
      // Generate the report file
      const { filePath, fileUrl, fileSize } = await this.createReportFile(reportRecord, template, reportData);
      
      // Update report record
      reportRecord.status = ReportStatus.COMPLETED;
      reportRecord.filePath = filePath;
      reportRecord.fileUrl = fileUrl;
      reportRecord.fileSize = fileSize;
      reportRecord.reportData = reportData;
      
      await reportRecord.save();
      
      // Send report to recipients if configured
      if (template.recipientEmails && template.recipientEmails.length > 0) {
        await this.sendReportEmail(reportRecord, template);
        
        reportRecord.status = ReportStatus.DISTRIBUTED;
        reportRecord.sentAt = [new Date()];
        await reportRecord.save();
      }
      
      this.logger.log(`Generated report "${template.name}" for business ${template.businessId}`);
      
      return reportRecord;
    } catch (error) {
      this.logger.error(`Failed to generate report from template ${templateId}`, error.stack);
      
      // Update report record with error
      await this.reportModel.findOneAndUpdate(
        { templateId },
        {
          status: ReportStatus.FAILED,
          errorDetails: {
            message: error.message,
            stack: error.stack
          }
        }
      );
      
      throw error;
    }
  }

  /**
   * Get the start date for a report based on its schedule type
   */
  private getReportStartDate(template: ReportTemplate): Date {
    const now = new Date();
    
    switch (template.scheduleType) {
      case ReportScheduleType.DAILY:
        return subDays(now, 1);
        
      case ReportScheduleType.WEEKLY:
        return startOfWeek(now);
        
      case ReportScheduleType.MONTHLY:
        return startOfMonth(now);
        
      case ReportScheduleType.QUARTERLY:
        return subMonths(startOfMonth(now), 3);
        
      default:
        return subDays(now, 7); // Default to 1 week
    }
  }

  /**
   * Fetch data for the report based on template configuration
   */
  private async fetchReportData(template: ReportTemplate): Promise<any> {
    // This would be implemented to query the appropriate data source
    // based on the template configuration
    switch (template.dataSource) {
      case ReportDataSource.STAFFING:
        return this.fetchStaffingData(template);
        
      case ReportDataSource.OPERATIONS:
        return this.fetchOperationsData(template);
        
      case ReportDataSource.COMPLIANCE:
        return this.fetchComplianceData(template);
        
      case ReportDataSource.FINANCIAL:
        return this.fetchFinancialData(template);
        
      case ReportDataSource.ANALYTICS:
        return this.fetchAnalyticsData(template);
        
      case ReportDataSource.CUSTOM:
        return this.fetchCustomData(template);
        
      default:
        throw new Error(`Unsupported data source: ${template.dataSource}`);
    }
  }

  /**
   * Create the actual report file based on the template format
   */
  private async createReportFile(
    reportRecord: GeneratedReport,
    template: ReportTemplate,
    data: any
  ): Promise<{ filePath: string, fileUrl: string, fileSize: number }> {
    // This would create the file in the appropriate format
    // and return information about it
    
    const baseDir = path.join(process.cwd(), 'reports', template.businessId.toString());
    fs.mkdirSync(baseDir, { recursive: true });
    
    const fileName = `${reportRecord._id}.${template.format.toLowerCase()}`;
    const filePath = path.join(baseDir, fileName);
    
    // This is a placeholder implementation
    // In a real application, you would generate the actual file
    switch (template.format) {
      case ReportFormat.PDF:
        await this.generatePdfReport(filePath, template, data);
        break;
        
      case ReportFormat.EXCEL:
        await this.generateExcelReport(filePath, template, data);
        break;
        
      case ReportFormat.CSV:
        await this.generateCsvReport(filePath, template, data);
        break;
        
      case ReportFormat.JSON:
        await this.generateJsonReport(filePath, data);
        break;
        
      case ReportFormat.HTML:
        await this.generateHtmlReport(filePath, template, data);
        break;
        
      default:
        throw new Error(`Unsupported report format: ${template.format}`);
    }
    
    // Get file size
    const stats = fs.statSync(filePath);
    
    // Generate URL for file access
    // In a real application, this would be a URL to download the file
    const fileUrl = `/api/reports/download/${reportRecord._id}`;
    
    return {
      filePath,
      fileUrl,
      fileSize: stats.size
    };
  }

  /**
 * Send report email to recipients
 */
    private async sendReportEmail(
    report: GeneratedReport,
    template: ReportTemplate
  ): Promise<void> {
    // If no recipients, skip
    if (!report.recipientEmails || report.recipientEmails.length === 0) {
      return;
    }
    
    // Format date range
    const startDateFormatted = format(report.startDate, 'MMM d, yyyy');
    const endDateFormatted = format(report.endDate, 'MMM d, yyyy');
    
    // Create email content
    const templateData = {
      reportName: template.name,
      startDate: startDateFormatted,
      endDate: endDateFormatted,
      reportUrl: `${process.env.APP_URL}${report.fileUrl}`,
      includeAttachment: template.includeAttachment
    };
    
    try {
      await this.emailService.sendTemplateEmail(
        'Report Generation', // fromName
        process.env.EMAIL_FROM, // fromEmail
        report.recipientEmails, // to
        `${template.name} - ${startDateFormatted} to ${endDateFormatted}`, // subject
        'templates/reports/report-delivery.html', // templatePath - you'll need to create this
        templateData // templateData
      );
      
      this.logger.log(`Report email sent to ${report.recipientEmails.join(', ')}`);
    } catch (error) {
      this.logger.error(`Error sending report email: ${error.message}`);
      throw error;
    }
  }
  // Implementation of data fetch methods for different data sources
  // These would query your MongoDB collections based on the template configuration
  
  private async fetchStaffingData(template: ReportTemplate): Promise<any> {
    // Example implementation - would be customized based on your data model
    return this.userModel.aggregate([
      { $match: { businessId: template.businessId } },
      // Additional pipeline stages based on template.dataQuery
    ]);
  }
  
  private async fetchOperationsData(template: ReportTemplate): Promise<any> {
    // Implementation would depend on your operations data model
    return [];
  }
  
  private async fetchComplianceData(template: ReportTemplate): Promise<any> {
    // Implementation would depend on your compliance data model
    return [];
  }
  
  private async fetchFinancialData(template: ReportTemplate): Promise<any> {
    // Implementation would depend on your financial data model
    return [];
  }
  
  private async fetchAnalyticsData(template: ReportTemplate): Promise<any> {
    // Implementation would depend on your analytics data model
    return [];
  }
  
  private async fetchCustomData(template: ReportTemplate): Promise<any> {
    // Implementation would execute the custom query specified in the template
    return [];
  }
  
  // Implementation of report generation methods for different formats
  
  private async generatePdfReport(filePath: string, template: ReportTemplate, data: any): Promise<void> {
    // This is a simplified implementation
    // In a real application, you would use a more sophisticated PDF generation library
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    doc.fontSize(25).text(template.name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated on ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    
    // Add data to the PDF
    // This would be customized based on the template configuration
    doc.fontSize(12).text(JSON.stringify(data, null, 2));
    
    doc.end();
    
    // Wait for the file to be written
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
  
  private async generateExcelReport(filePath: string, template: ReportTemplate, data: any): Promise<void> {
    // This is a simplified implementation
    // In a real application, you would use a more sophisticated Excel generation library
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(template.name);
    
    // Add headers
    if (template.fields && template.fields.length > 0) {
      worksheet.addRow(template.fields);
    }
    
    // Add data
    if (Array.isArray(data)) {
      for (const item of data) {
        if (template.fields && template.fields.length > 0) {
          worksheet.addRow(template.fields.map(field => item[field]));
        } else {
          worksheet.addRow(Object.values(item));
        }
      }
    }
    
    await workbook.xlsx.writeFile(filePath);
  }
  
  private async generateCsvReport(filePath: string, template: ReportTemplate, data: any): Promise<void> {
    // This is a simplified implementation
    // In a real application, you would use a CSV generation library
    let csvContent = '';
    
    // Add headers
    if (template.fields && template.fields.length > 0) {
      csvContent += template.fields.join(',') + '\n';
    }
    
    // Add data
    if (Array.isArray(data)) {
      for (const item of data) {
        if (template.fields && template.fields.length > 0) {
          csvContent += template.fields.map(field => {
            // Handle fields with commas
            const value = item[field];
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return value;
          }).join(',') + '\n';
        } else {
          csvContent += Object.values(item).join(',') + '\n';
        }
      }
    }
    
    fs.writeFileSync(filePath, csvContent);
  }
  
  private async generateJsonReport(filePath: string, data: any): Promise<void> {
    // Simply write the data as JSON
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
  
  private async generateHtmlReport(filePath: string, template: ReportTemplate, data: any): Promise<void> {
    // This is a simplified implementation
    // In a real application, you would use a template engine
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${template.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>${template.name}</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
    `;
    
    // Add data table
    if (Array.isArray(data) && data.length > 0) {
      htmlContent += '<table>';
      
      // Add headers
      const headers = template.fields && template.fields.length > 0 
        ? template.fields 
        : Object.keys(data[0]);
      
      htmlContent += '<tr>';
      for (const header of headers) {
        htmlContent += `<th>${header}</th>`;
      }
      htmlContent += '</tr>';
      
      // Add rows
      for (const item of data) {
        htmlContent += '<tr>';
        for (const header of headers) {
          htmlContent += `<td>${item[header]}</td>`;
        }
        htmlContent += '</tr>';
      }
      
      htmlContent += '</table>';
    }
    
    htmlContent += `
      </body>
      </html>
    `;
    
    fs.writeFileSync(filePath, htmlContent);
  }

  /**
   * Update business report schedules when configuration changes
   */
  async updateBusinessReportSchedules(businessId: string): Promise<number> {
    return this.setupBusinessReportSchedules(businessId);
  }

  /**
   * Get report template by ID
   */
  async getReportTemplateById(templateId: string): Promise<ReportTemplate> {
    return this.templateModel.findById(templateId);
  }

  /**
   * Get generated report by ID
   */
  async getGeneratedReportById(reportId: string): Promise<GeneratedReport> {
    return this.reportModel.findById(reportId);
  }

  /**
   * Create report template
   */
  async createReportTemplate(templateData: Partial<ReportTemplate>): Promise<ReportTemplate> {
    const newTemplate = new this.templateModel(templateData);
    const savedTemplate = await newTemplate.save();
    
    // Schedule the report if active
    if (savedTemplate.isActive) {
      await this.setupBusinessReportSchedules(savedTemplate.businessId);
    }
    
    return savedTemplate;
  }

  /**
   * Update report template
   */
  async updateReportTemplate(templateId: string, templateData: Partial<ReportTemplate>): Promise<ReportTemplate> {
    const updatedTemplate = await this.templateModel.findByIdAndUpdate(
      templateId,
      templateData,
      { new: true }
    );
    
    // Reschedule reports for the business
    if (updatedTemplate) {
      await this.setupBusinessReportSchedules(updatedTemplate.businessId);
    }
    
    return updatedTemplate;
  }

  /**
   * Get templates for a business
   */
  async getBusinessTemplates(
    businessId: string,
    includeInactive: boolean = false
  ): Promise<ReportTemplate[]> {
    const query: any = {
      businessId,
      isDeleted: false
    };
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    return this.templateModel.find(query).sort({ name: 1 });
  }

  /**
   * Get generated reports for a business
   */
  async getBusinessReports(
    businessId: string,
    filters: {
      templateId?: string,
      status?: ReportStatus,
      startDate?: Date,
      endDate?: Date
    } = {}
  ): Promise<GeneratedReport[]> {
    const query: any = {
      businessId
    };
    
    // Add optional filters
    if (filters.templateId) query.templateId = filters.templateId;
    if (filters.status) query.status = filters.status;
    if (filters.startDate) query.generatedAt = { $gte: filters.startDate };
    if (filters.endDate) {
      if (query.generatedAt) {
        query.generatedAt.$lte = filters.endDate;
      } else {
        query.generatedAt = { $lte: filters.endDate };
      }
    }
    
    return this.reportModel.find(query)
      .populate('templateId', 'name format dataSource')
      .sort({ generatedAt: -1 });
  }

  /**
   * Delete report template (soft delete)
   */
  async deleteReportTemplate(templateId: string): Promise<ReportTemplate> {
    const template = await this.templateModel.findById(templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Mark as deleted and inactive
    template.isDeleted = true;
    template.isActive = false;
    await template.save();
    
    // Reschedule reports for the business
    await this.setupBusinessReportSchedules(template.businessId);
    
    return template;
  }

  // src/services/report-generation-agent.service.ts (continued)
  /**
   * Generate a report on demand
   */
  async generateReportOnDemand(
    templateId: string,
    customStartDate?: Date,
    customEndDate?: Date
  ): Promise<GeneratedReport> {
    // Get template
    const template = await this.templateModel.findById(templateId);
    
    if (!template || template.isDeleted) {
      throw new Error(`Template ${templateId} not found or deleted`);
    }
    
    // Check if business has access to report-generation agent
    const hasAccess = await this.agentPermissionService.hasAgentAccess(template.businessId, 'report-generation');
    
    if (!hasAccess) {
      throw new Error(`Business ${template.businessId} does not have access to report-generation agent`);
    }
    
    // Create new report record
    const reportRecord = new this.reportModel({
      businessId: template.businessId,
      templateId: template._id,
      name: template.name,
      format: template.format,
      status: ReportStatus.PROCESSING,
      recipientEmails: [], // Empty for on-demand reports
      startDate: customStartDate || this.getReportStartDate(template),
      endDate: customEndDate || new Date(),
      generatedAt: new Date()
    });
    
    await reportRecord.save();
    
    // Fetch data for report
    const reportData = await this.fetchReportData(template);
    
    // Generate the report file
    const { filePath, fileUrl, fileSize } = await this.createReportFile(reportRecord, template, reportData);
    
    // Update report record
    reportRecord.status = ReportStatus.COMPLETED;
    reportRecord.filePath = filePath;
    reportRecord.fileUrl = fileUrl;
    reportRecord.fileSize = fileSize;
    reportRecord.reportData = reportData;
    
    await reportRecord.save();
    
    this.logger.log(`Generated on-demand report "${template.name}" for business ${template.businessId}`);
    
    return reportRecord;
  }

  /**
   * Send an existing report to additional recipients
   */
  async sendReportToRecipients(
    reportId: string,
    recipientEmails: string[]
  ): Promise<GeneratedReport> {
    if (!recipientEmails || recipientEmails.length === 0) {
      throw new Error('No recipient emails provided');
    }
    
    const report = await this.reportModel.findById(reportId);
    
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }
    
    if (report.status !== ReportStatus.COMPLETED && report.status !== ReportStatus.DISTRIBUTED) {
      throw new Error(`Report ${reportId} is not ready to be sent (current status: ${report.status})`);
    }
    
    const template = await this.templateModel.findById(report.templateId);
    
    if (!template) {
      throw new Error(`Template for report ${reportId} not found`);
    }
    
    // Send report to specified recipients
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipientEmails.join(', '),
      subject: `${report.name} - ${format(report.startDate, 'MMM d, yyyy')} to ${format(report.endDate, 'MMM d, yyyy')}`,
      html: `
        <h1>${report.name}</h1>
        <p>Please find attached the ${report.name} report for the period ${format(report.startDate, 'MMM d, yyyy')} to ${format(report.endDate, 'MMM d, yyyy')}.</p>
        <p>You can download the report <a href="${process.env.APP_URL}${report.fileUrl}">here</a>.</p>
        <p>This report was generated by the Report Generation Agent.</p>
      `,
      attachments: []
    };
    
    // Add attachment if configured and available
    if (template.includeAttachment && report.filePath) {
      mailOptions.attachments.push({
        filename: `${report.name}.${report.format.toLowerCase()}`,
        path: report.filePath
      });
    }
    
    await this.emailTransporter.sendMail(mailOptions);
    
    // Update report record
    report.status = ReportStatus.DISTRIBUTED;
    report.sentAt = [...(report.sentAt || []), new Date()];
    
    // Add recipients if not already in the list
    const allRecipients = new Set([...(report.recipientEmails || []), ...recipientEmails]);
    report.recipientEmails = Array.from(allRecipients);
    
    await report.save();
    
    return report;
  }

  /**
   * Get report file for download
   */
  async getReportFile(reportId: string): Promise<{ filePath: string, fileName: string, format: ReportFormat }> {
    const report = await this.reportModel.findById(reportId);
    
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }
    
    if (report.status !== ReportStatus.COMPLETED && report.status !== ReportStatus.DISTRIBUTED) {
      throw new Error(`Report ${reportId} is not ready for download (current status: ${report.status})`);
    }
    
    if (!report.filePath) {
      throw new Error(`Report ${reportId} file not found`);
    }
    
    return {
      filePath: report.filePath,
      fileName: `${report.name}.${report.format.toLowerCase()}`,
      format: report.format
    };
  }
  
  /**
   * Run the scheduled job for a specific template
   */
  async runScheduledJob(templateId: string): Promise<GeneratedReport> {
    return this.generateReportFromTemplate(templateId);
  }
}