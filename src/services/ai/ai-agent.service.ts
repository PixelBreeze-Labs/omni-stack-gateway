// src/ai/services/ai-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AIModelService } from './ai-model.service';
import { AIPredictionService } from './ai-prediction.service';
import { AIInsightService } from './ai-insight.service';
import { AIFeatureService } from './ai-feature.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentFeatureFlag } from '../../schemas/business.schema';

@Injectable()
export class AIAgentService {
  private readonly logger = new Logger(AIAgentService.name);

  constructor(
    private aiModelService: AIModelService,
    private aiPredictionService: AIPredictionService,
    private aiInsightService: AIInsightService,
    private aiFeatureService: AIFeatureService,
    @InjectModel('Business') private businessModel: Model<any>,
    @InjectModel('AgentConfiguration') private agentConfigModel: Model<any>
  ) {}

  /**
   * Check if an agent feature is enabled for a business
   */
  async isAgentEnabled(businessId: string, agentFeature: AgentFeatureFlag): Promise<boolean> {
    try {
      const business = await this.businessModel.findById(businessId);
      
      if (!business) {
        return false;
      }
      
      // Check if the feature is included for this business
      return business.includedFeatures?.includes(agentFeature) || false;
    } catch (error) {
      this.logger.error(`Error checking agent availability: ${error.message}`);
      return false;
    }
  }

  /**
   * Get agent configuration
   */
  async getAgentConfig(businessId: string, agentFeature: AgentFeatureFlag): Promise<any> {
    try {
      const config = await this.agentConfigModel.findOne({
        businessId,
        agentType: agentFeature
      });
      
      return config || null;
    } catch (error) {
      this.logger.error(`Error getting agent configuration: ${error.message}`);
      return null;
    }
  }

  /**
   * Auto Assignment Agent
   * Finds the optimal assignee for a task
   */
  async autoAssignTask(taskId: string, businessId: string): Promise<any> {
    this.logger.log(`Auto assignment agent processing task ${taskId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.AUTO_ASSIGNMENT_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Auto assignment agent not enabled for business ${businessId}`);
      }
      
      // Get agent configuration
      const config = await this.getAgentConfig(
        businessId, 
        AgentFeatureFlag.AUTO_ASSIGNMENT_AGENT
      );
      
