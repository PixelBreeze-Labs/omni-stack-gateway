// src/ai/services/ai-insight.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InsightCollectionRepository } from '../../repositories/ai/insight-collection.repository';
import { AIPredictionService } from './ai-prediction.service';
import { CreateInsightCollectionDto } from '../../dtos/ai/insight-collection.dto';

@Injectable()
export class AIInsightService {
  private readonly logger = new Logger(AIInsightService.name);

  constructor(
    private insightCollectionRepository: InsightCollectionRepository,
    private aiPredictionService: AIPredictionService
  ) {}

  /**
   * Get insights for a specific entity
   */
  async getInsights(
    entityId: string,
    entityType: string,
    insightType?: string
  ): Promise<any> {
    try {
      let insights;
      
      // If insight type specified, get latest of that type
      if (insightType) {
        insights = await this.insightCollectionRepository.findLatestByEntityId(
          entityId, 
          entityType, 
          insightType
        );
        
        if (insights) {
          return this.formatInsights(insights);
        }
      } 
      // Otherwise get all insight types for this entity
      else {
        insights = await this.insightCollectionRepository.findByEntityId(entityId, entityType);
        
        // Group by insight type, taking the latest of each
        const insightMap = {};
        
        insights.forEach(insight => {
          // If we don't have this type yet, or this one is newer
          if (
            !insightMap[insight.insightType] || 
            insight.createdAt > insightMap[insight.insightType].createdAt
          ) {
            insightMap[insight.insightType] = insight;
          }
        });
        
        // Convert map to array of formatted insights
        return Object.values(insightMap).map(insight => this.formatInsights(insight));
      }
      
      // No insights found
      return null;
    } catch (error) {
      this.logger.error(`Error getting insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate insights for an entity using prediction models
   */
  async generateInsights(
    entityId: string,
    entityType: string,
    insightType: string,
    features: Record<string, any>,
    businessId?: string
  ): Promise<any> {
    try {
      // First invalidate any existing insights of this type for this entity
      await this.insightCollectionRepository.invalidateInsights(entityId, entityType, insightType);
      
      // Generate insights based on the type
      let insights;
      
      switch (insightType) {
        case 'project_risk':
          insights = await this.generateProjectRiskInsights(
            entityId, 
            features, 
            businessId
          );
          break;
          
        case 'staff_performance':
          insights = await this.generateStaffPerformanceInsights(
            entityId, 
            features, 
            businessId
          );
          break;
          
        case 'client_satisfaction':
          insights = await this.generateClientSatisfactionInsights(
            entityId, 
            features, 
            businessId
          );
          break;
          
        // Add more insight types as needed
          
        default:
          throw new Error(`Unsupported insight type: ${insightType}`);
      }
      
      // Create insight collection entry
      const now = new Date();
      const insightDto: CreateInsightCollectionDto = {
        insightType,
        entityType,
        entityId,
        insights,
        businessId,
        validFrom: now,
        generatedBy: 'ai-insight-service'
      };
      
      const savedInsight = await this.insightCollectionRepository.create(insightDto);
      
      return this.formatInsights(savedInsight);
    } catch (error) {
      this.logger.error(`Error generating insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get dashboard insights for a business
   */
  async getBusinessDashboardInsights(businessId: string): Promise<any> {
    try {
      // Get all active insights for this business
      const projectInsights = await this.insightCollectionRepository.findActiveInsights(
        'project', 
        businessId
      );
      
      const staffInsights = await this.insightCollectionRepository.findActiveInsights(
        'staff', 
        businessId
      );
      
      const clientInsights = await this.insightCollectionRepository.findActiveInsights(
        'client', 
        businessId
      );
      
      // Process and aggregate insights
      const highRiskProjects = projectInsights
        .filter(i => i.insightType === 'project_risk' && i.insights.score >= 0.7)
        .map(i => this.formatInsights(i));
      
      const topPerformers = staffInsights
        .filter(i => i.insightType === 'staff_performance' && i.insights.score >= 0.8)
        .map(i => this.formatInsights(i));
      
      const atRiskClients = clientInsights
        .filter(i => i.insightType === 'client_satisfaction' && i.insights.score < 0.5)
        .map(i => this.formatInsights(i));
      
      // Calculate overall business health score
      const healthScore = this.calculateBusinessHealthScore(
        projectInsights,
        staffInsights,
        clientInsights
      );
      
      return {
        overallHealth: healthScore,
        highRiskProjects,
        topPerformers,
        atRiskClients,
        // Add more aggregated metrics as needed
      };
    } catch (error) {
      this.logger.error(`Error getting dashboard insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate project risk insights
   */
  private async generateProjectRiskInsights(
    projectId: string,
    features: Record<string, any>,
    businessId: string
  ): Promise<any> {
    // Make predictions for different risk types
    const delayRisk = await this.aiPredictionService.predict(
      'project_delay_prediction',
      'project',
      projectId,
      features,
      businessId
    );
    
    const budgetRisk = await this.aiPredictionService.predict(
      'project_budget_risk',
      'project',
      projectId,
      features,
      businessId
    );
    
    const qualityRisk = await this.aiPredictionService.predict(
      'project_quality_risk',
      'project',
      projectId,
      features,
      businessId
    );
    
    // Calculate overall risk score (weighted average of individual risks)
    const overallScore = (
      delayRisk.prediction.probability * 0.4 +
      budgetRisk.prediction.probability * 0.4 +
      qualityRisk.prediction.probability * 0.2
    );
    
    // Extract top risk factors
    const factors = [
      { factor: 'schedule_complexity', impact: features.schedule_complexity * 0.8 },
      { factor: 'team_experience', impact: (1 - features.team_experience_level) * 0.7 },
      { factor: 'client_changes', impact: features.client_change_frequency * 0.6 },
      // Add more factors based on your feature set
    ];
    
    // Sort factors by impact (descending)
    factors.sort((a, b) => b.impact - a.impact);
    
    // Generate recommendations based on risk factors
    const recommendations = this.generateRiskRecommendations(factors, features);
    
    return {
      score: overallScore,
      riskLevel: this.getRiskLevel(overallScore),
      risks: {
        delay: delayRisk.prediction.probability,
        budget: budgetRisk.prediction.probability,
        quality: qualityRisk.prediction.probability
      },
      factors: factors.slice(0, 3), // Top 3 factors
      recommendations,
      predictionConfidence: (
        delayRisk.confidence * 0.4 +
        budgetRisk.confidence * 0.4 +
        qualityRisk.confidence * 0.2
      )
    };
  }

  /**
   * Generate staff performance insights
   */
  private async generateStaffPerformanceInsights(
    staffId: string,
    features: Record<string, any>,
    businessId: string
  ): Promise<any> {
    // Implementation for staff performance insights
    // Similar structure to the project risk insights
    
    // For example, predict performance score, identify strengths and weaknesses,
    // generate recommendations for improvement
    
    return {
      score: 0.85, // Example score
      performanceLevel: 'high',
      metrics: {
        productivity: 0.9,
        quality: 0.8,
        reliability: 0.85
      },
      strengths: [
        { factor: 'technical_skill', impact: 0.9 },
        { factor: 'task_completion', impact: 0.85 }
      ],
      areas_for_improvement: [
        { factor: 'documentation', impact: 0.6 },
        { factor: 'communication', impact: 0.7 }
      ],
      recommendations: [
        {
          action: 'Provide documentation training',
          impact: 'Improve project handovers',
          priority: 'medium'
        }
      ],
      predictionConfidence: 0.8
    };
  }

  /**
   * Generate client satisfaction insights
   */
  private async generateClientSatisfactionInsights(
    clientId: string,
    features: Record<string, any>,
    businessId: string
  ): Promise<any> {
    // Implementation for client satisfaction insights
    // Similar structure to the other insight types
    
    return {
      score: 0.65, // Example score
      satisfactionLevel: 'medium',
      metrics: {
        communication: 0.7,
        delivery: 0.6,
        quality: 0.8
      },
      risksFactors: [
        { factor: 'project_delays', impact: 0.8 },
        { factor: 'communication_frequency', impact: 0.6 }
      ],
      recommendations: [
        {
          action: 'Increase status update frequency',
          impact: 'Improve client perception of progress',
          priority: 'high'
        }
      ],
      predictionConfidence: 0.75
    };
  }

  /**
   * Generate recommendations based on risk factors
   */
  private generateRiskRecommendations(
    factors: Array<{ factor: string; impact: number }>,
    features: Record<string, any>
  ): Array<{ action: string; impact: string; priority: string }> {
    const recommendations = [];
    
    // Add recommendations based on top factors
    factors.forEach(factor => {
      switch (factor.factor) {
        case 'schedule_complexity':
          recommendations.push({
            action: 'Break down complex tasks into smaller milestones',
            impact: 'Reduce schedule complexity risk',
            priority: this.getPriority(factor.impact)
          });
          break;
          
        case 'team_experience':
          recommendations.push({
            action: 'Pair less experienced team members with mentors',
            impact: 'Mitigate risk due to experience gaps',
            priority: this.getPriority(factor.impact)
          });
          break;
          
        case 'client_changes':
          recommendations.push({
            action: 'Implement formal change request process with impact assessment',
            impact: 'Control scope changes and set expectations',
            priority: this.getPriority(factor.impact)
          });
          break;
          
        // Add more recommendations based on your factors
      }
    });
    
    return recommendations;
  }

  /**
   * Calculate business health score from various insights
   */
  private calculateBusinessHealthScore(
    projectInsights: any[],
    staffInsights: any[],
    clientInsights: any[]
  ): { score: number, level: string } {
    // Example implementation - customize based on your business metrics
    
    // Calculate average project risk (invert so higher is better)
    const projectScores = projectInsights
      .filter(i => i.insightType === 'project_risk')
      .map(i => 1 - i.insights.score); // Invert so higher is better
      
    const avgProjectScore = projectScores.length > 0 
      ? projectScores.reduce((sum, val) => sum + val, 0) / projectScores.length 
      : 0.5;
    
    // Calculate average staff performance
    const staffScores = staffInsights
      .filter(i => i.insightType === 'staff_performance')
      .map(i => i.insights.score);
      
    const avgStaffScore = staffScores.length > 0 
      ? staffScores.reduce((sum, val) => sum + val, 0) / staffScores.length 
      : 0.5;
    
    // Calculate average client satisfaction
    const clientScores = clientInsights
      .filter(i => i.insightType === 'client_satisfaction')
      .map(i => i.insights.score);
      
    const avgClientScore = clientScores.length > 0 
      ? clientScores.reduce((sum, val) => sum + val, 0) / clientScores.length 
      : 0.5;
    
    // Calculate weighted average for overall score
    const overallScore = (
      avgProjectScore * 0.4 +
      avgStaffScore * 0.3 +
      avgClientScore * 0.3
    );
    
    return {
      score: overallScore,
      level: this.getHealthLevel(overallScore)
    };
  }

  /**
   * Format insights for client consumption
   */
  private formatInsights(insight: any): any {
    return {
      id: insight.id,
      type: insight.insightType,
      entityId: insight.entityId,
      entityType: insight.entityType,
      generatedAt: insight.createdAt,
      validUntil: insight.validTo,
      insights: insight.insights
    };
  }

  /**
   * Get risk level label from score
   */
  private getRiskLevel(score: number): string {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'minimal';
  }

  /**
   * Get health level label from score
   */
  private getHealthLevel(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'average';
    if (score >= 0.2) return 'concerning';
    return 'critical';
  }

  /**
   * Get priority label from impact score
   */
  private getPriority(impact: number): string {
    if (impact >= 0.8) return 'high';
    if (impact >= 0.5) return 'medium';
    return 'low';
  }
}