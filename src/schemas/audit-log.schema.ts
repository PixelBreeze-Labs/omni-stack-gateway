// src/schemas/audit-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  
  // User Management
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_ROLE_CHANGED = 'user_role_changed',
  USER_PERMISSION_CHANGED = 'user_permission_changed',
  
  // Client Management
  CLIENT_CREATED = 'client_created',
  CLIENT_UPDATED = 'client_updated',
  CLIENT_DELETED = 'client_deleted',
  CLIENT_DATA_VIEWED = 'client_data_viewed',
  CLIENT_DATA_EXPORTED = 'client_data_exported',
  
  // Project Management
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  PROJECT_STATUS_CHANGED = 'project_status_changed',
  
  // Financial Operations
  INVOICE_CREATED = 'invoice_created',
  INVOICE_UPDATED = 'invoice_updated',
  INVOICE_DELETED = 'invoice_deleted',
  PAYMENT_PROCESSED = 'payment_processed',
  REFUND_ISSUED = 'refund_issued',
  
  // Business Configuration
  BUSINESS_CONFIG_UPDATED = 'business_config_updated',
  BUSINESS_SETTINGS_CHANGED = 'business_settings_changed',
  API_KEY_GENERATED = 'api_key_generated',
  API_KEY_REVOKED = 'api_key_revoked',
  
  // Quality & Compliance
  QUALITY_INSPECTION_CREATED = 'quality_inspection_created',
  QUALITY_INSPECTION_SUBMITTED = 'quality_inspection_submitted',
  QUALITY_INSPECTION_APPROVED = 'quality_inspection_approved',
  QUALITY_INSPECTION_REJECTED = 'quality_inspection_rejected',
  
  // Feedback
  FEEDBACK_SUBMITTED = 'feedback_submitted',
  FEEDBACK_RESPONDED = 'feedback_responded',
  FEEDBACK_RESOLVED = 'feedback_resolved',
  
  // Data Operations
  DATA_EXPORT = 'data_export',
  DATA_IMPORT = 'data_import',
  BULK_DELETE = 'bulk_delete',
  BULK_UPDATE = 'bulk_update',
  
  // Document Management
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_DOWNLOADED = 'document_downloaded',
  DOCUMENT_DELETED = 'document_deleted',
  
  // System Administration
  SYSTEM_BACKUP_CREATED = 'system_backup_created',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  INTEGRATION_CONFIGURED = 'integration_configured',
  
  // Security Events
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SECURITY_VIOLATION = 'security_violation',

  // Storage Operations
  FILE_UPLOADED = 'file_uploaded',
  FILE_DOWNLOADED = 'file_downloaded', 
  FILE_DELETED = 'file_deleted',
  BULK_FILE_DELETE = 'bulk_file_delete',
  STORAGE_LIMIT_UPDATED = 'storage_limit_updated',
  STORAGE_OVERRIDE_ENABLED = 'storage_override_enabled',
  STORAGE_OVERRIDE_DISABLED = 'storage_override_disabled',
  STORAGE_LIMIT_EXCEEDED = 'storage_limit_exceeded',
  STORAGE_INITIALIZED = 'storage_initialized',

  // Messaging Operations  
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_READ = 'message_read',
  CONVERSATION_ACCESSED = 'conversation_accessed',
  MESSAGE_DELETED = 'message_deleted',

  FILE_ACCESSED = 'file_accessed',
  STORAGE_CHECK_FAILED = 'storage_check_failed',
  UPLOAD_VALIDATION_FAILED = 'upload_validation_failed',
  STORAGE_SERVICE_ERROR = 'storage_service_error',

  
  TEAM_ASSIGNED = 'team_assigned',
  TICKET_CREATED = 'ticket_created',
  TICKET_UPDATED = 'ticket_updated', 
  TICKET_ACCESSED = 'ticket_accessed',
  TICKET_DELETED = 'ticket_deleted',
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated', 
  TASK_DELETED = 'task_deleted',
  TASK_STATUS_CHANGED = 'task_status_changed',
  TASK_STATISTICS_ACCESSED = 'task_statistics_accessed',
  TASK_ACCESSED = 'task_accessed',

  TEAM_LOCATION_UPDATED = 'team_location_updated',
  TEAM_LOCATION_ACCESSED = 'team_location_accessed', 
  TEAM_AVAILABILITY_ACCESSED = 'team_availability_accessed',
  ROUTE_PROGRESS_TRACKED = 'route_progress_tracked',
  LOCATION_DATA_EXPORTED = 'location_data_exported',

    // Service Area Operations
    SERVICE_AREA_CREATED = 'service_area_created',
    SERVICE_AREA_UPDATED = 'service_area_updated',
    SERVICE_AREA_DELETED = 'service_area_deleted',
    SERVICE_AREA_ASSIGNED = 'service_area_assigned',
    SERVICE_AREA_ACCESSED = 'service_area_accessed',
    COVERAGE_ANALYSIS_ACCESSED = 'coverage_analysis_accessed',
    COVERAGE_STATISTICS_ACCESSED = 'coverage_statistics_accessed',

    ROUTE_CONSTRAINTS_VALIDATED = 'route_constraints_validated',
    ROUTE_OPTIMIZED = 'route_optimized',
    ROUTE_PROGRESS_UPDATED = 'route_progress_updated',
    ROUTE_ACCESSED = 'route_accessed',
    ROUTE_STATS_ACCESSED = 'route_stats_accessed',
    ROUTE_ASSIGNED = 'route_assigned',
    ROUTE_REOPTIMIZED = 'route_reoptimized',
    ROUTE_METRICS_CALCULATED = 'route_metrics_calculated',

    // Department Operations
    DEPARTMENT_CREATED = 'department_created',
    DEPARTMENT_UPDATED = 'department_updated',
    DEPARTMENT_DELETED = 'department_deleted',

    // Team Operations
    TEAM_CREATED = 'team_created',
    TEAM_UPDATED = 'team_updated',
    TEAM_DELETED = 'team_deleted',

    // Project Operations
    
    PROJECT_USER_ASSIGNED = 'project_user_assigned',
    PROJECT_USER_UNASSIGNED = 'project_user_unassigned', 
    PROJECT_USER_ROLE_UPDATED = 'project_user_role_updated',
    PROJECT_TEAM_ASSIGNED = 'project_team_assigned',
    PROJECT_TEAM_UNASSIGNED = 'project_team_unassigned',
    PROJECT_ASSIGNMENTS_VIEWED = 'project_assignments_viewed',
    PROJECT_STATS_VIEWED = 'project_stats_viewed',
    PROJECT_ASSIGNMENT_UPDATED = 'project_assignment_updated',

    PROJECT_COMMENT_CREATED = 'project_comment_created',
    PROJECT_COMMENT_UPDATED = 'project_comment_updated',
    PROJECT_COMMENT_DELETED = 'project_comment_deleted',
    PROJECT_COMMENT_STATS_VIEWED = 'project_comment_stats_viewed',
    PROJECT_COMMENTS_VIEWED = 'project_comments_viewed',
    PROJECT_COMMENT_WITH_IMAGE_CREATED = 'project_comment_with_image_created',

    PROJECT_GALLERY_MEDIA_UPLOADED = 'project_gallery_media_uploaded',
    PROJECT_GALLERY_VIEWED = 'project_gallery_viewed',
    PROJECT_GALLERY_ITEM_UPDATED = 'project_gallery_item_updated',
    PROJECT_GALLERY_ITEM_DELETED = 'project_gallery_item_deleted',
    PROJECT_ISSUE_DELETED = 'project_issue_deleted',
    PROJECT_ISSUE_UPDATED = 'project_issue_updated',
    PROJECT_ISSUE_REPORTED = 'project_issue_reported',
    PROJECT_ISSUE_WITH_PHOTOS_REPORTED = 'project_issue_with_photos_reported',
    PROJECT_ISSUES_VIEWED = 'project_issues_viewed',
}

