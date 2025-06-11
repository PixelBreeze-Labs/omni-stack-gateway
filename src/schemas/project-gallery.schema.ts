// src/schemas/project-gallery.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video'
}

export enum GalleryCategory {
  PROGRESS = 'progress',
  COMPLETION = 'completion',
  MATERIALS = 'materials',
  TEAM = 'team',
  BEFORE_AFTER = 'before_after',
  OTHER = 'other'
}

@Schema({ timestamps: true })
export class ProjectGallery extends Document {
  // Core relationships
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Business' })
  businessId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'AppProject' })
  appProjectId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  uploadedBy: string;

  // Media details
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ required: true })
  mimeType: string;

  @Prop({
    type: String,
    enum: MediaType,
    required: true
  })
  mediaType: MediaType;

  @Prop({
    type: String,
    enum: GalleryCategory,
    default: GalleryCategory.OTHER
  })
  category: GalleryCategory;

  // Optional description
  @Prop()
  description?: string;

  // Video specific properties
  @Prop()
  duration?: number; // in seconds for videos

  @Prop()
  thumbnailUrl?: string; // for videos

  // Image/Video dimensions
  @Prop()
  width?: number;

  @Prop()
  height?: number;

  // Metadata for extensibility
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: {
    uploaderName?: string;        // Cached for performance
    uploaderEmail?: string;       // Cached for performance
    projectName?: string;         // Cached for performance
    location?: string;            // Where photo was taken
    tags?: string[];             // Custom tags
    [key: string]: any;
  };

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  deletedBy?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export const ProjectGallerySchema = SchemaFactory.createForClass(ProjectGallery);

// Indexes for performance
ProjectGallerySchema.index({ businessId: 1 });
ProjectGallerySchema.index({ appProjectId: 1 });
ProjectGallerySchema.index({ uploadedBy: 1 });
ProjectGallerySchema.index({ appProjectId: 1, createdAt: -1 });
ProjectGallerySchema.index({ appProjectId: 1, category: 1 });
ProjectGallerySchema.index({ appProjectId: 1, mediaType: 1 });
ProjectGallerySchema.index({ businessId: 1, mediaType: 1 });
ProjectGallerySchema.index({ isDeleted: 1 });
ProjectGallerySchema.index({ createdAt: -1 });

// Virtual for file extension
ProjectGallerySchema.virtual('fileExtension').get(function() {
  return this.fileName.split('.').pop()?.toLowerCase();
});

// Virtual for human readable file size
ProjectGallerySchema.virtual('fileSizeFormatted').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});