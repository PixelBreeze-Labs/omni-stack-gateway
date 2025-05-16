// src/services/vb-app-project-sync.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';

@Injectable()
export class VBAppProjectSyncService {
  private readonly logger = new Logger(VBAppProjectSyncService.name);

  constructor(
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>
  ) {}

  /**
   * Create or update a project
   */
  async createOrUpdateProject(projectData: any, clientId: string, venueId: string): Promise<AppProject> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Check if project already exists with this external ID
      let project = await this.appProjectModel.findOne({
        'externalIds.venueBoostProjectId': projectData.projectId
      });

      // Prepare location data if available
      const locationData = projectData.location ? {
        latitude: projectData.location.latitude,
        longitude: projectData.location.longitude,
        address: projectData.location.address,
        city: projectData.location.city,
        state: projectData.location.state,
        country: projectData.location.country
      } : undefined;

      // Prepare project data
      const projectUpdateData = {
        name: projectData.name,
        description: projectData.description,
        businessId: business._id,
        status: projectData.status,
        externalIds: {
          venueBoostProjectId: projectData.projectId,
          // Add any other external IDs here
        },
        metadata: {
          projectType: projectData.projectType,
          status: projectData.status,
          estimatedHours: projectData.estimatedHours,
          estimatedBudget: projectData.estimatedBudget,
          startDate: projectData.startDate,
          endDate: projectData.endDate,
          location: locationData,
          clientInfo: projectData.client
        }
      };

      if (project) {
        // Update existing project
        const updatedProject = await this.appProjectModel.findByIdAndUpdate(
          project._id,
          {
            $set: {
              name: projectUpdateData.name,
              description: projectUpdateData.description,
              status: projectUpdateData.status,
              'metadata.projectType': projectUpdateData.metadata.projectType,
              'metadata.status': projectUpdateData.metadata.status,
              'metadata.estimatedHours': projectUpdateData.metadata.estimatedHours,
              'metadata.estimatedBudget': projectUpdateData.metadata.estimatedBudget,
              'metadata.startDate': projectUpdateData.metadata.startDate,
              'metadata.endDate': projectUpdateData.metadata.endDate,
              'metadata.location': projectUpdateData.metadata.location,
              'metadata.clientInfo': projectUpdateData.metadata.clientInfo
            }
          },
          { new: true }
        );
        
        this.logger.log(`Updated project ${project._id} with venueBoostProjectId ${projectData.projectId}`);
        return updatedProject;
      } else {
        // Create new project
        const newProject = await this.appProjectModel.create(projectUpdateData);
        this.logger.log(`Created new project ${newProject._id} with venueBoostProjectId ${projectData.projectId}`);
        return newProject;
      }
    } catch (error) {
      this.logger.error(`Error in createOrUpdateProject: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update project status
   */
  async updateProjectStatus(projectId: string, clientId: string, venueId: string, status: string): Promise<AppProject> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Find project by external ID
      const project = await this.appProjectModel.findOne({
        'externalIds.venueBoostProjectId': projectId,
        businessId: business._id
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found for business ${business._id}`);
      }

      // Update project status
      const updatedProject = await this.appProjectModel.findByIdAndUpdate(
        project._id,
        {
          $set: {
            status: status,
            'metadata.status': status
          }
        },
        { new: true }
      );

      this.logger.log(`Updated status for project ${project._id} to ${status}`);
      return updatedProject;
    } catch (error) {
      this.logger.error(`Error in updateProjectStatus: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string, clientId: string, venueId: string): Promise<boolean> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Find project by external ID
      const project = await this.appProjectModel.findOne({
        'externalIds.venueBoostProjectId': projectId,
        businessId: business._id
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${projectId} not found for business ${business._id}`);
      }

      // Mark as deleted instead of actual deletion
      await this.appProjectModel.findByIdAndUpdate(project._id, { 
        $set: { 
          isDeleted: true, 
          deletedAt: new Date() 
        }
      });

      this.logger.log(`Deleted project ${project._id} with venueBoostProjectId ${projectId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error in deleteProject: ${error.message}`, error.stack);
      throw error;
    }
  }


  /**
   * Find business by external ID (venueId) and client ID
   */
  private async findBusinessByExternalId(clientId: string, venueId: string): Promise<Business> {
    return this.businessModel.findOne({
      clientId,
      'externalIds.venueBoostId': venueId
    });
  }
}