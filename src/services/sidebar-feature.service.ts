// src/services/sidebar-feature.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { FeatureAccessService } from './feature-access.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee } from '../schemas/employee.schema';
import { AppClient } from '../schemas/app-client.schema';
import { Business } from '../schemas/business.schema';
import { STAFFLUENT_FEATURES } from '../constants/features.constants';
import {
    businessAdminLinks,
    teamLeaderLinks,
    operationsManagerLinks,
    clientLinks,
    staffLinks,
    SideLink
} from '../constants/sidebar-links.constants';

@Injectable()
export class SidebarFeatureService {
    private readonly logger = new Logger(SidebarFeatureService.name);

    constructor(
        private featureAccessService: FeatureAccessService,
        @InjectModel(Employee.name) private employeeModel: Model<Employee>,
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
        @InjectModel(Business.name) private businessModel: Model<Business>
    ) {}

    /**
     * Get sidebar links based on user role
     */
    async getSidebarLinksByRole(userId: string, role: string): Promise<SideLink[]> {
        try {
            this.logger.log(`Getting sidebar links for user ${userId} with role ${role}`);

            // If role is explicitly provided, use it to determine sidebar links
            switch (role) {
                case 'app_client':
                case 'client':
                    return clientLinks;

                case 'business_admin':
                    return businessAdminLinks;

                case 'staff_team_leader':
                case 'business_team_leader':
                case 'team_leader':
                    return teamLeaderLinks;

                case 'staff_operations_manager':
                case 'business_operations_manager':
                case 'operations_manager':
                    return operationsManagerLinks;

                case 'staff':
                case 'business_staff':
                    return staffLinks;

                default:
                    // If role is not recognized, try to determine from employee or client records
                    return await this.determineUserSidebarLinks(userId);
            }
        } catch (error) {
            this.logger.error(`Error getting sidebar links: ${error.message}`);
            return [];
        }
    }

    /**
     * Determine sidebar links based on user records
     */
    private async determineUserSidebarLinks(userId: string): Promise<SideLink[]> {
        try {
            // Check if user is an app client
            const appClient = await this.appClientModel.findOne({ user_id: userId });
            if (appClient) {
                return clientLinks;
            }

            // Check if user is an employee and determine role
            const employee = await this.employeeModel.findOne({ user_id: userId });
            if (employee) {
                // Check role from metadata
                const roleFromMetadata = employee.metadata?.get('role') ||
                    employee.metadata?.get('account_type');

                if (roleFromMetadata) {
                    if (roleFromMetadata.includes('team_leader')) {
                        return teamLeaderLinks;
                    }
                    if (roleFromMetadata.includes('operations_manager')) {
                        return operationsManagerLinks;
                    }
                }

                // Default to staff links for employees
                return staffLinks;
            }

            // Check if user is a business admin
            const business = await this.businessModel.findOne({ adminUserId: userId });
            if (business) {
                return businessAdminLinks;
            }

            // Default to an empty array if role cannot be determined
            return [];
        } catch (error) {
            this.logger.error(`Error determining user sidebar links: ${error.message}`);
            return [];
        }
    }

    /**
     * Get business sidebar links (for backward compatibility)
     */
    async getBusinessSidebarLinks(businessId: string): Promise<SideLink[]> {
        try {
            // Find the business
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return [];
            }

            // Get available features for the business
            const availableFeatures = await this.featureAccessService.getBusinessFeatures(businessId);

            // For backward compatibility, return business admin links
            // In a more comprehensive implementation, you might want to filter these links
            // based on available features
            return businessAdminLinks;
        } catch (error) {
            this.logger.error(`Error getting business sidebar links: ${error.message}`);
            return [];
        }
    }
}