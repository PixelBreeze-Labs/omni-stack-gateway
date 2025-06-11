// src/dtos/project-gallery.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength, IsNumber, Min } from 'class-validator';
import { MediaType, GalleryCategory } from '../schemas/project-gallery.schema';

export class UploadGalleryItemDto {
  @ApiPropertyOptional({
    description: 'Description of the media item',
    example: 'Construction progress on the foundation',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiProperty({
    description: 'Category of the media item',
    enum: GalleryCategory,
    example: GalleryCategory.PROGRESS
  })
  @IsEnum(GalleryCategory, { message: 'Invalid gallery category' })
  category: GalleryCategory;

  @ApiPropertyOptional({
    description: 'Location where media was captured',
    example: 'Building Site A, Floor 2',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  location?: string;

  @ApiPropertyOptional({
    description: 'Tags for the media item',
    example: ['foundation', 'concrete', 'day1'],
    type: [String]
  })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { weather: 'sunny', temperature: '25C' }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateGalleryItemDto {
  @ApiPropertyOptional({
    description: 'Updated description of the media item',
    example: 'Updated: Construction progress on the foundation',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated category of the media item',
    enum: GalleryCategory,
    example: GalleryCategory.COMPLETION
  })
  @IsOptional()
  @IsEnum(GalleryCategory, { message: 'Invalid gallery category' })
  category?: GalleryCategory;

  @ApiPropertyOptional({
    description: 'Updated location where media was captured',
    example: 'Building Site A, Floor 2 - Updated',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  location?: string;

  @ApiPropertyOptional({
    description: 'Updated tags for the media item',
    example: ['foundation', 'concrete', 'completed'],
    type: [String]
  })
  @IsOptional()
  tags?: string[];
}

export class ProjectGalleryItemResponseDto {
  @ApiProperty({
    description: 'Gallery item ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Uploader information'
  })
  uploader: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'File name',
    example: 'construction_progress_001.jpg'
  })
  fileName: string;

  @ApiProperty({
    description: 'File URL',
    example: 'https://supabase.example.com/storage/v1/object/public/files/...'
  })
  fileUrl: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 2048576
  })
  fileSize: number;

  @ApiProperty({
    description: 'File size formatted',
    example: '2.00 MB'
  })
  fileSizeFormatted: string;

  @ApiProperty({
    description: 'MIME type',
    example: 'image/jpeg'
  })
  mimeType: string;

  @ApiProperty({
    description: 'Media type',
    enum: MediaType,
    example: MediaType.IMAGE
  })
  mediaType: MediaType;

  @ApiProperty({
    description: 'Gallery category',
    enum: GalleryCategory,
    example: GalleryCategory.PROGRESS
  })
  category: GalleryCategory;

  @ApiPropertyOptional({
    description: 'Media description',
    example: 'Foundation work in progress'
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Video duration in seconds (for videos only)',
    example: 120
  })
  duration?: number;

  @ApiPropertyOptional({
    description: 'Video thumbnail URL (for videos only)',
    example: 'https://supabase.example.com/storage/v1/object/public/thumbnails/...'
  })
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Media width in pixels',
    example: 1920
  })
  width?: number;

  @ApiPropertyOptional({
    description: 'Media height in pixels',
    example: 1080
  })
  height?: number;

  @ApiProperty({
    description: 'Upload timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'File extension',
    example: 'jpg'
  })
  fileExtension?: string;

  @ApiPropertyOptional({
    description: 'Gallery item metadata',
    example: { location: 'Site A', tags: ['foundation', 'concrete'] }
  })
  metadata?: Record<string, any>;
}

export class ProjectGalleryListResponseDto {
  @ApiProperty({
    description: 'List of gallery items',
    type: [ProjectGalleryItemResponseDto]
  })
  items: ProjectGalleryItemResponseDto[];

  @ApiProperty({
    description: 'Pagination information'
  })
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };

  @ApiProperty({
    description: 'Gallery summary'
  })
  summary: {
    totalItems: number;
    totalImages: number;
    totalVideos: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    categoryCounts: Record<string, number>;
    lastUploadAt?: Date;
  };
}

export class GalleryActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Media uploaded successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Gallery item data',
    type: ProjectGalleryItemResponseDto
  })
  item?: ProjectGalleryItemResponseDto;

  @ApiPropertyOptional({
    description: 'Storage usage information'
  })
  storageUsage?: {
    totalSizeMB: number;
    limitMB: number;
    remainingMB: number;
    usagePercentage: number;
  };
}