      // Get task data
      const task = await this.getTaskData(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      // Get staff data
      const availableStaff = await this.getAvailableStaff(businessId, task);
      if (availableStaff.length === 0) {
        return {
          success: false,
          message: 'No available staff found'
        };
      }
      
      // For each staff member, predict assignment success
      const assignments = [];
      
      for (const staff of availableStaff) {
        // Generate task-staff features
        const features = await this.generateTaskStaffFeatures(task, staff);
        
        // Make prediction
        const prediction = await this.aiPredictionService.predict(
          'task_assignment_success',
          'task_assignment',
          `${taskId}_${staff.id}`,
          features,
          businessId
        );
        
        assignments.push({
          staffId: staff.id,
          staffName: staff.name,
          score: prediction.prediction.probability,
          confidence: prediction.confidence,
          strengths: this.extractAssignmentStrengths(features, prediction),
          weaknesses: this.extractAssignmentWeaknesses(features, prediction)
        });
      }
      
      // Sort by score (highest first)
      assignments.sort((a, b) => b.score - a.score);
      
      // Get best assignee
      const bestMatch = assignments[0];
      
      // Check if score meets minimum threshold
      if (bestMatch.score < (config?.minimumScoreThreshold || 0.6)) {
        return {
          success: false,
          message: 'No suitable assignee found',
          assignments
        };
      }
      
      // Determine if we should auto-assign or suggest
      if (config?.requireApproval) {
        // Save recommendation
        await this.saveAssignmentRecommendation(
          taskId, 
          bestMatch.staffId, 
          bestMatch.score,
          bestMatch.strengths
        );
        
        return {
          success: true,
          action: 'recommend',
          recommendation: bestMatch,
          alternatives: assignments.slice(1, 3) // Next 2 best matches
        };
      } else {
        // Auto-assign
        const result = await this.assignTask(
          taskId, 
          bestMatch.staffId, 
          bestMatch.score,
          bestMatch.strengths
        );
        
        return {
          success: true,
          action: 'assign',
          assignment: result,
          alternatives: assignments.slice(1, 3) // Next 2 best matches
        };
      }
    } catch (error) {
      this.logger.error(`Auto assignment error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compliance Monitoring Agent
   * Scans business operations for compliance issues
   */
  async scanComplianceIssues(businessId: string): Promise<any> {
    this.logger.log(`Compliance monitoring agent scanning business ${businessId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.COMPLIANCE_MONITORING_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Compliance monitoring agent not enabled for business ${businessId}`);
      }
      
      // Get agent configuration
      const config = await this.getAgentConfig(
        businessId, 
        AgentFeatureFlag.COMPLIANCE_MONITORING_AGENT
      );
      
      // Run various compliance checks
      const certificationIssues = await this.checkCertificationCompliance(businessId);
      const scheduleIssues = await this.checkScheduleCompliance(businessId);
      const safetyIssues = await this.checkSafetyCompliance(businessId);
      const regulatoryIssues = await this.checkRegulatoryCompliance(businessId);
      
      // Aggregate all issues
      const allIssues = [
        ...certificationIssues,
        ...scheduleIssues,
        ...safetyIssues,
        ...regulatoryIssues
      ];
      
      // Categorize and prioritize issues
      const categorizedIssues = this.categorizeComplianceIssues(allIssues);
      
      // Generate recommendations for each issue
      const issuesWithRecommendations = this.addComplianceRecommendations(
        categorizedIssues,
        config
      );
      
      return {
        timestamp: new Date(),
        businessId,
        totalIssues: allIssues.length,
        criticalIssues: issuesWithRecommendations.filter(i => i.severity === 'critical').length,
        highIssues: issuesWithRecommendations.filter(i => i.severity === 'high').length,
        mediumIssues: issuesWithRecommendations.filter(i => i.severity === 'medium').length,
        lowIssues: issuesWithRecommendations.filter(i => i.severity === 'low').length,
        issues: issuesWithRecommendations
      };
    } catch (error) {
      this.logger.error(`Compliance monitoring error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Report Generation Agent
   * Creates intelligent reports with insights
   */
  async generateReport(
    businessId: string, 
    reportType: string, 
    options: any = {}
  ): Promise<any> {
    this.logger.log(`Report generation agent creating ${reportType} for ${businessId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.REPORT_GENERATION_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Report generation agent not enabled for business ${businessId}`);
      }
      
      // Get agent configuration
      const config = await this.getAgentConfig(
        businessId, 
        AgentFeatureFlag.REPORT_GENERATION_AGENT
      );
      
      // Get report data based on type
      let reportData;
      let insights;
      
      switch (reportType) {
        case 'project_status':
          reportData = await this.getProjectStatusReportData(businessId, options);
          insights = await this.aiInsightService.getBusinessDashboardInsights(businessId);
          break;
          
        case 'staff_performance':
          reportData = await this.getStaffPerformanceReportData(businessId, options);
          insights = await this.getStaffPerformanceInsights(businessId);
          break;
          
        case 'client_satisfaction':
          reportData = await this.getClientSatisfactionReportData(businessId, options);
          insights = await this.getClientSatisfactionInsights(businessId);
          break;
          
        case 'compliance_summary':
          reportData = await this.getComplianceSummaryReportData(businessId, options);
          insights = await this.getComplianceInsights(businessId);
          break;
          
        default:
          throw new Error(`Unsupported report type: ${reportType}`);
      }
      
      // Create report structure
      const report = {
        title: this.generateReportTitle(reportType, options),
        generatedAt: new Date(),
        reportType,
        businessId,
        timeframe: options.timeframe || 'Last 30 days',
        summary: this.generateReportSummary(reportData, insights),
        sections: this.generateReportSections(reportType, reportData, insights),
        charts: this.generateReportCharts(reportType, reportData),
        recommendations: insights.recommendations || [],
        trendsAndAnomalies: {
          trends: insights.trends || [],
          anomalies: insights.anomalies || []
        }
      };
      
      // Save report if configured
      if (config?.saveReports) {
        await this.saveReport(report, businessId);
      }
      
      return report;
    } catch (error) {
      this.logger.error(`Report generation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Client Communication Agent
   * Analyzes and prioritizes client communications
   */
  async analyzeClientCommunication(
    communicationId: string, 
    businessId: string
  ): Promise<any> {
    this.logger.log(`Client communication agent analyzing communication ${communicationId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.CLIENT_COMMUNICATION_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Client communication agent not enabled for business ${businessId}`);
      }
      
      // Implementation of client communication analysis
      // This would analyze message content, sentiment, urgency, etc.
      
      return {
        // Example output
        communicationId,
        sentiment: 'positive',
        urgency: 'medium',
        topics: ['project timeline', 'feature request'],
        suggestedResponse: 'Thank the client and acknowledge the timeline concerns',
        suggestedPriority: 'high',
        relatedEntities: {
          projectId: 'project123',
          taskIds: ['task456', 'task789']
        }
      };
    } catch (error) {
      this.logger.error(`Client communication analysis error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resource Request Agent
   * Optimizes and automates resource requests
   */
  async processResourceRequest(
    requestId: string, 
    businessId: string
  ): Promise<any> {
    this.logger.log(`Resource request agent processing request ${requestId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.RESOURCE_REQUEST_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Resource request agent not enabled for business ${businessId}`);
      }
      
      // Implementation of resource request processing
      // This would analyze the request, find optimal resources, etc.
      
      return {
        // Example output
        requestId,
        status: 'processed',
        recommendations: [
          {
            resourceType: 'equipment',
            resourceId: 'equip123',
            availability: '2023-05-20 to 2023-05-25',
            confidence: 0.92
          },
          {
            resourceType: 'equipment',
            resourceId: 'equip456',
            availability: '2023-05-20 to 2023-05-30',
            confidence: 0.85
          }
        ],
        alternativeOptions: [
          {
            resourceType: 'equipment',
            resourceId: 'equip789',
            availability: '2023-05-22 to 2023-05-27',
            confidence: 0.78
          }
        ]
      };
    } catch (error) {
      this.logger.error(`Resource request processing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Shift Optimization Agent
   * Optimizes staff scheduling
   */
  async optimizeShifts(
    scheduleId: string, 
    businessId: string, 
    options: any = {}
  ): Promise<any> {
    this.logger.log(`Shift optimization agent processing schedule ${scheduleId}`);
    
    try {
      // Check if agent is enabled
      const isEnabled = await this.isAgentEnabled(
        businessId, 
        AgentFeatureFlag.SHIFT_OPTIMIZATION_AGENT
      );
      
      if (!isEnabled) {
        throw new Error(`Shift optimization agent not enabled for business ${businessId}`);
      }
      
      // Implementation of shift optimization
      // This would analyze current schedules, staff skills, projects, etc.
      
      return {
        // Example output
        scheduleId,
        optimizationStatus: 'completed',
        improvements: {
          staffUtilization: '+12%',
          projectCoverage: '+8%',
          travelTimeReduction: '-15%'
        },
        recommendations: [
          {
            staffId: 'staff123',
            currentShift: 'Monday 9-5, Tuesday 10-6',
            recommendedShift: 'Monday 10-6, Wednesday 9-5',
            reason: 'Better aligns with project needs and reduces travel time'
          },
          // More recommendations...
        ]
      };
    } catch (error) {
      this.logger.error(`Shift optimization error: ${error.message}`);
      throw error;
    }
  }

  // Helper methods for agent operations

  /**
   * Get task data for assignment
   */
  private async getTaskData(taskId: string): Promise<any> {
    // Implementation to fetch task data
    // This would be a call to your task model
    // Example placeholder implementation
    return { id: taskId, name: 'Example Task' };
  }

  /**
   * Get available staff for task assignment
   */
  private async getAvailableStaff(businessId: string, task: any): Promise<any[]> {
    // Implementation to fetch available staff
    // Example placeholder implementation
    return [
      { id: 'staff1', name: 'John Doe' },
      { id: 'staff2', name: 'Jane Smith' }
    ];
  }

  /**
   * Generate task-staff features for assignment prediction
   */
  private async generateTaskStaffFeatures(task: any, staff: any): Promise<Record<string, any>> {
    // Implementation to generate features
    // Example placeholder implementation
    return {
      task_complexity: 0.7,
      staff_experience: 0.8,
      staff_workload: 0.5
    };
  }

  /**
   * Extract assignment strengths from prediction
   */
  private extractAssignmentStrengths(features: any, prediction: any): string[] {
    // Implementation to extract strengths
    // Example placeholder implementation
    return ['High skill match', 'Available capacity'];
  }

  /**
   * Extract assignment weaknesses from prediction
   */
  private extractAssignmentWeaknesses(features: any, prediction: any): string[] {
    // Implementation to extract weaknesses
    // Example placeholder implementation
    return ['Limited experience with this task type'];
  }

  /**
   * Save assignment recommendation
   */
  private async saveAssignmentRecommendation(
    taskId: string, 
    staffId: string, 
    score: number,
    strengths: string[]
  ): Promise<any> {
    // Implementation to save recommendation
    // This would update your task model
    // Example placeholder implementation
    return { taskId, staffId, status: 'recommended' };
  }

  /**
   * Assign task to staff
   */
  private async assignTask(
    taskId: string, 
    staffId: string, 
    score: number,
    strengths: string[]
  ): Promise<any> {
    // Implementation to assign task
    // This would update your task model
    // Example placeholder implementation
    return { taskId, staffId, status: 'assigned' };
  }

  // Compliance monitoring helper methods
  private async checkCertificationCompliance(businessId: string): Promise<any[]> {
    // Implementation for certification compliance check
    return [];
  }

  private async checkScheduleCompliance(businessId: string): Promise<any[]> {
    // Implementation for schedule compliance check
    return [];
  }

  private async checkSafetyCompliance(businessId: string): Promise<any[]> {
    // Implementation for safety compliance check
    return [];
  }

  private async checkRegulatoryCompliance(businessId: string): Promise<any[]> {
    // Implementation for regulatory compliance check
    return [];
  }

  private categorizeComplianceIssues(issues: any[]): any[] {
    // Implementation to categorize issues
    return [];
  }

  private addComplianceRecommendations(issues: any[], config: any): any[] {
    // Implementation to add recommendations
    return [];
  }

  // Report generation helper methods
  private async getProjectStatusReportData(businessId: string, options: any): Promise<any> {
    // Implementation to get project status data
    return {};
  }

  private async getStaffPerformanceReportData(businessId: string, options: any): Promise<any> {
    // Implementation to get staff performance data
    return {};
  }

  private async getClientSatisfactionReportData(businessId: string, options: any): Promise<any> {
    // Implementation to get client satisfaction data
    return {};
  }

  private async getComplianceSummaryReportData(businessId: string, options: any): Promise<any> {
    // Implementation to get compliance summary data
    return {};
  }

  private async getStaffPerformanceInsights(businessId: string): Promise<any> {
    // Implementation to get staff performance insights
    return {};
  }

  private async getClientSatisfactionInsights(businessId: string): Promise<any> {
    // Implementation to get client satisfaction insights
    return {};
  }

  private async getComplianceInsights(businessId: string): Promise<any> {
    // Implementation to get compliance insights
    return {};
  }

  private generateReportTitle(reportType: string, options: any): string {
    // Implementation to generate report title
    return `${reportType.replace('_', ' ')} Report`;
  }

  private generateReportSummary(data: any, insights: any): string {
    // Implementation to generate report summary
    return 'Report summary placeholder';
  }

  private generateReportSections(reportType: string, data: any, insights: any): any[] {
    // Implementation to generate report sections
    return [];
  }

  private generateReportCharts(reportType: string, data: any): any[] {
    // Implementation to generate report charts
    return [];
  }

  private async saveReport(report: any, businessId: string): Promise<any> {
    // Implementation to save report
    return {};
  }
}