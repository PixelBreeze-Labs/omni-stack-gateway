// src/schemas/staff-certification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum CertificationStatus {
  ACTIVE = 'active',
  EXPIRING_SOON = 'expiring_soon',
  EXPIRED = 'expired',
  PENDING = 'pending'
}

@Schema({ timestamps: true })
export class StaffCertification extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  issuedBy: string;

  @Prop({ required: true, type: Date })
  issueDate: Date;

  @Prop({ required: true, type: Date })
  expiryDate: Date;

  @Prop({ type: String, enum: CertificationStatus, default: CertificationStatus.ACTIVE })
  status: CertificationStatus;

  @Prop()
  certificateUrl: string;

  @Prop()
  verificationCode: string;

  @Prop({ type: Boolean, default: false })
  hasBeenVerified: boolean;

  @Prop({ type: Boolean, default: false })
  requiresRenewal: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  renewalRequirements: Record<string, any>;

  @Prop({ type: Number })
  reminderDays: number;

  @Prop({ type: [Date] })
  remindersSent: Date[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const StaffCertificationSchema = SchemaFactory.createForClass(StaffCertification);

// Add indexes
StaffCertificationSchema.index({ userId: 1 });
StaffCertificationSchema.index({ businessId: 1 });
StaffCertificationSchema.index({ expiryDate: 1 });
StaffCertificationSchema.index({ status: 1 });