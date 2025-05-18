// src/ai/services/ai-feature.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { FeatureCollectionRepository } from '../../repositories/ai/feature-collection.repository';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AIFeatureService {
  private readonly logger = new Logger(AIFeatureService.name);

  constructor(
    private featureCollectionRepository: FeatureCollectionRepository,
    @InjectConnection() private readonly connection: Connection
  ) {}

  /**
   * Get features for a specific entity
   */
  async getFeatures(
    entityId: string,
    entityType: string,
    featureSetName: string
  ): Promise<any> {
    try {
      const featureCollection = await this.featureCollectionRepository.findLatestByEntityId(
        entityId,
        entityType,
        featureSetName
      );
      
      if (!featureCollection) {
        this.logger.warn(`No features found for ${entityType} ${entityId} (${featureSetName})`);
        return null;
      }
      
      return featureCollection.features;
    } catch (error) {
      this.logger.error(`Error getting features: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store entity features
   */
  async saveFeatures(
    entityId: string,
    entityType: string,
    featureSetName: string,
    features: Record<string, any>,
    businessId?: string
  ): Promise<any> {
    try {
      return this.featureCollectionRepository.upsertFeatures(
        entityId,
        entityType,
        featureSetName,
        features,
        businessId
      );
    } catch (error) {
      this.logger.error(`Error saving features: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scheduled job to generate and update features for all entities
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateAllFeatures(): Promise<void> {
    this.logger.log('Starting scheduled feature generation');
    
    try {
      // Get active businesses
      const businesses = await this.connection.model('Business').find({ 
        isActive: true 
      });
      
      // Process each business
      for (const business of businesses) {
        try {
          await this.generateBusinessFeatures(business.id);
        } catch (businessError) {
          this.logger.error(`Error generating features for business ${business.id}: ${businessError.message}`);
          // Continue with next business
        }
      }
      
      this.logger.log('Completed scheduled feature generation');
    } catch (error) {
      this.logger.error(`Error in feature generation job: ${error.message}`);
    }
  }

  /**
   * Generate features for all entities in a business
   */
  async generateBusinessFeatures(businessId: string): Promise<void> {
    this.logger.log(`Generating features for business ${businessId}`);
    
    try {
      // Generate project features
      await this.generateProjectFeatures(businessId);
      
      // Generate staff features
      await this.generateStaffFeatures(businessId);
      
      // Generate client features
      await this.generateClientFeatures(businessId);
      
      // Generate task features
      await this.generateTaskFeatures(businessId);
      
      this.logger.log(`Completed feature generation for business ${businessId}`);
    } catch (error) {
      this.logger.error(`Error generating business features: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate project features
   */
  private async generateProjectFeatures(businessId: string): Promise<void> {
    this.logger.log(`Generating project features for business ${businessId}`);
    
    try {
      // Get active projects for this business
      const projects = await this.connection.model('Project').find({
        businessId,
        isDeleted: false
      });
      
      this.logger.log(`Processing ${projects.length} projects`);
      
      for (const project of projects) {
        try {
          // Generate project risk features
          await this.generateProjectRiskFeatures(project.id, businessId);
          
          // Generate other project feature sets as needed
        } catch (projectError) {
          this.logger.error(`Error processing project ${project.id}: ${projectError.message}`);
          // Continue with next project
        }
      }
    } catch (error) {
      this.logger.error(`Error in project feature generation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate project risk features
   */
  private async generateProjectRiskFeatures(projectId: string, businessId: string): Promise<void> {
    try {
      // Get project data
      const project = await this.connection.model('Project').findById(projectId);
      
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }
      
      // Get project tasks
      const tasks = await this.connection.model('Task').find({
        projectId,
        isDeleted: false
      });
      
      // Get project team
      const team = await this.getProjectTeam(projectId);
      
      // Calculate feature values
      const features: Record<string, any> = {
        // Project metadata features
        project_duration_days: this.calculateProjectDuration(project),
        total_tasks: tasks.length,
        completed_tasks: tasks.filter(t => t.status === 'completed').length,
        completion_percentage: tasks.length > 0 
          ? tasks.filter(t => t.status === 'completed').length / tasks.length 
          : 0,
        
        // Schedule features
        days_to_deadline: this.calculateDaysToDeadline(project),
        schedule_deviation: this.calculateScheduleDeviation(project, tasks),
        
        // Team features
        team_size: team.length,
        avg_team_experience: this.calculateAverageTeamExperience(team),
        team_skill_coverage: this.calculateTeamSkillCoverage(team, project),
        
        // Task features
        avg_task_complexity: this.calculateAverageTaskComplexity(tasks),
        blocked_tasks: tasks.filter(t => t.metadata?.isBlocked).length,
        
        // Client features
        client_change_frequency: this.calculateClientChangeFrequency(project),
        
        // Add more features as needed...
      };
      
      // Store the features
      await this.saveFeatures(
        projectId,
        'project',
        'project_risk',
        features,
        businessId
      );
    } catch (error) {
      this.logger.error(`Error generating project risk features: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate staff features
   */
  private async generateStaffFeatures(businessId: string): Promise<void> {
    // Implementation for staff feature generation
    // Similar to project features but focused on staff performance metrics
  }
  
  /**
   * Generate client features
   */
  private async generateClientFeatures(businessId: string): Promise<void> {
    // Implementation for client feature generation
    // Focused on client satisfaction and relationship metrics
  }
  
  /**
   * Generate task features
   */
  private async generateTaskFeatures(businessId: string): Promise<void> {
    // Implementation for task feature generation
    // Focused on task assignment and completion metrics
  }

  /**
   * Helper function to get project team
   */
  private async getProjectTeam(projectId: string): Promise<any[]> {
    try {
      // Example implementation - adapt to your data model
      const projectTeam = await this.connection.model('ProjectTeam').find({
        projectId
      }).populate('staffProfileId');
      
      return projectTeam.map(pt => pt.staffProfileId);
    } catch (error) {
      this.logger.error(`Error getting project team: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate project duration in days
   */
  private calculateProjectDuration(project: any): number {
    // Example implementation
    if (!project.startDate || !project.endDate) {
      return 30; // Default value
    }
    
    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    
    const durationMs = end.getTime() - start.getTime();
    return Math.ceil(durationMs / (1000 * 60 * 60 * 24)); // Convert ms to days
  }

  /**
  * Calculate days to deadline
  */
 private calculateDaysToDeadline(project: any): number {
    // Example implementation
    if (!project.endDate) {
      return 30; // Default value
    }
    
    const now = new Date();
    const deadline = new Date(project.endDate);
    
    const daysMs = deadline.getTime() - now.getTime();
    return Math.ceil(daysMs / (1000 * 60 * 60 * 24)); // Convert ms to days
  }
 
  /**
   * Calculate schedule deviation
   */
  private calculateScheduleDeviation(project: any, tasks: any[]): number {
    // Example implementation
    if (tasks.length === 0) {
      return 0;
    }
    
    // Count delayed tasks
    const delayedTasks = tasks.filter(task => {
      if (!task.dueDate || !task.completedAt || task.status !== 'completed') {
        return false;
      }
      
      const dueDate = new Date(task.dueDate);
      const completedAt = new Date(task.completedAt);
      
      return completedAt > dueDate;
    });
    
    return delayedTasks.length / tasks.length;
  }
 
  /**
   * Calculate average team experience
   */
  private calculateAverageTeamExperience(team: any[]): number {
    // Example implementation
    if (team.length === 0) {
      return 0.5; // Default value
    }
    
    // Assuming each team member has an experienceLevel property (0-1)
    const totalExperience = team.reduce((sum, member) => {
      return sum + (member.experienceLevel || 0.5);
    }, 0);
    
    return totalExperience / team.length;
  }
 
  /**
   * Calculate team skill coverage
   */
  private calculateTeamSkillCoverage(team: any[], project: any): number {
    // Example implementation
    if (!project.requiredSkills || !project.requiredSkills.length) {
      return 1.0; // Perfect coverage if no specific skills required
    }
    
    // Count how many required skills are covered by the team
    const coveredSkills = new Set();
    
    team.forEach(member => {
      if (member.skills) {
        Object.keys(member.skills).forEach(skill => {
          coveredSkills.add(skill);
        });
      }
    });
    
    // Calculate coverage ratio
    let coveredCount = 0;
    project.requiredSkills.forEach(skill => {
      if (coveredSkills.has(skill)) {
        coveredCount++;
      }
    });
    
    return coveredCount / project.requiredSkills.length;
  }
 
  /**
   * Calculate average task complexity
   */
  private calculateAverageTaskComplexity(tasks: any[]): number {
    // Example implementation
    if (tasks.length === 0) {
      return 0.5; // Default value
    }
    
    // Assuming each task has a complexity property (1-5)
    const totalComplexity = tasks.reduce((sum, task) => {
      return sum + (task.complexity || 3);
    }, 0);
    
    // Normalize to 0-1 scale
    return (totalComplexity / tasks.length) / 5;
  }
 
  /**
   * Calculate client change frequency
   */
  private calculateClientChangeFrequency(project: any): number {
    // Example implementation
    if (!project.changeRequests) {
      return 0.1; // Default low value
    }
    
    // Calculate changes per week
    const durationWeeks = this.calculateProjectDuration(project) / 7;
    if (durationWeeks <= 0) {
      return 0.1;
    }
    
    const changeRate = project.changeRequests.length / durationWeeks;
    
    // Normalize to 0-1 scale (assuming >5 changes per week is high)
    return Math.min(1, changeRate / 5);
  }
 }