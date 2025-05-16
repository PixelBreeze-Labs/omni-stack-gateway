// src/services/vb-construction-site-sync.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConstructionSite } from '../schemas/construction-site.schema';
import { AppProject } from '../schemas/app-project.schema';
import { Business } from '../schemas/business.schema';

@Injectable()
export class VBConstructionSiteSyncService {
  private readonly logger = new Logger(VBConstructionSiteSyncService.name);

  constructor(
    @InjectModel(ConstructionSite.name) private constructionSiteModel: Model<ConstructionSite>,
    @InjectModel(AppProject.name) private appProjectModel: Model<AppProject>,
    @InjectModel(Business.name) private businessModel: Model<Business>
  ) {}

  /**
   * Create or update a construction site
   */
  async createOrUpdateSite(siteData: any, clientId: string, venueId: string): Promise<ConstructionSite> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Check if site already exists with this external ID
      let site = await this.constructionSiteModel.findOne({
        'externalIds.venueBoostSiteId': siteData.siteId
      });

      // Check if there's an associated app project
      let appProject = null;
      if (siteData.appProjectId) {
        appProject = await this.appProjectModel.findOne({
          'externalIds.venueBoostProjectId': siteData.appProjectId
        });
        
        if (!appProject) {
          this.logger.warn(`App project with ID ${siteData.appProjectId} not found`);
        } else {
          // Update app project with construction site ID
          await this.appProjectModel.findByIdAndUpdate(
            appProject._id,
            {
              $set: {
                'metadata.constructionSite': {
                  id: siteData.siteId,
                  name: siteData.name,
                  status: siteData.status
                }
              }
            }
          );
        }
      }

      // Prepare location data
      const locationData = siteData.location ? {
        latitude: siteData.location.latitude,
        longitude: siteData.location.longitude,
        address: siteData.location.address,
        city: siteData.location.city,
        state: siteData.location.state,
        country: siteData.location.country
      } : undefined;

      // Prepare construction site data
      const siteUpdateData = {
        name: siteData.name,
        description: siteData.description,
        businessId: business._id,
        status: siteData.status,
        type: siteData.type,
        appProjectId: appProject ? appProject._id : undefined,
        externalIds: {
          venueBoostSiteId: siteData.siteId
        },
        location: locationData,
        metadata: {
          status: siteData.status,
          siteType: siteData.type,
          lastSyncedAt: new Date(),
          startDate: siteData.startDate,
          endDate: siteData.endDate,
          noOfWorkers: siteData.noOfWorkers,
          specifications: siteData.specifications,
          weatherConfig: siteData.weatherConfig,
          accessRequirements: siteData.accessRequirements,
          safetyRequirements: siteData.safetyRequirements,
          manager: siteData.manager,
          teams: siteData.teams
        }
      };

      if (site) {
        // Update existing site
        const updatedSite = await this.constructionSiteModel.findByIdAndUpdate(
          site._id,
          {
            $set: {
              name: siteUpdateData.name,
              description: siteUpdateData.description,
              status: siteUpdateData.status,
              type: siteUpdateData.type,
              appProjectId: siteUpdateData.appProjectId,
              location: siteUpdateData.location,
              'metadata.status': siteUpdateData.metadata.status,
              'metadata.siteType': siteUpdateData.metadata.siteType,
              'metadata.lastSyncedAt': siteUpdateData.metadata.lastSyncedAt,
              'metadata.startDate': siteUpdateData.metadata.startDate,
              'metadata.endDate': siteUpdateData.metadata.endDate,
              'metadata.noOfWorkers': siteUpdateData.metadata.noOfWorkers,
              'metadata.specifications': siteUpdateData.metadata.specifications,
              'metadata.weatherConfig': siteUpdateData.metadata.weatherConfig,
              'metadata.accessRequirements': siteUpdateData.metadata.accessRequirements,
              'metadata.safetyRequirements': siteUpdateData.metadata.safetyRequirements,
              'metadata.manager': siteUpdateData.metadata.manager,
              'metadata.teams': siteUpdateData.metadata.teams
            }
          },
          { new: true }
        );
        
        this.logger.log(`Updated construction site ${site._id} with venueBoostSiteId ${siteData.siteId}`);
        return updatedSite;
      } else {
        // Create new construction site
        const newSite = await this.constructionSiteModel.create(siteUpdateData);
        this.logger.log(`Created new construction site ${newSite._id} with venueBoostSiteId ${siteData.siteId}`);
        return newSite;
      }
    } catch (error) {
      this.logger.error(`Error in createOrUpdateSite: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update construction site status
   */
  async updateSiteStatus(siteId: string, clientId: string, venueId: string, status: string): Promise<ConstructionSite> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Find site by external ID
      const site = await this.constructionSiteModel.findOne({
        'externalIds.venueBoostSiteId': siteId,
        businessId: business._id
      });

      if (!site) {
        throw new NotFoundException(`Construction site with ID ${siteId} not found for business ${business._id}`);
      }

      // Update construction site status
      const updatedSite = await this.constructionSiteModel.findByIdAndUpdate(
        site._id,
        {
          $set: {
            status: status,
            'metadata.status': status,
            'metadata.lastSyncedAt': new Date()
          }
        },
        { new: true }
      );

      // If site is linked to an app project, update the construction site status there too
      if (site.appProjectId) {
        await this.appProjectModel.findByIdAndUpdate(
          site.appProjectId,
          {
            $set: {
              'metadata.constructionSite.status': status
            }
          }
        );
      }

      this.logger.log(`Updated status for construction site ${site._id} to ${status}`);
      return updatedSite;
    } catch (error) {
      this.logger.error(`Error in updateSiteStatus: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete construction site
   */
  async deleteSite(siteId: string, clientId: string, venueId: string): Promise<boolean> {
    try {
      // Find business by venueId and clientId
      const business = await this.findBusinessByExternalId(clientId, venueId);
      if (!business) {
        throw new NotFoundException(`Business with venue ID ${venueId} not found for client ${clientId}`);
      }

      // Find site by external ID
      const site = await this.constructionSiteModel.findOne({
        'externalIds.venueBoostSiteId': siteId,
        businessId: business._id
      });

      if (!site) {
        throw new NotFoundException(`Construction site with ID ${siteId} not found for business ${business._id}`);
      }

      // Mark as deleted instead of actual deletion
      await this.constructionSiteModel.findByIdAndUpdate(site._id, { 
        $set: { 
          isDeleted: true, 
          deletedAt: new Date(),
          'metadata.lastSyncedAt': new Date()
        }
      });

      // If site is linked to an app project, update the metadata there too
      if (site.appProjectId) {
        await this.appProjectModel.findByIdAndUpdate(
          site.appProjectId,
          {
            $set: {
              'metadata.constructionSite.isDeleted': true,
              'metadata.constructionSite.deletedAt': new Date()
            }
          }
        );
      }

      this.logger.log(`Deleted construction site ${site._id} with venueBoostSiteId ${siteId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error in deleteSite: ${error.message}`, error.stack);
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