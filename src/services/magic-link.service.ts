import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MagicLinkToken } from '../schemas/magic-link-token.schema';
import { User } from '../schemas/user.schema';
import { Business } from '../schemas/business.schema';
import { EmailService } from './email.service';
import { VenueBoostService } from './venueboost.service';
import { FeatureAccessService } from './feature-access.service';
import { SidebarFeatureService } from './sidebar-feature.service';
import { MagicLinkResponse } from '../interfaces/magic-link.interface';
import * as crypto from 'crypto';
import { AppClient } from '../schemas/app-client.schema';
import { Employee } from '../schemas/employee.schema';
import { STAFFLUENT_FEATURES, TIER_LIMITS } from '../constants/features.constants';

@Injectable()
export class MagicLinkService {
    private readonly logger = new Logger(MagicLinkService.name);

    constructor(
        @InjectModel(MagicLinkToken.name) private magicLinkTokenModel: Model<MagicLinkToken>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
        @InjectModel(Employee.name) private employeeModel: Model<Employee>,
        private emailService: EmailService,
        private venueBoostService: VenueBoostService,
        private featureAccessService: FeatureAccessService,
        private sidebarFeatureService: SidebarFeatureService
    ) {}

    /**
     * Generate a secure random token for magic links
     */
    private generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create a magic link token for a user
     * @param userId User ID
     * @returns Generated token
     */
    async createMagicLinkToken(userId: string): Promise<string> {
        // Delete any existing unused tokens for this user
        await this.magicLinkTokenModel.deleteMany({
            userId,
            used: false
        });

        const token = this.generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

        await this.magicLinkTokenModel.create({
            userId,
            token,
            expiresAt,
            used: false
        });

        return token;
    }

