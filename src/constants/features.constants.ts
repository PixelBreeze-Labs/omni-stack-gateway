// src/constants/features.constants.ts
/**
 * Define all features available in the Staffluent platform
 * Organized by feature category for better management
 */
export const STAFFLUENT_FEATURES = {
    // =========== DASHBOARD FEATURES ===========
    // Basic Dashboards
    STAFF_DASHBOARD: 'staff_dashboard',
    TEAM_LEADER_DASHBOARD: 'team_leader_dashboard',
    // Advanced Dashboards
    OPERATIONS_DASHBOARD: 'operations_dashboard',
    MANAGER_DASHBOARD_ENHANCEMENTS: 'manager_dashboard_enhancements',
    ANALYTICS_DASHBOARD: 'analytics_dashboard',
    LEAVE_DASHBOARD: 'leave_dashboard',
    OVERTIME_DASHBOARD: 'overtime_dashboard',

    // =========== TIME & ATTENDANCE ===========
    // Basic Time Tracking
    BASIC_TIME_TRACKING: 'basic_time_tracking',
    BREAK_MANAGEMENT: 'break_management',
    TIMESHEET_MANAGEMENT: 'timesheet_management',
    // Advanced Time Tracking
    ADVANCED_TIME_TRACKING: 'advanced_time_tracking',
    GPS_TIME_TRACKING: 'gps_time_tracking',
    MULTI_SITE_TIME_TRACKING: 'multi_site_time_tracking',
    EQUIPMENT_TIME_TRACKING: 'equipment_time_tracking',
    OVERTIME_MANAGEMENT: 'overtime_management',
    ATTENDANCE_COMPLIANCE: 'attendance_compliance',

    // =========== LEAVE MANAGEMENT ===========
    BASIC_LEAVE_MANAGEMENT: 'basic_leave_management',
    ADVANCED_LEAVE_MANAGEMENT: 'advanced_leave_management',

    // =========== PROJECT MANAGEMENT ===========
    // Basic Project Management
    BASIC_PROJECT_MANAGEMENT: 'basic_project_management',
    BASIC_TASK_MANAGEMENT: 'basic_task_management',
    // Advanced Project Management
    ADVANCED_PROJECT_MANAGEMENT: 'advanced_project_management',
    ADVANCED_TASK_MANAGEMENT: 'advanced_task_management',
    PROJECT_BUDGETING: 'project_budgeting',
    PROJECT_TIMELINE_VISUALIZATION: 'project_timeline_visualization',
    PROJECT_MILESTONE_TRACKING: 'project_milestone_tracking',
    CONSTRUCTION_MILESTONE_TRACKING: 'construction_milestone_tracking',
    SITE_WORKFLOW_MANAGEMENT: 'site_workflow_management',
    MATERIAL_TRACKING: 'material_tracking',
    WEATHER_MONITORING: 'weather_monitoring',
    MULTI_SITE_SCHEDULING: 'multi_site_scheduling',

    // =========== SCHEDULING ===========
    BASIC_SCHEDULING: 'basic_scheduling',
    ADVANCED_SCHEDULING: 'advanced_scheduling',
    SHIFT_PLANNING: 'shift_planning',
    AVAILABILITY_TRACKING: 'availability_tracking',
    CALENDAR_INTEGRATION: 'calendar_integration',

    // =========== TEAM MANAGEMENT ===========
    BASIC_TEAM_MANAGEMENT: 'basic_team_management',
    ADVANCED_TEAM_MANAGEMENT: 'advanced_team_management',
    DEPARTMENT_MANAGEMENT: 'department_management',
    ROLE_MANAGEMENT: 'role_management',
    TEAM_COLLABORATION: 'team_collaboration',
    PERFORMANCE_TRACKING: 'performance_tracking',
    MULTI_LOCATION_SUPPORT: 'multi_location_support',

    // =========== CLIENT MANAGEMENT ===========
    CLIENT_LIST: 'client_list',
    CLIENT_PROJECTS: 'client_projects',
    CLIENT_FEEDBACK: 'client_feedback',
    CLIENT_SIGN_OFFS: 'client_sign_offs',
    CLIENT_PORTAL: 'client_portal',
    CLIENT_COMMUNICATION: 'client_communication',
    SERVICE_REQUEST_PROCESSING: 'service_request_processing',

    // =========== QUALITY CONTROL ===========
    BASIC_QUALITY_CONTROL: 'basic_quality_control',
    ADVANCED_QUALITY_CONTROL: 'advanced_quality_control',
    INSPECTION_CHECKLISTS: 'inspection_checklists',
    COMPLIANCE_MONITORING: 'compliance_monitoring',
    SAFETY_MANAGEMENT: 'safety_management',
    SAFETY_AUDIT: 'safety_audit',
    CODE_COMPLIANCE: 'code_compliance',
    QUALITY_METRICS_DASHBOARD: 'quality_metrics_dashboard',
    RESOLUTION_WORKFLOW: 'resolution_workflow',

    // =========== EQUIPMENT MANAGEMENT ===========
    BASIC_EQUIPMENT_MANAGEMENT: 'basic_equipment_management',
    ADVANCED_EQUIPMENT_MANAGEMENT: 'advanced_equipment_management',
    EQUIPMENT_TRACKING: 'equipment_tracking',
    MAINTENANCE_SCHEDULING: 'maintenance_scheduling',
    USAGE_MONITORING: 'usage_monitoring',
    EQUIPMENT_ASSIGNMENT: 'equipment_assignment',

    // =========== FIELD OPERATIONS ===========
    BASIC_FIELD_OPERATIONS: 'basic_field_operations',
    ADVANCED_FIELD_OPERATIONS: 'advanced_field_operations',
    FIELD_WORKER_FEATURES: 'field_worker_features',
    ROUTE_OPTIMIZATION: 'route_optimization',
    SERVICE_AREA_MAPPING: 'service_area_mapping',
    TRAVEL_TIME_ESTIMATION: 'travel_time_estimation',
    GPS_COORDINATE_LOGGING: 'gps_coordinate_logging',
    OFFLINE_CAPABILITIES: 'offline_capabilities',

    // =========== SAFETY MANAGEMENT ===========
    BARRIER_MANAGEMENT: 'barrier_management',
    OSHA_COMPLIANCE: 'osha_compliance',
    ADA_COMPLIANCE: 'ada_compliance',
    SITE_SAFETY_MAPPING: 'site_safety_mapping',
    SAFETY_INCIDENT_REPORTING: 'safety_incident_reporting',
    DAILY_INSPECTION_LOGS: 'daily_inspection_logs',

    // =========== SITE MANAGEMENT ===========
    BASIC_SITE_MANAGEMENT: 'basic_site_management',
    ADVANCED_SITE_MANAGEMENT: 'advanced_site_management',
    MULTI_SITE_TRACKING: 'multi_site_tracking',
    SITE_SPECIFIC_REPORTING: 'site_specific_reporting',

    // =========== COMMUNICATION ===========
    BASIC_COMMUNICATION: 'basic_communication',
    ADVANCED_COMMUNICATION: 'advanced_communication',
    TEAM_CHAT: 'team_chat',
    PROJECT_CHANNELS: 'project_channels',
    FILE_SHARING: 'file_sharing',
    CLIENT_COMMUNICATION_CHANNELS: 'client_communication_channels',
    NOTIFICATIONS_SYSTEM: 'notifications_system',

    // =========== REPORTS & ANALYTICS ===========
    BASIC_REPORTS: 'basic_reports',
    ADVANCED_REPORTS: 'advanced_reports',
    CUSTOM_ANALYTICS: 'custom_analytics',
    PERFORMANCE_METRICS: 'performance_metrics',
    RESOURCE_UTILIZATION: 'resource_utilization',
    TIME_TRACKING_REPORTS: 'time_tracking_reports',
    PROJECT_PROGRESS_ANALYTICS: 'project_progress_analytics',
    EFFICIENCY_METRICS: 'efficiency_metrics',
    COMPLIANCE_REPORTING: 'compliance_reporting',
    EXPORT_CAPABILITIES: 'export_capabilities',

    // =========== MOBILE ACCESS ===========
    BASIC_MOBILE_ACCESS: 'basic_mobile_access',
    ADVANCED_MOBILE_ACCESS: 'advanced_mobile_access',
    PHOTO_DOCUMENT_UPLOAD: 'photo_document_upload',
    MOBILE_TICKET_MANAGEMENT: 'mobile_ticket_management',
    DIGITAL_SIGNATURE_CAPTURE: 'digital_signature_capture',
    MOBILE_TASK_UPDATES: 'mobile_task_updates',

    // =========== RESOURCE MANAGEMENT ===========
    BASIC_RESOURCE_MANAGEMENT: 'basic_resource_management',
    ADVANCED_RESOURCE_MANAGEMENT: 'advanced_resource_management',
    DOCUMENT_STORAGE: 'document_storage',
    VERSION_CONTROL: 'version_control',
    ACCESS_MANAGEMENT: 'access_management',
    SECURITY_CONTROLS: 'security_controls',

    // =========== SUPPLY MANAGEMENT ===========
    BASIC_SUPPLY_MANAGEMENT: 'basic_supply_management',
    ADVANCED_SUPPLY_MANAGEMENT: 'advanced_supply_management',

    // =========== WORK ORDER MANAGEMENT ===========
    BASIC_WORK_ORDER_MANAGEMENT: 'basic_work_order_management',
    ADVANCED_WORK_ORDER_MANAGEMENT: 'advanced_work_order_management',
    ORDER_STATUS_TRACKING: 'order_status_tracking',
    PRIORITY_MANAGEMENT: 'priority_management',
    ASSIGNMENT_TRACKING: 'assignment_tracking',

    // =========== INVOICE MANAGEMENT ===========
    BASIC_INVOICE_MANAGEMENT: 'basic_invoice_management',
    ADVANCED_INVOICE_MANAGEMENT: 'advanced_invoice_management',
    PAYMENT_TRACKING: 'payment_tracking',

    // =========== SUPPORT ===========
    STANDARD_SUPPORT: 'standard_support',
    PRIORITY_SUPPORT: 'priority_support',
    PREMIUM_SUPPORT: 'premium_support',
    SUPPORT_TICKET_SYSTEM: 'support_ticket_system',

    // =========== INTEGRATIONS ===========
    BASIC_INTEGRATIONS: 'basic_integrations',
    MULTIPLE_INTEGRATIONS: 'multiple_integrations',
    UNLIMITED_INTEGRATIONS: 'unlimited_integrations',
    API_ACCESS: 'api_access',

    // =========== AUDIT & SETTINGS ===========
    BASIC_AUDIT_LOGS: 'basic_audit_logs',
    ADVANCED_AUDIT_LOGS: 'advanced_audit_logs',
    USER_ACTION_LOGGING: 'user_action_logging',
    SYSTEM_EVENT_TRACKING: 'system_event_tracking',
    ACCESS_MONITORING: 'access_monitoring',
    SECURITY_LOGGING: 'security_logging',

    // =========== DOCUMENTATION ===========
    PHOTO_VERIFICATION: 'photo_verification',
    PROGRESS_PHOTO_UPLOADS: 'progress_photo_uploads',
    INSPECTION_DOCUMENTATION: 'inspection_documentation',
    EQUIPMENT_STATUS_REPORTING: 'equipment_status_reporting',


    // =========== AGENT FEATURES ===========
    AGENT_AUTO_ASSIGNMENT: 'agent_auto_assignment',
    AGENT_COMPLIANCE_MONITORING: 'agent_compliance_monitoring',
    AGENT_REPORT_GENERATION: 'agent_report_generation',
    AGENT_CLIENT_COMMUNICATION: 'agent_client_communication',
    AGENT_RESOURCE_REQUEST: 'agent_resource_request',
    AGENT_SHIFT_OPTIMIZATION: 'agent_shift_optimization',
};

