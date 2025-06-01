// src/services/auth.service.ts
import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { FeatureAccessService } from './feature-access.service';
import { SidebarFeatureService } from './sidebar-feature.service';
import * as bcrypt from 'bcrypt';
import { SalesAssociateLoginDto } from "../dtos/user.dto";
import { StaffluentsBusinessAdminLoginDto, StaffluentsBusinessStaffLoginDto, StaffluentsClientLoginDto } from "../dtos/staffluent-login.dto";
import { Store } from "../schemas/store.schema";
import { User, RegistrationSource } from "../schemas/user.schema";
import { Business } from "../schemas/business.schema";
import { Model } from 'mongoose';
import { InjectModel } from "@nestjs/mongoose";
import { VenueBoostService } from './venueboost.service';
import { TIER_FEATURES, TIER_LIMITS, STAFFLUENT_FEATURES } from '../constants/features.constants';
import { AppClient } from "../schemas/app-client.schema";
import { Employee } from "../schemas/employee.schema";
import {SnapfoodLoginDto} from "../dtos/snapfood-login.dto";
import { generateBusinessApiKey } from 'src/utils/business-api-key.utils';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private featureAccessService: FeatureAccessService,
        private sidebarFeatureService: SidebarFeatureService,
        private venueBoostService: VenueBoostService,
        @InjectModel(Store.name) private storeModel: Model<Store>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(AppClient.name) private appClientModel: Model<AppClient>,
        @InjectModel(Employee.name) private employeeModel: Model<Employee>
    ) {}

    async salesAssociateLogin(loginDto: SalesAssociateLoginDto) {
        // Find user first
        const user = await this.userService.findByEmailForStore(loginDto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // If user has storeIds, get the first store
        let store = null;
        if (user.storeIds && user.storeIds.length > 0) {
            const firstStore = await this.storeModel.findById(user.storeIds[0])
                .populate('address')
                .exec();

            if (firstStore) {
                store = {
                    id: firstStore._id,
                    name: firstStore.name,
                    code: firstStore.code,
                    address: firstStore.address,
                    clientId: firstStore.clientId,
                    externalIds: firstStore.externalIds,
                    metadata: firstStore.metadata
                };
            }
        }

        // Rest of your code...
        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            // permissions: verificationResult.permissions,
            store: store,
            clientId: store.clientId
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                // permissions: verificationResult.permissions,
                store: store,
                external_ids: user.external_ids,
                client_ids: user.client_ids,
                metadata: user.metadata,
                storeIds: user.storeIds
            }
        };
    }


    /**
     * Unified login method that detects the user type and calls the appropriate login method
     */
    async staffluentsUnifiedLogin(loginDto: StaffluentsBusinessAdminLoginDto) {
        try {
            // Step 1: Find and authenticate the user
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Step 2: Check if user is a business admin
            const businessAsAdmin = await this.businessModel.findOne({ adminUserId: user._id });
            if (businessAsAdmin) {
                this.logger.log(`User ${user.email} is a business admin`);

                // Call the existing business admin login logic
                return await this.staffluentsBusinessAdminLogin({
                    email: loginDto.email,
                    password: loginDto.password
                });
            }

            // Step 3: Check if user is a business staff
            const businessAsStaff = await this.businessModel.findOne({
                userIds: { $in: [user._id] }
            });

            if (businessAsStaff) {
                this.logger.log(`User ${user.email} is a business staff member`);

                // Call the existing business staff login logic
                return await this.staffluentsBusinessStaffLogin({
                    email: loginDto.email,
                    password: loginDto.password
                });
            }

            // Step 4: Check if user is a client
            const appClient = await this.appClientModel.findOne({ user_id: user._id });
            if (appClient) {
                this.logger.log(`User ${user.email} is a client`);

                // Call the existing client login logic
                return await this.staffluentsClientLogin({
                    email: loginDto.email,
                    password: loginDto.password
                });
            }

            // If user doesn't match any type, throw error
            throw new NotFoundException('User account type could not be determined');
        } catch (error) {
            this.logger.error(`Error in staffluentsUnifiedLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }

    async staffluentsBusinessAdminLogin(loginDto: StaffluentsBusinessAdminLoginDto) {
        try {
            // Find user by email for Staffluent
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Find the business for this admin user
            const business = await this.businessModel.findOne({adminUserId: user._id});
            if (!business) {
                throw new NotFoundException('No business found for this user');
            }

            // Get VenueBoost authentication data if available
            let auth_response = null;
            try {
                if (user.external_ids?.supabaseId) {
                    auth_response = await this.venueBoostService.getConnection(
                        user.email,
                        user.external_ids.supabaseId
                    );
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
                // Continue even if getting auth response fails
            }

            // Get features and subscription details
            const businessFeatures = await this.getBusinessFeaturesForLogin(business._id.toString(), 'business_admin');

            // Get sidebar links for business admin
            const sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                user._id.toString(),
                'business_admin'
            );

            // Generate JWT token
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                businessId: business._id.toString(),
                clientId: business.clientId,
                role: 'business_admin'
            });
        
            // Generate or retrieve business API key
            if (!business.apiKey) {
                // Generate a new API key if not exists
                business.apiKey = generateBusinessApiKey();
                await business.save();
            }
            return {
                status: 'success',
                message: 'Authentication successful',
                token,
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                businessId: business._id.toString(),
                apiKey: business.apiKey,
                business: {
                    name: business.name,
                    email: business.email,
                    type: business.type,
                    subscriptionStatus: business.subscriptionStatus,
                    subscriptionEndDate: business.subscriptionEndDate
                },
                auth_response,
                sidebarLinks,
                ...businessFeatures
            };
        } catch (error) {
            this.logger.error(`Error in staffluentsBusinessAdminLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }

    /**
     * Login for business staff users
     */
    async staffluentsBusinessStaffLogin(loginDto: StaffluentsBusinessStaffLoginDto) {
        try {
            // Find and authenticate user
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Find employee record for this user
            const employee = await this.employeeModel.findOne({user_id: user._id});
            if (!employee) {
                throw new NotFoundException('No employee record found for this user');
            }

            // Find business where this employee belongs
            const business = await this.businessModel.findOne({
                userIds: {$in: [user._id]}
            });

            if (!business) {
                throw new NotFoundException('No business found for this employee');
            }

            // Get VenueBoost connection data
            let staffConnectionData = null;
            try {
                staffConnectionData = await this.venueBoostService.getStaffConnection(
                    user.email
                );
            } catch (error) {
                this.logger.error(`Error getting staff connection: ${error.message}`);
                // Continue even if VenueBoost connection fails
            }

            // Determine role from staff connection or employee data
            const role = staffConnectionData?.account_type ||
                employee.metadata?.get('role') ||
                'business_staff';

            // Get features filtered by role
            const featuresInfo = await this.getBusinessFeaturesForLogin(
                business._id.toString(),
                role
            );

            // Get sidebar links specific to the staff role
            const sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                user._id.toString(),
                role
            );

            // Generate JWT token with appropriate claims
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                businessId: business._id.toString(),
                clientId: business.clientId,
                employeeId: employee._id.toString(),
                role: role
            });

            // Construct final response
            return {
                status: 'success',
                message: 'Staff authentication successful',
                token,
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                businessId: business._id.toString(),
                employeeId: employee._id.toString(),
                business: {
                    name: business.name,
                    email: business.email,
                    type: business.type
                },
                employee: {
                    id: employee._id,
                    name: employee.name,
                    email: employee.email,
                    external_ids: employee.external_ids
                },
                auth_response: staffConnectionData,
                account_type: role,
                sidebarLinks,
                operationType: business.operationType,
                ...featuresInfo
            };
        } catch (error) {
            this.logger.error(`Error in staffluentsBusinessStaffLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Staff login failed');
        }
    }

   /**
     * Login for mobile staff users
     */
    async staffluentMobileLogin(loginDto: {
        email: string;
        password: string;
        source_app?: string;
        firebase_token?: string;
        device_id?: string;
        device_type?: string;
        device_model?: string;
        os_version?: string;
        app_version?: string;
    }) {
        try {
            // Find and authenticate user
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Find employee record for this user
            const employee = await this.employeeModel.findOne({user_id: user._id});
            if (!employee) {
                throw new NotFoundException('No employee record found for this user');
            }

            // Find business where this employee belongs
            const business = await this.businessModel.findOne({
                userIds: {$in: [user._id]}
            });

            if (!business) {
                throw new NotFoundException('No business found for this employee');
            }

            // Get mobile authentication data from PHP backend
            let mobileAuthData = null;
            try {
                // Pass all the authentication data to PHP
                mobileAuthData = await this.venueBoostService.getMobileStaffConnection({
                    email: loginDto.email,
                    password: loginDto.password,
                    source_app: loginDto.source_app || 'staff',
                    firebase_token: loginDto.firebase_token || '',
                    device_id: loginDto.device_id || '',
                    device_type: loginDto.device_type || 'mobile',
                    device_model: loginDto.device_model || '',
                    os_version: loginDto.os_version || '',
                    app_version: loginDto.app_version || ''
                });
            } catch (error) {
                this.logger.error(`Error getting mobile staff connection: ${error.message}`);
                throw new UnauthorizedException(`Error getting mobile staff connection: ${error.message}`);
            }

            // Determine role from PHP response or employee data
            const role =
                employee.metadata?.get('role') ||
                'business_staff';

            // Get features filtered by role
            const featuresInfo = await this.getBusinessFeaturesForLogin(
                business._id.toString(),
                role
            );

            // Determine employee capabilities with business defaults as fallback
            const allow_clockinout = employee.allow_clockinout !== null 
                ? employee.allow_clockinout 
                : (business.allow_clockinout || false);

            const has_app_access = employee.has_app_access !== null 
                ? employee.has_app_access 
                : (business.has_app_access || false);

            const allow_checkin = employee.allow_checkin !== null 
                ? employee.allow_checkin 
                : (business.allow_checkin || false);

            // If app access is denied, throw an error
            if (!has_app_access) {
                throw new UnauthorizedException('You do not have access to the mobile application');
            }

            // Return mobile auth data augmented with our business info and features
            return {
                ...mobileAuthData, // Include all PHP response data
                osUserId: user._id.toString(),
                osBusinessId: business._id.toString(),
                osEmployeeId: employee._id.toString(),
                osBusiness: {
                    name: business.name,
                    email: business.email,
                    type: business.type
                },
                osmployee: {
                    id: employee._id,
                    name: employee.name,
                    email: employee.email,
                    external_ids: employee.external_ids
                },
                // Set these based on business and employee settings
                allow_clockinout,
                has_app_access,
                allow_checkin,
                account_type: role,
                ...featuresInfo
            };
        } catch (error) {
            this.logger.error(`Error in staffluentMobileLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException(error);
        }
    }

    /**
     * Login for client users
     */
    async staffluentsClientLogin(loginDto: StaffluentsClientLoginDto) {
        try {
            // Find and authenticate user
            const user = await this.userModel.findOne({
                email: loginDto.email,
                registrationSource: RegistrationSource.STAFFLUENT
            });

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Find AppClient record for this user
            const appClient = await this.appClientModel.findOne({user_id: user._id});
            if (!appClient) {
                throw new NotFoundException('No client record found for this user');
            }

            // Get VenueBoost connection data
            let clientConnectionData = null;
            try {
                clientConnectionData = await this.venueBoostService.getStaffConnection(
                    user.email
                );
            } catch (error) {
                this.logger.error(`Error getting client connection: ${error.message}`);
                // Continue even if VenueBoost connection fails
            }

            // Get client-specific sidebar links
            const sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                user._id.toString(),
                'app_client'
            );

            // Get client-specific features (without limits and subscription)
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

            // Generate JWT token with appropriate claims
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                clientId: appClient.clientId,
                appClientId: appClient._id.toString(),
                role: 'app_client'
            });

            // Construct final response - REMOVED featureLimits and subscription
            return {
                status: 'success',
                message: 'Client authentication successful',
                token,
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                clientId: appClient.clientId,
                appClientId: appClient._id.toString(),
                client: {
                    id: appClient._id,
                    name: appClient.name,
                    type: appClient.type,
                    email: appClient.email || user.email,
                    contact_person: appClient.contact_person,
                    external_ids: appClient.external_ids
                },
                auth_response: clientConnectionData,
                account_type: clientConnectionData?.account_type || 'client',
                sidebarLinks,
                features: clientFeatures
                // REMOVED: featureLimits, subscription
            };
        } catch (error) {
            this.logger.error(`Error in staffluentsClientLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Client login failed');
        }
    }

    /**
     * Get business features for login, filtered by role
     */
    async getBusinessFeaturesForLogin(businessId: string, role: string = 'business_admin') {
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
                },
                tierFeatures: TIER_FEATURES,
                tierLimits: TIER_LIMITS
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
     * Get client features for login
     */
    async getClientFeaturesForLogin(businessId: string) {
        // For clients, we provide a specific set of features
        const clientFeatures = [
            STAFFLUENT_FEATURES.CLIENT_PORTAL,
            STAFFLUENT_FEATURES.CLIENT_COMMUNICATION,
            STAFFLUENT_FEATURES.CLIENT_FEEDBACK,
            STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS,
            STAFFLUENT_FEATURES.BASIC_REPORTS,
            STAFFLUENT_FEATURES.FILE_SHARING,
            STAFFLUENT_FEATURES.CLIENT_COMMUNICATION_CHANNELS
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


    /**
     * Retrieves business admin details by user ID without requiring email/password authentication
     * @param userId The ID of the user to authenticate as a business admin
     * @returns Authentication and business details similar to staffluentsBusinessAdminLogin
     */
    async getBusinessAdminByUserId(userId: string) {
        try {
            // Find user by ID
            const user = await this.userModel.findById(userId);
            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Verify user is from Staffluent
            if (user.registrationSource !== RegistrationSource.STAFFLUENT) {
                throw new UnauthorizedException('User is not a Staffluent user');
            }

            // Find the business for this admin user
            const business = await this.businessModel.findOne({adminUserId: user._id});
            if (!business) {
                throw new NotFoundException('No business found for this user');
            }

            // Get VenueBoost authentication data if available
            let auth_response = null;
            try {
                if (user.external_ids?.supabaseId) {
                    auth_response = await this.venueBoostService.getConnection(
                        user.email,
                        user.external_ids.supabaseId
                    );
                }
            } catch (error) {
                this.logger.error(`Error getting VenueBoost connection: ${error.message}`);
                // Continue even if getting auth response fails
            }

            // Get features and subscription details
            const businessFeatures = await this.getBusinessFeaturesForLogin(business._id.toString(), 'business_admin');

            // Get sidebar links for business admin
            const sidebarLinks = await this.sidebarFeatureService.getSidebarLinksByRole(
                user._id.toString(),
                'business_admin'
            );

            // Generate JWT token
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                businessId: business._id.toString(),
                clientId: business.clientId,
                role: 'business_admin'
            });

            return {
                status: 'success',
                message: 'Authentication successful',
                token,
                userId: user._id.toString(),
                has_changed_password: user.metadata?.get('has_changed_password') === 'true',
                businessId: business._id.toString(),
                business: {
                    name: business.name,
                    email: business.email,
                    type: business.type,
                    subscriptionStatus: business.subscriptionStatus,
                    subscriptionEndDate: business.subscriptionEndDate
                },
                auth_response,
                sidebarLinks,
                ...businessFeatures
            };
        } catch (error) {
            this.logger.error(`Error in getBusinessAdminByUserId: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Authentication failed');
        }
    }

    /**
     * Login for Snapfood users
     */
    async snapfoodLogin(loginDto: SnapfoodLoginDto) {
        try {
            // Build query based on provided credentials
            const query: any = {
                registrationSource: RegistrationSource.SNAPFOOD
            };

            if (loginDto.email) {
                query.email = loginDto.email;
            } else if (loginDto.snapFoodId) {
                // Convert snapFoodId to a number if it's provided as a string but stored as a number
                const snapFoodIdValue = isNaN(Number(loginDto.snapFoodId))
                    ? loginDto.snapFoodId
                    : Number(loginDto.snapFoodId);

                query['external_ids.snapFoodId'] = snapFoodIdValue;
            } else {
                throw new UnauthorizedException('Either email or SnapFood ID must be provided');
            }

            // Find user by the constructed query
            const user = await this.userModel.findOne(query);

            if (!user) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Get the first client ID from the user's client_ids array
            const clientId = user.client_ids && user.client_ids.length > 0
                ? user.client_ids[0]
                : null;

            if (!clientId) {
                throw new NotFoundException('No client associated with this user');
            }

            // Generate JWT token
            const token = this.jwtService.sign({
                sub: user._id.toString(),
                email: user.email,
                clientId: clientId,
                registrationSource: RegistrationSource.SNAPFOOD,
                role: 'snapfood_user'
            });

            // Convert Map to regular object for metadata
            const metadataObj = {};
            if (user.metadata) {
                for (const [key, value] of user.metadata.entries()) {
                    metadataObj[key] = value;
                }
            }

            // Return user info with token
            return {
                status: 'success',
                message: 'Authentication successful',
                token,
                userId: user._id.toString(),
                clientId: clientId,
                user: {
                    id: user._id,
                    name: user.name,
                    surname: user.surname,
                    email: user.email,
                    external_ids: user.external_ids,
                    metadata: metadataObj,
                    notifications: user.notifications || {
                        oneSignalId: null,
                        deviceTokens: [],
                        preferences: {
                            chatNotifications: true,
                            marketingNotifications: true,
                            mutedChats: []
                        }
                    },
                    isActive: user.isActive,
                    clientTiers: user.clientTiers || {}
                }
            };
        } catch (error) {
            this.logger.error(`Error in snapfoodLogin: ${error.message}`);
            if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }
}