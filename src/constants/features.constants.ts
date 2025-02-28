// src/constants/features.constants.ts
/**
 * Define all features available in the Staffluent platform
 */
export const STAFFLUENT_FEATURES = {
    // Dashboard Features
    TEAM_LEADER_DASHBOARD: 'team_leader_dashboard',
    STAFF_DASHBOARD: 'staff_dashboard',
    OPERATIONS_DASHBOARD: 'operations_dashboard',

    // Project Management
    BASIC_PROJECT_MANAGEMENT: 'basic_project_management',
    ADVANCED_PROJECT_MANAGEMENT: 'advanced_project_management',

    // Task Management
    BASIC_TASK_MANAGEMENT: 'basic_task_management',
    ADVANCED_TASK_MANAGEMENT: 'advanced_task_management',

    // Time & Attendance
    BASIC_TIME_TRACKING: 'basic_time_tracking',
    ADVANCED_TIME_TRACKING: 'advanced_time_tracking',
    GPS_TIME_TRACKING: 'gps_time_tracking',

    // Scheduling
    BASIC_SCHEDULING: 'basic_scheduling',
    ADVANCED_SCHEDULING: 'advanced_scheduling',

    // Client Management
    CLIENT_LIST: 'client_list',
    CLIENT_PROJECTS: 'client_projects',
    CLIENT_FEEDBACK: 'client_feedback',
    CLIENT_SIGN_OFFS: 'client_sign_offs',
    CLIENT_PORTAL: 'client_portal',

    // Quality Control
    BASIC_QUALITY_CONTROL: 'basic_quality_control',
    ADVANCED_QUALITY_CONTROL: 'advanced_quality_control',
    COMPLIANCE_MANAGEMENT: 'compliance_management',
    SAFETY_MANAGEMENT: 'safety_management',

    // Equipment Management
    BASIC_EQUIPMENT_MANAGEMENT: 'basic_equipment_management',
    ADVANCED_EQUIPMENT_MANAGEMENT: 'advanced_equipment_management',

    // Reports & Analytics
    BASIC_REPORTS: 'basic_reports',
    ADVANCED_REPORTS: 'advanced_reports',
    CUSTOM_ANALYTICS: 'custom_analytics',

    // Communication
    BASIC_COMMUNICATION: 'basic_communication',
    ADVANCED_COMMUNICATION: 'advanced_communication',

    // Mobile Access
    BASIC_MOBILE_ACCESS: 'basic_mobile_access',
    FIELD_WORKER_FEATURES: 'field_worker_features',

    // Integrations
    BASIC_INTEGRATIONS: 'basic_integrations',
    MULTIPLE_INTEGRATIONS: 'multiple_integrations',
    UNLIMITED_INTEGRATIONS: 'unlimited_integrations',
    API_ACCESS: 'api_access',

    // Support
    STANDARD_SUPPORT: 'standard_support',
    PRIORITY_SUPPORT: 'priority_support',
    PREMIUM_SUPPORT: 'premium_support',

    // Team Management
    BASIC_TEAM_MANAGEMENT: 'basic_team_management',
    ADVANCED_TEAM_MANAGEMENT: 'advanced_team_management',

    // Site Management
    BASIC_SITE_MANAGEMENT: 'basic_site_management',
    ADVANCED_SITE_MANAGEMENT: 'advanced_site_management',

    // Supply Management
    BASIC_SUPPLY_MANAGEMENT: 'basic_supply_management',
    ADVANCED_SUPPLY_MANAGEMENT: 'advanced_supply_management',

    // Field Operations
    BASIC_FIELD_OPERATIONS: 'basic_field_operations',
    ADVANCED_FIELD_OPERATIONS: 'advanced_field_operations',

    // Invoice Management
    BASIC_INVOICE_MANAGEMENT: 'basic_invoice_management',
    ADVANCED_INVOICE_MANAGEMENT: 'advanced_invoice_management',

    // Leave Management
    BASIC_LEAVE_MANAGEMENT: 'basic_leave_management',
    ADVANCED_LEAVE_MANAGEMENT: 'advanced_leave_management',

    // Overtime Management
    BASIC_OVERTIME_MANAGEMENT: 'basic_overtime_management',
    ADVANCED_OVERTIME_MANAGEMENT: 'advanced_overtime_management',
};

// Define basic tier features first
const BASIC_TIER_FEATURES = [
    // Dashboard
    STAFFLUENT_FEATURES.TEAM_LEADER_DASHBOARD,
    STAFFLUENT_FEATURES.STAFF_DASHBOARD,

    // Project & Task Management
    STAFFLUENT_FEATURES.BASIC_PROJECT_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_TASK_MANAGEMENT,

    // Time & Attendance
    STAFFLUENT_FEATURES.BASIC_TIME_TRACKING,

    // Scheduling
    STAFFLUENT_FEATURES.BASIC_SCHEDULING,

    // Reports & Communication
    STAFFLUENT_FEATURES.BASIC_REPORTS,
    STAFFLUENT_FEATURES.BASIC_COMMUNICATION,

    // Mobile & Team Management
    STAFFLUENT_FEATURES.BASIC_MOBILE_ACCESS,
    STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT,

    // Support & Integrations
    STAFFLUENT_FEATURES.STANDARD_SUPPORT,
    STAFFLUENT_FEATURES.BASIC_INTEGRATIONS,

    // Leave & Overtime
    STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_OVERTIME_MANAGEMENT,
];