// Define basic tier features
const BASIC_TIER_FEATURES = [
    // Dashboards
    STAFFLUENT_FEATURES.STAFF_DASHBOARD,
    STAFFLUENT_FEATURES.TEAM_LEADER_DASHBOARD,

    // Time & Attendance
    STAFFLUENT_FEATURES.BASIC_TIME_TRACKING,
    STAFFLUENT_FEATURES.BREAK_MANAGEMENT,
    STAFFLUENT_FEATURES.TIMESHEET_MANAGEMENT,

    // Leave Management
    STAFFLUENT_FEATURES.BASIC_LEAVE_MANAGEMENT,

    // Project Management
    STAFFLUENT_FEATURES.BASIC_PROJECT_MANAGEMENT,
    STAFFLUENT_FEATURES.BASIC_TASK_MANAGEMENT,

    // Scheduling
    STAFFLUENT_FEATURES.BASIC_SCHEDULING,
    STAFFLUENT_FEATURES.SHIFT_PLANNING,

    // Team Management
    STAFFLUENT_FEATURES.BASIC_TEAM_MANAGEMENT,
    STAFFLUENT_FEATURES.TEAM_COLLABORATION,

    // Client Management
    STAFFLUENT_FEATURES.CLIENT_LIST,

    // Quality Control
    STAFFLUENT_FEATURES.BASIC_QUALITY_CONTROL,
    STAFFLUENT_FEATURES.INSPECTION_CHECKLISTS,

    // Equipment Management
    STAFFLUENT_FEATURES.BASIC_EQUIPMENT_MANAGEMENT,

    // Field Operations
    STAFFLUENT_FEATURES.BASIC_FIELD_OPERATIONS,

    // Communication
    STAFFLUENT_FEATURES.BASIC_COMMUNICATION,
    STAFFLUENT_FEATURES.TEAM_CHAT,
    STAFFLUENT_FEATURES.NOTIFICATIONS_SYSTEM,

    // Reports & Analytics
    STAFFLUENT_FEATURES.BASIC_REPORTS,
    STAFFLUENT_FEATURES.TIME_TRACKING_REPORTS,

    // Mobile Access
    STAFFLUENT_FEATURES.BASIC_MOBILE_ACCESS,

    // Resource Management
    STAFFLUENT_FEATURES.BASIC_RESOURCE_MANAGEMENT,
    STAFFLUENT_FEATURES.DOCUMENT_STORAGE,

    // Supply Management
    STAFFLUENT_FEATURES.BASIC_SUPPLY_MANAGEMENT,

    // Work Order Management
    STAFFLUENT_FEATURES.BASIC_WORK_ORDER_MANAGEMENT,
    STAFFLUENT_FEATURES.ORDER_STATUS_TRACKING,

    // Invoice Management
    STAFFLUENT_FEATURES.BASIC_INVOICE_MANAGEMENT,

    // Support
    STAFFLUENT_FEATURES.STANDARD_SUPPORT,

    // Integrations
    STAFFLUENT_FEATURES.BASIC_INTEGRATIONS,

    // Audit & Settings
    STAFFLUENT_FEATURES.BASIC_AUDIT_LOGS,

    // Documentation
    STAFFLUENT_FEATURES.PROGRESS_PHOTO_UPLOADS,

    // Agent Features
    STAFFLUENT_FEATURES.AGENT_AUTO_ASSIGNMENT,
];