export enum AuditSeverity {
  LOW = 'low',           // Regular operations
  MEDIUM = 'medium',     // Important changes
  HIGH = 'high',         // Security events, bulk operations
  CRITICAL = 'critical'  // System admin, security violations
}

export enum ResourceType {
  USER = 'user',
  EMPLOYEE = 'employee',
  CLIENT = 'client',
  PROJECT = 'project',
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  BUSINESS = 'business',
  QUALITY_INSPECTION = 'quality_inspection',
  FEEDBACK = 'feedback',
  DOCUMENT = 'document',
  SYSTEM = 'system',
  API_KEY = 'api_key',
  ROLE = 'role',
  PERMISSION = 'permission',
  FILE = 'file',
  STORAGE = 'storage', 
  MESSAGE = 'message',
  CONVERSATION = 'conversation',
  SERVICE_AREA = 'service_area',
  TICKET = 'ticket',
  TASK = 'task',
}

@Schema({ timestamps: true })
export class AuditLog extends Document {
  // Basic identification
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId?: string;          // Can be null for system actions or failed logins

  @Prop()
  userName?: string;        // Store name at time of action (for deleted users)

  @Prop()
  userEmail?: string;       // Store email at time of action

  // Action details
  @Prop({ required: true, type: String, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: true, type: String, enum: ResourceType })
  resourceType: ResourceType;

