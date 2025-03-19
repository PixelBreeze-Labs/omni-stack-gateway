// src/dtos/checkin-form.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsObject,
  IsArray,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsMongoId,
  ValidateNested,
  IsDate,
  IsTimeString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormField } from '../schemas/checkin-form-config.schema';
import { SubmissionStatus } from '../schemas/checkin-submission.schema';

// DTO for form field configuration
export class FormFieldDto implements Partial<FormField> {
  @ApiProperty({ description: 'Field name (identifier)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Field type', enum: ['text', 'email', 'tel', 'select', 'radio', 'checkbox'] })
  @IsEnum(['text', 'email', 'tel', 'select', 'radio', 'checkbox'])
  type: 'text' | 'email' | 'tel' | 'select' | 'radio' | 'checkbox';

  @ApiProperty({ description: 'Field labels in different languages' })
  @IsObject()
  label: { [key: string]: string };

  @ApiPropertyOptional({ description: 'Field placeholders in different languages' })
  @IsOptional()
  @IsObject()
  placeholder?: { [key: string]: string };

  @ApiProperty({ description: 'Whether the field is required' })
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional({ description: 'Options for select, radio, or checkbox fields' })
  @IsOptional()
  @IsArray()
  options?: Array<{
    value: string;
    label: { [key: string]: string };
  }>;

  @ApiPropertyOptional({ description: 'Default value for the field' })
  @IsOptional()
  defaultValue?: any;

  @ApiPropertyOptional({ description: 'Validation rules as string' })
  @IsOptional()
  @IsString()
  validation?: string;
}

// DTO for form section configuration
export class FormSectionDto {
  @ApiProperty({ description: 'Section name (identifier)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Section titles in different languages' })
  @IsObject()
  title: { [key: string]: string };

  @ApiProperty({ description: 'Field names that belong to this section' })
  @IsArray()
  @IsString({ each: true })
  fields: string[];
}

// DTOs for Form Configuration

export class CreateCheckinFormConfigDto {
  @ApiProperty({ description: 'Form name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Property ID associated with this form' })
  @IsOptional()
  @IsMongoId()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Booking ID associated with this form' })
  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @ApiProperty({ description: 'Form configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => FormConfigDto)
  formConfig: {
    fields: FormFieldDto[];
    sections: FormSectionDto[];
    languages: string[];
    defaultLanguage: string;
    submitButtonText: { [key: string]: string };
  };

  @ApiPropertyOptional({ description: 'Whether the form is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Whether this is a pre-arrival form' })
  @IsOptional()
  @IsBoolean()
  isPreArrival?: boolean = false;

  @ApiPropertyOptional({ description: 'Whether this form requires authentication' })
  @IsOptional()
  @IsBoolean()
  requiresAuthentication?: boolean = false;

  @ApiPropertyOptional({ description: 'Form expiration date' })
  @IsOptional()
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class FormConfigDto {
  @ApiProperty({ description: 'Form fields' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields: FormFieldDto[];

  @ApiProperty({ description: 'Form sections' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSectionDto)
  sections: FormSectionDto[];

  @ApiProperty({ description: 'Available languages' })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiProperty({ description: 'Default language' })
  @IsString()
  defaultLanguage: string;

  @ApiProperty({ description: 'Submit button text in different languages' })
  @IsObject()
  submitButtonText: { [key: string]: string };
}

export class UpdateCheckinFormConfigDto {
  @ApiPropertyOptional({ description: 'Form name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Property ID associated with this form' })
  @IsOptional()
  @IsMongoId()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Booking ID associated with this form' })
  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Form configuration' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FormConfigDto)
  formConfig?: {
    fields: FormFieldDto[];
    sections: FormSectionDto[];
    languages: string[];
    defaultLanguage: string;
    submitButtonText: { [key: string]: string };
  };

  @ApiPropertyOptional({ description: 'Whether the form is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether this is a pre-arrival form' })
  @IsOptional()
  @IsBoolean()
  isPreArrival?: boolean;

  @ApiPropertyOptional({ description: 'Whether this form requires authentication' })
  @IsOptional()
  @IsBoolean()
  requiresAuthentication?: boolean;

  @ApiPropertyOptional({ description: 'Form expiration date' })
  @IsOptional()
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

// DTOs for Form Submission

export class SubmitCheckinFormDto {
  @ApiProperty({ description: 'Form data' })
  @IsObject()
  formData: Record<string, any>;

  @ApiProperty({ description: 'First name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Guest ID if known' })
  @IsOptional()
  @IsMongoId()
  guestId?: string;

  @ApiPropertyOptional({ description: 'Booking ID if associated with a booking' })
  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Whether the guest needs a parking spot' })
  @IsOptional()
  @IsBoolean()
  needsParkingSpot?: boolean;

  @ApiPropertyOptional({ description: 'Expected arrival time' })
  @IsOptional()
  @IsTimeString()
  expectedArrivalTime?: string;

  @ApiPropertyOptional({ description: 'Special requests' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialRequests?: string[];

  @ApiPropertyOptional({ description: 'Attachment URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateSubmissionStatusDto {
  @ApiProperty({ description: 'Submission status', enum: Object.values(SubmissionStatus) })
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Verification data' })
  @IsOptional()
  @IsObject()
  verificationData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Verified by user ID' })
  @IsOptional()
  @IsString()
  verifiedBy?: string;
}

export class ListCheckinFormConfigDto {
  @ApiPropertyOptional({ description: 'Filter by property ID' })
  @IsOptional()
  @IsMongoId()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by booking ID' })
  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by pre-arrival status' })
  @IsOptional()
  @IsBoolean()
  isPreArrival?: boolean;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  limit?: number = 10;
}

export class ListCheckinSubmissionsDto {
  @ApiPropertyOptional({ description: 'Filter by form config ID' })
  @IsOptional()
  @IsMongoId()
  formConfigId?: string;

  @ApiPropertyOptional({ description: 'Filter by property ID' })
  @IsOptional()
  @IsMongoId()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by guest ID' })
  @IsOptional()
  @IsMongoId()
  guestId?: string;

  @ApiPropertyOptional({ description: 'Filter by booking ID' })
  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Filter by email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Filter by parking need' })
  @IsOptional()
  @IsBoolean()
  needsParkingSpot?: boolean;

  @ApiPropertyOptional({ description: 'Filter by status', enum: Object.values(SubmissionStatus) })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  limit?: number = 10;
}