// Define professional tier additional features
const PROFESSIONAL_TIER_ADDITIONAL_FEATURES = [
    // Advanced Dashboards
    STAFFLUENT_FEATURES.OPERATIONS_DASHBOARD,
    STAFFLUENT_FEATURES.ANALYTICS_DASHBOARD,
    STAFFLUENT_FEATURES.LEAVE_DASHBOARD,
    STAFFLUENT_FEATURES.OVERTIME_DASHBOARD,

    // Enhanced Time Tracking
    STAFFLUENT_FEATURES.ADVANCED_TIME_TRACKING,
    STAFFLUENT_FEATURES.GPS_TIME_TRACKING,
    STAFFLUENT_FEATURES.MULTI_SITE_TIME_TRACKING,
    STAFFLUENT_FEATURES.EQUIPMENT_TIME_TRACKING,
    STAFFLUENT_FEATURES.OVERTIME_MANAGEMENT,
    STAFFLUENT_FEATURES.ATTENDANCE_COMPLIANCE,

    // Enhanced Leave Management
    STAFFLUENT_FEATURES.ADVANCED_LEAVE_MANAGEMENT,

    // Enhanced Project Management
    STAFFLUENT_FEATURES.ADVANCED_PROJECT_MANAGEMENT,
    STAFFLUENT_FEATURES.ADVANCED_TASK_MANAGEMENT,
    STAFFLUENT_FEATURES.PROJECT_BUDGETING,
    STAFFLUENT_FEATURES.PROJECT_TIMELINE_VISUALIZATION,
    STAFFLUENT_FEATURES.PROJECT_MILESTONE_TRACKING,
    STAFFLUENT_FEATURES.CONSTRUCTION_MILESTONE_TRACKING,
    STAFFLUENT_FEATURES.SITE_WORKFLOW_MANAGEMENT,
    STAFFLUENT_FEATURES.MATERIAL_TRACKING,
    STAFFLUENT_FEATURES.WEATHER_MONITORING,
    STAFFLUENT_FEATURES.MULTI_SITE_SCHEDULING,

    // Enhanced Scheduling
    STAFFLUENT_FEATURES.ADVANCED_SCHEDULING,
    STAFFLUENT_FEATURES.AVAILABILITY_TRACKING,
    STAFFLUENT_FEATURES.CALENDAR_INTEGRATION,

    // Enhanced Team Management
    STAFFLUENT_FEATURES.ADVANCED_TEAM_MANAGEMENT,
    STAFFLUENT_FEATURES.DEPARTMENT_MANAGEMENT,
    STAFFLUENT_FEATURES.ROLE_MANAGEMENT,
    STAFFLUENT_FEATURES.PERFORMANCE_TRACKING,
    STAFFLUENT_FEATURES.MULTI_LOCATION_SUPPORT,

    // Enhanced Client Management
    STAFFLUENT_FEATURES.CLIENT_PROJECTS,
    STAFFLUENT_FEATURES.CLIENT_FEEDBACK,
    STAFFLUENT_FEATURES.CLIENT_SIGN_OFFS,
    STAFFLUENT_FEATURES.CLIENT_PORTAL,
    STAFFLUENT_FEATURES.CLIENT_COMMUNICATION,
    STAFFLUENT_FEATURES.SERVICE_REQUEST_PROCESSING,

    // Enhanced Quality Control
    STAFFLUENT_FEATURES.ADVANCED_QUALITY_CONTROL,
    STAFFLUENT_FEATURES.COMPLIANCE_MONITORING,
    STAFFLUENT_FEATURES.SAFETY_MANAGEMENT,
    STAFFLUENT_FEATURES.SAFETY_AUDIT,
    STAFFLUENT_FEATURES.CODE_COMPLIANCE,
    STAFFLUENT_FEATURES.QUALITY_METRICS_DASHBOARD,
    STAFFLUENT_FEATURES.RESOLUTION_WORKFLOW,

    // Enhanced Equipment Management
    STAFFLUENT_FEATURES.ADVANCED_EQUIPMENT_MANAGEMENT,
    STAFFLUENT_FEATURES.EQUIPMENT_TRACKING,
    STAFFLUENT_FEATURES.MAINTENANCE_SCHEDULING,
    STAFFLUENT_FEATURES.USAGE_MONITORING,
    STAFFLUENT_FEATURES.EQUIPMENT_ASSIGNMENT,

    // Enhanced Field Operations
    STAFFLUENT_FEATURES.ADVANCED_FIELD_OPERATIONS,
    STAFFLUENT_FEATURES.FIELD_WORKER_FEATURES,
    STAFFLUENT_FEATURES.ROUTE_OPTIMIZATION,
    STAFFLUENT_FEATURES.SERVICE_AREA_MAPPING,
    STAFFLUENT_FEATURES.TRAVEL_TIME_ESTIMATION,
    STAFFLUENT_FEATURES.GPS_COORDINATE_LOGGING,
    STAFFLUENT_FEATURES.OFFLINE_CAPABILITIES,

    // Safety Management
    STAFFLUENT_FEATURES.BARRIER_MANAGEMENT,
    STAFFLUENT_FEATURES.OSHA_COMPLIANCE,
    STAFFLUENT_FEATURES.ADA_COMPLIANCE,
    STAFFLUENT_FEATURES.SITE_SAFETY_MAPPING,
    STAFFLUENT_FEATURES.SAFETY_INCIDENT_REPORTING,
    STAFFLUENT_FEATURES.DAILY_INSPECTION_LOGS,

    // Enhanced Site Management
    STAFFLUENT_FEATURES.ADVANCED_SITE_MANAGEMENT,
    STAFFLUENT_FEATURES.MULTI_SITE_TRACKING,
    STAFFLUENT_FEATURES.SITE_SPECIFIC_REPORTING,

    // Enhanced Communication
    STAFFLUENT_FEATURES.ADVANCED_COMMUNICATION,
    STAFFLUENT_FEATURES.PROJECT_CHANNELS,
    STAFFLUENT_FEATURES.FILE_SHARING,
    STAFFLUENT_FEATURES.CLIENT_COMMUNICATION_CHANNELS,

    // Enhanced Reports & Analytics
    STAFFLUENT_FEATURES.ADVANCED_REPORTS,
    STAFFLUENT_FEATURES.CUSTOM_ANALYTICS,
    STAFFLUENT_FEATURES.PERFORMANCE_METRICS,
    STAFFLUENT_FEATURES.RESOURCE_UTILIZATION,
    STAFFLUENT_FEATURES.PROJECT_PROGRESS_ANALYTICS,
    STAFFLUENT_FEATURES.EFFICIENCY_METRICS,
    STAFFLUENT_FEATURES.COMPLIANCE_REPORTING,
    STAFFLUENT_FEATURES.EXPORT_CAPABILITIES,

    // Enhanced Mobile Access
    STAFFLUENT_FEATURES.ADVANCED_MOBILE_ACCESS,
    STAFFLUENT_FEATURES.PHOTO_DOCUMENT_UPLOAD,
    STAFFLUENT_FEATURES.MOBILE_TICKET_MANAGEMENT,
    STAFFLUENT_FEATURES.DIGITAL_SIGNATURE_CAPTURE,
    STAFFLUENT_FEATURES.MOBILE_TASK_UPDATES,

    // Enhanced Resource Management
    STAFFLUENT_FEATURES.ADVANCED_RESOURCE_MANAGEMENT,
    STAFFLUENT_FEATURES.VERSION_CONTROL,
    STAFFLUENT_FEATURES.ACCESS_MANAGEMENT,
    STAFFLUENT_FEATURES.SECURITY_CONTROLS,

    // Enhanced Supply Management
    STAFFLUENT_FEATURES.ADVANCED_SUPPLY_MANAGEMENT,

    // Enhanced Work Order Management
    STAFFLUENT_FEATURES.ADVANCED_WORK_ORDER_MANAGEMENT,
    STAFFLUENT_FEATURES.PRIORITY_MANAGEMENT,
    STAFFLUENT_FEATURES.ASSIGNMENT_TRACKING,

    // Enhanced Invoice Management
    STAFFLUENT_FEATURES.ADVANCED_INVOICE_MANAGEMENT,
    STAFFLUENT_FEATURES.PAYMENT_TRACKING,

    // Enhanced Support
    STAFFLUENT_FEATURES.PRIORITY_SUPPORT,
    STAFFLUENT_FEATURES.SUPPORT_TICKET_SYSTEM,

    // Enhanced Integrations
    STAFFLUENT_FEATURES.MULTIPLE_INTEGRATIONS,

    // Enhanced Audit & Settings
    STAFFLUENT_FEATURES.ADVANCED_AUDIT_LOGS,
    STAFFLUENT_FEATURES.USER_ACTION_LOGGING,
    STAFFLUENT_FEATURES.SYSTEM_EVENT_TRACKING,
    STAFFLUENT_FEATURES.ACCESS_MONITORING,
    STAFFLUENT_FEATURES.SECURITY_LOGGING,

    // Enhanced Documentation
    STAFFLUENT_FEATURES.PHOTO_VERIFICATION,
    STAFFLUENT_FEATURES.INSPECTION_DOCUMENTATION,
    STAFFLUENT_FEATURES.EQUIPMENT_STATUS_REPORTING,

    // Agent Features
    STAFFLUENT_FEATURES.AGENT_COMPLIANCE_MONITORING,
    STAFFLUENT_FEATURES.AGENT_CLIENT_COMMUNICATION,

];

