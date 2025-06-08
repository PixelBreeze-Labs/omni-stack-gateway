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