// Define professional tier additional features
const PROFESSIONAL_TIER_ADDITIONAL_FEATURES = [
    // Enhanced Project & Task Management
    STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_TASK_MANAGEMENT,

    // Enhanced Time & Scheduling
    STAFFLUENT_FEATURES.ADVANCED_TIME_TRACKING,
    STAFFLUENT_FEATURES.ADVANCED_SCHEDULING,

    // Quality Control
    STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL,

    // Enhanced Reports & Communication
    STAFFLUENT_FEATURES.ADVANCED_REPORTS,
    STAFFLUENT_FEATURES.ADVANCED_COMMUNICATION,

    // Client Management
    STAFFLUENT_FEATURES.CLIENT_LIST,
    STAFFLUENT_FEATURES.CLIENT_PROJECTS,
    STAFFLUENT_FEATURES.CLIENT_FEEDBACK,

    // Basic Equipment, Site, Supply, Field Ops
    STAFFLUENT_FEATURES.BASIC_EQUIPMENT_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_SITE_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_SUPPLY_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_FIELD_OPERATIONS,

    // Invoice Management
    STAFFLUENT_FEATURES.BASIC_INVOICE_MANAGEMENT,

    // Enhanced Support & Integrations
    STAFFLUENT_FEATURES.PRIORITY_SUPPORT,
    STAFFLUENT_FEATURES.MULTIPLE_INTEGRATIONS,

    // Enhanced Leave & Overtime
    STAFFLUENT_FEATURES.ADVANCED_LEAVE_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_OVERTIME_MANAGEMENT,
];

// Define enterprise tier additional features
const ENTERPRISE_TIER_ADDITIONAL_FEATURES = [
    // Operations Dashboard
    STAFFLUENT_FEATURES.OPERATIONS_DASHBOARD,

    // GPS Time Tracking
    STAFFLUENT_FEATURES.GPS_TIME_TRACKING,

    // Enhanced Client Management
    STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS,
    STAFFLUENT_FEATURES.CLIENT_PORTAL,

    // Enhanced Quality Control
    STAFFLUENT_FEATURES.ADVANCED_QUALITY_CONTROL,
    STAFFLUENT_FEATURES.COMPLIANCE_MANAGEMENT,
    STAFFLUENT_FEATURES.SAFETY_MANAGEMENT,

    // Enhanced Equipment, Site, Supply, Field Ops
    STAFFLUENT_FEATURES.ADVANCED_EQUIPMENT_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_FIELD_OPERATIONS,

    // Advanced Analytics & Field Worker Features
    STAFFLUENT_FEATURES.CUSTOM_ANALYTICS,
    STAFFLUENT_FEATURES.FIELD_WORKER_FEATURES,

    // Advanced Team Management & Invoice Management
    STAFFLUENT_FEATURES.ADVANCED_TEAM_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_INVOICE_MANAGEMENT,

    // Premium Support & API Access
    STAFFLUENT_FEATURES.PREMIUM_SUPPORT,
    STAFFLUENT_FEATURES.UNLIMITED_INTEGRATIONS,
    STAFFLUENT_FEATURES.API_ACCESS,
];

/**
 * Define features available for each subscription tier
 */
export const TIER_FEATURES = {
    'basic': BASIC_TIER_FEATURES,
    'professional': [...BASIC_TIER_FEATURES, ...PROFESSIONAL_TIER_ADDITIONAL_FEATURES],
    'enterprise': [...BASIC_TIER_FEATURES, ...PROFESSIONAL_TIER_ADDITIONAL_FEATURES, ...ENTERPRISE_TIER_ADDITIONAL_FEATURES],
    // Trial gets all features
    'trialing': [...Object.values(STAFFLUENT_FEATURES)],
};

/**
 * Define feature limits for each subscription tier
 */
export const TIER_LIMITS = {
    'basic': {
        integrations: 1,
        storage_gb: 5,
        projects: 10,
        teams: 3,
        departments: 1,
        users: 10
    },
    'professional': {
        integrations: 5,
        storage_gb: 20,
        projects: 50,
        teams: 10,
        departments: 5,
        users: 50
    },
    'enterprise': {
        integrations: -1, // unlimited
        storage_gb: 100,
        projects: -1, // unlimited
        teams: -1, // unlimited
        departments: -1, // unlimited
        users: -1 // unlimited
    },
    'trialing': {
        integrations: 999,
        storage_gb: 10,
        projects: 10,
        teams: 5,
        departments: 3,
        users: 20
    },
};