// Define enterprise tier additional features
const ENTERPRISE_TIER_ADDITIONAL_FEATURES = [
    // Manager Dashboard Enhancements
    STAFFLUENT_FEATURES.MANAGER_DASHBOARD_ENHANCEMENTS,

    // Premium Support
    STAFFLUENT_FEATURES.PREMIUM_SUPPORT,

    // Enhanced Integrations
    STAFFLUENT_FEATURES.UNLIMITED_INTEGRATIONS,
    STAFFLUENT_FEATURES.API_ACCESS,

    // Agent Features
    STAFFLUENT_FEATURES.AGENT_REPORT_GENERATION,
    STAFFLUENT_FEATURES.AGENT_RESOURCE_REQUEST,
    STAFFLUENT_FEATURES.AGENT_SHIFT_OPTIMIZATION,
];

/**
 * Define features available for each subscription tier
 */
export const TIER_FEATURES = {
    'basic': BASIC_TIER_FEATURES,
    'professional': [...BASIC_TIER_FEATURES, ...PROFESSIONAL_TIER_ADDITIONAL_FEATURES],
    'enterprise': [...BASIC_TIER_FEATURES, ...PROFESSIONAL_TIER_ADDITIONAL_FEATURES, ...ENTERPRISE_TIER_ADDITIONAL_FEATURES],
    // Trial gets all features
    'trialing': [...BASIC_TIER_FEATURES, ...PROFESSIONAL_TIER_ADDITIONAL_FEATURES, ...ENTERPRISE_TIER_ADDITIONAL_FEATURES],
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
        users: 10,
        clients: 20,
        documents: 100,
        reports: 5
    },
    'professional': {
        integrations: 5,
        storage_gb: 20,
        projects: 50,
        teams: 10,
        departments: 5,
        users: 50,
        clients: 100,
        documents: 1000,
        reports: 25
    },
    'enterprise': {
        integrations: -1, // unlimited
        storage_gb: 100,
        projects: -1, // unlimited
        teams: -1, // unlimited
        departments: -1, // unlimited
        users: -1, // unlimited
        clients: -1, // unlimited
        documents: -1, // unlimited
        reports: -1 // unlimited
    },
    'trialing': {
        integrations: 999,
        storage_gb: 10,
        projects: 10,
        teams: 5,
        departments: 3,
        users: 20,
        clients: 50,
        documents: 500,
        reports: 15
    },
};