    /**
     * Find a user by email and send a magic link
     * @param email User's email address
     * @returns Success status
     */
    async sendMagicLinkByEmail(email: string): Promise<{ success: boolean; message: string }> {
        try {
            // Find user by email
            const user = await this.userModel.findOne({ email });
            if (!user) {
                return {
                    success: false,
                    message: 'No user found with this email address'
                };
            }

            // Find the user's business
            const business = await this.businessModel.findOne({ adminUserId: user._id });

            // Create a magic link token
            const token = await this.createMagicLinkToken(user._id.toString());

            // Determine the business name
            const businessName = business ? business.name : 'Your Business';

            // Build the magic link URL
            const magicLink = `${process.env.WEB_FRONTEND_URL}/magic-login?token=${token}`;

            // Send the email
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                email,
                'Login to Staffluent',
                'templates/business/magic-link-login.html',
                {
                    userName: user.name,
                    businessName,
                    magicLink
                }
            );

            return {
                success: true,
                message: 'Magic link sent successfully'
            };
        } catch (error) {
            this.logger.error(`Error sending magic link: ${error.message}`);
            return {
                success: false,
                message: 'Failed to send magic link'
            };
        }
    }

    /**
     * Send a magic link to a user after subscription finalization
     * @param businessId Business ID
     * @param clientId Client ID for validation
     * @returns Success status
     */
    async sendMagicLinkAfterSubscription(
        businessId: string,
        clientId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Find the business and verify it belongs to the client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId
            });

            if (!business) {
                return {
                    success: false,
                    message: 'Business not found or does not belong to this client'
                };
            }

            // Find the admin user
            const user = await this.userModel.findById(business.adminUserId);
            if (!user) {
                return {
                    success: false,
                    message: 'Admin user not found'
                };
            }

            // Create a magic link token
            const token = await this.createMagicLinkToken(user._id.toString());

            // Build the magic link URL - customize the path as needed
            const magicLink = `${process.env.WEB_FRONTEND_URL}/subscription-success/login?token=${token}`;

            // Send the email
            await this.emailService.sendTemplateEmail(
                'Staffluent',
                'staffluent@omnistackhub.xyz',
                user.email,
                'Access Your Staffluent Account',
                'templates/business/magic-link-login.html',
                {
                    userName: user.name,
                    businessName: business.name,
                    magicLink
                }
            );

            return {
                success: true,
                message: 'Magic link sent successfully'
            };
        } catch (error) {
            this.logger.error(`Error sending magic link after subscription: ${error.message}`);
            return {
                success: false,
                message: 'Failed to send magic link'
            };
        }
    }

    /**
     * Verify a magic link token and return authentication data
     * @param token Magic link token
     * @returns Authentication response
     */
    async verifyMagicLink(token: string): Promise<MagicLinkResponse> {
        try {
            // Find the magic link token
            const magicLinkToken = await this.magicLinkTokenModel.findOne({ token });

            // Check if token exists
            if (!magicLinkToken) {
                return {
                    status: 'invalid',
                    message: 'Invalid magic link token'
                };
            }

            // Check if token has been used
            if (magicLinkToken.used) {
                return {
                    status: 'used',
                    message: 'This magic link has already been used'
                };
            }

            // Check if token is expired
            if (magicLinkToken.expiresAt < new Date()) {
                return {
                    status: 'expired',
                    message: 'Magic link has expired'
                };
            }

            // Get the user
            const user = await this.userModel.findById(magicLinkToken.userId);
            if (!user) {
                return {
                    status: 'invalid',
                    message: 'User not found'
                };
            }

            // Mark the token as used
            await this.magicLinkTokenModel.findByIdAndUpdate(
                magicLinkToken._id,
                { $set: { used: true } }
            );

            // Determine user type and get appropriate data
            // 1. Check if user is a business admin
            const businessAsAdmin = await this.businessModel.findOne({ adminUserId: user._id });

            // 2. Check if user is a staff member (part of userIds in a business)
            const businessAsStaff = await this.businessModel.findOne({
                userIds: { $in: [user._id] }
            });

            // 3. Check if user is a client
            const appClient = await this.appClientModel.findOne({ user_id: user._id });

            // Get VenueBoost authentication data
            let auth_response = null;
            try {
                if (user.external_ids?.supabaseId) {
                    // If user is a business admin, use getConnection
                    if (businessAsAdmin) {
                        auth_response = await this.venueBoostService.getConnection(
                            user.email,
                            user.external_ids.supabaseId
                        );
                    }
                    // For staff and clients, use getStaffConnection
                    else if (businessAsStaff || appClient) {
                        auth_response = await this.venueBoostService.getStaffConnection(
                            user.email
                        );
                    }
                    else {
                        this.logger.warn(`Cannot get VenueBoost connection: User ${user._id} is not admin, staff, or client`);
                    }
                } else {
                    this.logger.warn(`Cannot get VenueBoost connection: No supabaseId found for user ${user._id}`);
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
                // Continue even if getting auth response fails
            }

            let role = 'unknown';
            let businessId = null;
            let clientId = null;
            let employeeId = null;
            let appClientId = null;
            let features = {};
            let sidebarLinks = [];
            let businessData = null;
            let employeeData = null;
            let clientData = null;

            // Process data based on user type
            if (businessAsAdmin) {
                // User is a business admin
                role = 'business_admin';
                businessId = businessAsAdmin._id.toString();

                // Get business features and links
                features = await this.getBusinessFeaturesForLogin(businessId, role);
                sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                    user._id.toString(),
                    role
                );

                businessData = {
                    name: businessAsAdmin.name,
                    email: businessAsAdmin.email,
                    type: businessAsAdmin.type,
                    subscriptionStatus: businessAsAdmin.subscriptionStatus,
                    subscriptionEndDate: businessAsAdmin.subscriptionEndDate
                };
            }
            else if (businessAsStaff) {
                // User is a staff member
                businessId = businessAsStaff._id.toString();

                // Get employee record
                const employee = await this.employeeModel.findOne({ user_id: user._id });

                if (employee) {
                    employeeId = employee._id.toString();
                    employeeData = {
                        id: employee._id,
                        name: employee.name,
                        email: employee.email,
                        external_ids: employee.external_ids
                    };

                    // Determine staff role
                    let staffRole = 'business_staff';
                    if (employee.metadata?.get('role')) {
                        staffRole = employee.metadata.get('role');
                    } else if (employee.metadata?.get('account_type')) {
                        staffRole = employee.metadata.get('account_type');
                    } else if (auth_response?.account_type) {
                        staffRole = auth_response.account_type;
                    }

                    role = staffRole;

                    // Get features filtered by role
                    features = await this.getBusinessFeaturesForLogin(businessId, role);

                    // Get sidebar links specific to the staff role
                    sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                        user._id.toString(),
                        role
                    );

                    businessData = {
                        name: businessAsStaff.name,
                        email: businessAsStaff.email,
                        type: businessAsStaff.type
                    };
                } else {
                    role = 'business_staff';
                    // Get generic staff features
                    features = await this.getBusinessFeaturesForLogin(businessId, role);
                    sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                        user._id.toString(),
                        role
                    );
                }
            }
            else if (appClient) {
                // User is a client
                role = 'app_client';
                appClientId = appClient._id.toString();
                clientId = appClient.clientId;

                // Get client-specific features and sidebar links
                features = await this.getClientFeaturesForLogin(appClient.businessId?.toString());
                sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                    user._id.toString(),
                    'app_client'
                );

                clientData = {
                    id: appClient._id,
                    name: appClient.name,
                    type: appClient.type,
                    email: appClient.email || user.email,
                    contact_person: appClient.contact_person,
                    external_ids: appClient.external_ids
                };

                // If client is linked to a business, include business ID
                if (appClient.businessId) {
                    businessId = appClient.businessId.toString();
                }
            }
            else {
                // Generic user without specific role
                features = {
                    features: [],
                    featureLimits: {},
                    subscription: { status: 'unknown' }
                };

                sidebarLinks = [];
            }

            // Create the response object
            const response: MagicLinkResponse = {
                status: 'success',
                message: 'Authentication successful',
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                role,
                auth_response,
                sidebarLinks,
                ...features
            };

            // Add optional properties only if they have values
            if (businessId) response.businessId = businessId;
            if (clientId) response.clientId = clientId;
            if (employeeId) response.employeeId = employeeId;
            if (appClientId) response.appClientId = appClientId;
            if (businessData) response.business = businessData;
            if (employeeData) response.employee = employeeData;
            if (clientData) response.client = clientData;

            return response;
        } catch (error) {
            this.logger.error(`Error verifying magic link: ${error.message}`, error.stack);
            return {
                status: 'invalid',
                message: 'Failed to verify magic link'
            };
        }
    }
    /**
     * Get client features for login
     */
    private async getClientFeaturesForLogin(businessId: string) {
        // For clients, we provide a specific set of features
        const clientFeatures = [
            STAFFLUENT_FEATURES.CLIENT_PORTAL,
            STAFFLUENT_FEATURES.CLIENT_COMMUNICATION,
            STAFFLUENT_FEATURES.CLIENT_FEEDBACK,
            STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS,
            STAFFLUENT_FEATURES.BASIC_REPORTS,
            STAFFLUENT_FEATURES.FILE_SHARING,
            STAFFLUENT_FEATURES.CLIENT_COMMUNICATION_CHANNELS,
            STAFFLUENT_FEATURES.CLIENT_PROJECTS,
            STAFFLUENT_FEATURES.DIGITAL_SIGNATURE_CAPTURE,
            STAFFLUENT_FEATURES.PHOTO_VERIFICATION,
            STAFFLUENT_FEATURES.WEATHER_MONITORING,
            STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL
        ];

        // If there's a business ID, we can add business-specific features
        if (businessId) {
            try {
                // Get the business to determine tier
                const business = await this.businessModel.findById(businessId);
                if (business) {
                    // Determine tier for features
                    let tier = 'basic';
                    if (business.subscriptionStatus === 'trialing') {
                        tier = 'trialing';
                    } else if (business.subscriptionDetails?.planId) {
                        const planId = business.subscriptionDetails.planId;
                        tier = planId.includes('basic') ? 'basic' :
                            planId.includes('professional') ? 'professional' :
                                planId.includes('enterprise') ? 'enterprise' : 'basic';
                    }

                    return {
                        features: clientFeatures,
                        featureLimits: TIER_LIMITS[tier] || {},
                        subscription: {
                            status: business.subscriptionStatus,
                            tier
                        }
                    };
                }
            } catch (error) {
                this.logger.error(`Error getting business for client features: ${error.message}`);
            }
        }

        // Default return if no business found
        return {
            features: clientFeatures,
            featureLimits: {},
            subscription: {status: 'client'}
        };
    }

    /**
     * Get business features for login, filtered by role
     */
    private async getBusinessFeaturesForLogin(businessId: string, role: string = 'business_admin') {
        try {
            // Get business and determine tier
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return {
                    features: [],
                    featureLimits: {},
                    customFeatures: [],
                    customLimits: {},
                    subscription: {status: 'not_found'}
                };
            }

            // Get available features
            let features = await this.featureAccessService.getBusinessFeatures(businessId);

            // Filter features based on role
            features = this.filterFeaturesByRole(features, role);

            // Get feature limits
            const featureLimits = await this.featureAccessService.getBusinessLimits(businessId);

            // Get custom features
            let customFeatures = [];
            try {
                const customFeaturesStr = business.metadata?.get('customFeatures');
                if (customFeaturesStr) {
                    customFeatures = JSON.parse(customFeaturesStr);
                }
            } catch (error) {
                this.logger.error(`Error parsing custom features: ${error.message}`);
                customFeatures = [];
            }

            // Get custom limits
            let customLimits = {};
            try {
                const customLimitsStr = business.metadata?.get('customLimits');
                if (customLimitsStr) {
                    customLimits = JSON.parse(customLimitsStr);
                }
            } catch (error) {
                this.logger.error(`Error parsing custom limits: ${error.message}`);
                customLimits = {};
            }

            // Determine tier
            let tier = 'basic';
            if (business.subscriptionStatus === 'trialing') {
                tier = 'trialing';
            } else if (business.subscriptionDetails?.planId) {
                const planId = business.subscriptionDetails.planId;
                tier = planId.includes('basic') ? 'basic' :
                    planId.includes('professional') ? 'professional' :
                        planId.includes('enterprise') ? 'enterprise' : 'basic';

                const tierFromMetadata = business.metadata?.get('subscriptionTier') || null;
                if (tierFromMetadata) {
                    tier = tierFromMetadata;
                }
            }

            return {
                features,
                featureLimits,
                customFeatures,
                customLimits,
                subscription: {
                    status: business.subscriptionStatus,
                    endDate: business.subscriptionEndDate,
                    tier,
                    details: business.subscriptionDetails
                }
            };
        } catch (error) {
            this.logger.error(`Error getting business features for login: ${error.message}`);
            return {
                features: [],
                featureLimits: {},
                customFeatures: [],
                customLimits: {},
                subscription: {status: 'error'}
            };
        }
    }

    /**
     * Filter features based on user role
     */
    private filterFeaturesByRole(features: string[], role: string): string[] {
        // Define role-specific features
        switch (role) {
            case 'business_admin':
                // Admins get all features
                return features;

            case 'business_operations_manager':
            case 'staff_operations_manager':
            case 'operations_manager':
                // Operations managers need substantial access to management features
                return [
                    // Keep existing management features but exclude these specific ones
                    ...features.filter(feature =>
                        !feature.includes('INVOICE_MANAGEMENT') &&
                        !feature.includes('API_ACCESS') &&
                        !feature.includes('MANAGER_DASHBOARD_ENHANCEMENTS')
                    ),
                    // Add these specific operations features
                    STAFFLUENT_FEATURES.OPERATIONS_DASHBOARD,
                    STAFFLUENT_FEATURES.MANAGER_DASHBOARD_ENHANCEMENTS,
                    STAFFLUENT_FEATURES.ANALYTICS_DASHBOARD,
                    STAFFLUENT_FEATURES.CLIENT_PROJECTS,
                    STAFFLUENT_FEATURES.CLIENT_FEEDBACK,
                    STAFFLUENT_FEATURES.SERVICE_REQUEST_PROCESSING,
                    STAFFLUENT_FEATURES.ADVANCED_QUALITY_CONTROL,
                    STAFFLUENT_FEATURES.COMPLIANCE_MONITORING,
                    STAFFLUENT_FEATURES.QUALITY_METRICS_DASHBOARD,
                    STAFFLUENT_FEATURES.ADVANCED_WORK_ORDER_MANAGEMENT,
                    STAFFLUENT_FEATURES.PRIORITY_MANAGEMENT,
                    STAFFLUENT_FEATURES.ASSIGNMENT_TRACKING,
                    STAFFLUENT_FEATURES.ADVANCED_REPORTS,
                    STAFFLUENT_FEATURES.PERFORMANCE_METRICS,
                    STAFFLUENT_FEATURES.RESOURCE_UTILIZATION,
                    STAFFLUENT_FEATURES.PROJECT_PROGRESS_ANALYTICS,
                    STAFFLUENT_FEATURES.EFFICIENCY_METRICS,
                    STAFFLUENT_FEATURES.COMPLIANCE_REPORTING
                ];

            case 'business_team_leader':
            case 'staff_team_leader':
            case 'team_leader':
                // Team leaders get team management, scheduling, and limited features
                return [
                    STAFFLUENT_FEATURES.STAFF_DASHBOARD,
                    STAFFLUENT_FEATURES.TEAM_LEADER_DASHBOARD,
                    STAFFLUENT_FEATURES.BASIC_TIME_TRACKING,
                    STAFFLUENT_FEATURES.ADVANCED_TIME_TRACKING,
                    STAFFLUENT_FEATURES.TIMESHEET_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_PROJECT_MANAGEMENT,
                    STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_TASK_MANAGEMENT,
                    STAFFLUENT_FEATURES.ADVANCED_TASK_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_SCHEDULING,
                    STAFFLUENT_FEATURES.ADVANCED_SCHEDULING,
                    STAFFLUENT_FEATURES.SHIFT_PLANNING,
                    STAFFLUENT_FEATURES.AVAILABILITY_TRACKING,
                    STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT,
                    STAFFLUENT_FEATURES.TEAM_COLLABORATION,
                    STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL,
                    STAFFLUENT_FEATURES.INSPECTION_CHECKLISTS,
                    STAFFLUENT_FEATURES.BASIC_COMMUNICATION,
                    STAFFLUENT_FEATURES.ADVANCED_COMMUNICATION,
                    STAFFLUENT_FEATURES.TEAM_CHAT,
                    STAFFLUENT_FEATURES.NOTIFICATIONS_SYSTEM,
                    STAFFLUENT_FEATURES.BASIC_REPORTS,
                    STAFFLUENT_FEATURES.BASIC_MOBILE_ACCESS,
                    STAFFLUENT_FEATURES.PERFORMANCE_TRACKING
                ];

            case 'business_staff':
            case 'staff':
                // Regular staff get basic features only
                return [
                    // Basic staff features
                    STAFFLUENT_FEATURES.STAFF_DASHBOARD,
                    STAFFLUENT_FEATURES.BASIC_TIME_TRACKING,
                    STAFFLUENT_FEATURES.BREAK_MANAGEMENT,
                    STAFFLUENT_FEATURES.TIMESHEET_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_TASK_MANAGEMENT,
                    STAFFLUENT_FEATURES.BASIC_COMMUNICATION,
                    STAFFLUENT_FEATURES.NOTIFICATIONS_SYSTEM,
                    STAFFLUENT_FEATURES.BASIC_MOBILE_ACCESS,

                    // Field worker specific features
                    STAFFLUENT_FEATURES.GPS_TIME_TRACKING,
                    STAFFLUENT_FEATURES.PHOTO_DOCUMENT_UPLOAD,
                    STAFFLUENT_FEATURES.MOBILE_TICKET_MANAGEMENT,
                    STAFFLUENT_FEATURES.DIGITAL_SIGNATURE_CAPTURE,
                    STAFFLUENT_FEATURES.SAFETY_INCIDENT_REPORTING,
                    STAFFLUENT_FEATURES.EQUIPMENT_TIME_TRACKING,
                    STAFFLUENT_FEATURES.INSPECTION_DOCUMENTATION,
                    STAFFLUENT_FEATURES.PROGRESS_PHOTO_UPLOADS,
                    STAFFLUENT_FEATURES.OFFLINE_CAPABILITIES
                ];

            case 'app_client':
            case 'client':
                // Clients get client-specific features
                return [
                    STAFFLUENT_FEATURES.CLIENT_PORTAL,
                    STAFFLUENT_FEATURES.CLIENT_COMMUNICATION,
                    STAFFLUENT_FEATURES.CLIENT_FEEDBACK,
                    STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS,
                    STAFFLUENT_FEATURES.BASIC_REPORTS,
                    STAFFLUENT_FEATURES.FILE_SHARING,
                    STAFFLUENT_FEATURES.CLIENT_COMMUNICATION_CHANNELS,
                    STAFFLUENT_FEATURES.CLIENT_PROJECTS, // To view their projects
                    STAFFLUENT_FEATURES.DIGITAL_SIGNATURE_CAPTURE, // For approvals
                    STAFFLUENT_FEATURES.PHOTO_VERIFICATION, // To view site progress
                    STAFFLUENT_FEATURES.WEATHER_MONITORING, // For weather alerts
                    STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL // To view quality reports
                ];

            default:
                // Default - filter to basic features only
                return features.filter(feature =>
                    feature.includes('BASIC_') ||
                    feature.includes('STAFF_DASHBOARD')
                );
        }
    }

}