// src/schemas/compliance-rule.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum RuleType {
  CERTIFICATION_REQUIREMENT = 'certification_requirement',
  QUALIFICATION_REQUIREMENT = 'qualification_requirement',
  LABOR_LAW = 'labor_law',
  SCHEDULE_RESTRICTION = 'schedule_restriction',
  MAXIMUM_HOURS = 'maximum_hours',
  REQUIRED_REST = 'required_rest',
  AGE_RESTRICTION = 'age_restriction',
  LOCATION_RESTRICTION = 'location_restriction',
  CUSTOM = 'custom'
}

export enum RuleSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

@Schema({ timestamps: true })
export class ComplianceRule extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ 
    type: String, 
    enum: RuleType, 
    required: true 
  })
  type: RuleType;

  @Prop({ 
    type: String, 
    enum: RuleSeverity, 
    default: RuleSeverity.MEDIUM 
  })
  severity: RuleSeverity;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  conditions: Record<string, any>;

  @Prop({ type: [String] })
  requiredCertifications: string[];

  @Prop({ type: Number })
  maxConsecutiveHours: number;

  @Prop({ type: Number })
  maxWeeklyHours: number;

  @Prop({ type: Number })
  requiredRestHoursBetweenShifts: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ComplianceRuleSchema = SchemaFactory.createForClass(ComplianceRule);

// Add indexes
ComplianceRuleSchema.index({ businessId: 1 });
ComplianceRuleSchema.index({ type: 1 });
ComplianceRuleSchema.index({ isActive: 1 });