  @Prop()
  resourceId?: string;      // ID of the affected resource

  @Prop()
  resourceName?: string;    // Name/title of the affected resource

  // Change tracking
  @Prop({ type: MongooseSchema.Types.Mixed })
  oldValues?: any;          // Previous state (for updates)

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValues?: any;          // New state (for creates/updates)

  @Prop({ type: [String] })
  changedFields?: string[]; // List of fields that changed

  // Request context
  @Prop({ required: true })
  ipAddress: string;

  @Prop()
  userAgent?: string;

  @Prop()
  requestId?: string;       // Correlation ID for request tracking

  @Prop()
  sessionId?: string;       // User session ID

  // Result
  @Prop({ required: true, default: true })
  success: boolean;

  @Prop()
  errorCode?: string;

  @Prop()
  errorMessage?: string;

  // Classification
  @Prop({ type: String, enum: AuditSeverity, default: AuditSeverity.LOW })
  severity: AuditSeverity;

  @Prop({ type: [String], default: [] })
  tags: string[];           // Additional categorization

  // Additional context
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    // API related
    endpoint?: string;
    method?: string;
    responseTime?: number;
    
    // Client related
    clientId?: string;
    projectId?: string;
    
    // Financial
    amount?: number;
    currency?: string;
    
    // File operations
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    
    // Bulk operations
    affectedCount?: number;
    
    // Geographic
    country?: string;
    city?: string;
    
    // Device
    deviceType?: string;
    browser?: string;
    os?: string;
    
    // Custom fields
    [key: string]: any;
  };

  // External IDs for sync
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  externalIds: {
    venueBoostId?: string;
    [key: string]: string;
  };

  // Retention and compliance
  @Prop({ default: false })
  isArchived: boolean;

  @Prop()
  archivedAt?: Date;

  @Prop({ default: false })
  isPersonalData: boolean;  // For GDPR compliance

  @Prop()
  retentionDate?: Date;     // When this log should be deleted

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Indexes for performance
AuditLogSchema.index({ businessId: 1 });
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resourceType: 1 });
AuditLogSchema.index({ resourceId: 1 });
AuditLogSchema.index({ severity: 1 });
AuditLogSchema.index({ success: 1 });
AuditLogSchema.index({ createdAt: 1 });
AuditLogSchema.index({ ipAddress: 1 });
AuditLogSchema.index({ isDeleted: 1 });
AuditLogSchema.index({ isArchived: 1 });

// Compound indexes for common queries
AuditLogSchema.index({ businessId: 1, action: 1 });
AuditLogSchema.index({ businessId: 1, userId: 1 });
AuditLogSchema.index({ businessId: 1, resourceType: 1 });
AuditLogSchema.index({ businessId: 1, severity: 1 });
AuditLogSchema.index({ businessId: 1, createdAt: 1 });
AuditLogSchema.index({ businessId: 1, success: 1 });

// TTL index for automatic cleanup (optional)
// AuditLogSchema.index({ retentionDate: 1 }, { expireAfterSeconds: 0 });

// Virtual for business reference
AuditLogSchema.virtual('business', {
  ref: 'Business',
  localField: 'businessId',
  foreignField: '_id',
  justOne: true
});

// Virtual for user reference
AuditLogSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});