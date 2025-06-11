// src/dtos/supply-request.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsOptional, 
  IsMongoId, 
  MaxLength, 
  MinLength, 
  IsEnum, 
  IsArray, 
  ValidateNested, 
  IsNumber,
  Min,
  IsDateString,
  ArrayMinSize
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SupplyRequestStatus, SupplyRequestPriority } from '../schemas/supply-request.schema';

export class RequestedEquipmentItemDto {
  @ApiProperty({
    description: 'Equipment ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsMongoId({ message: 'Equipment ID must be a valid MongoDB ObjectId' })
  equipmentId: string;

  @ApiProperty({
    description: 'Quantity requested',
    example: 5,
    minimum: 0.01
  })
  @IsNumber({}, { message: 'Quantity must be a number' })
  @Min(0.01, { message: 'Quantity must be greater than 0' })
  quantityRequested: number;

  @ApiPropertyOptional({
    description: 'Estimated unit cost',
    example: 25.50
  })
  @IsOptional()
  @IsNumber({}, { message: 'Estimated unit cost must be a number' })
  @Min(0, { message: 'Estimated unit cost must be non-negative' })
  estimatedUnitCost?: number;

  @ApiPropertyOptional({
    description: 'Notes for this equipment item',
    example: 'Heavy duty hammers preferred',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}

export class CreateSupplyRequestDto {
  @ApiProperty({
    description: 'Supply request description',
    example: 'Tools and materials needed for foundation work',
    minLength: 1,
    maxLength: 1000
  })
  @IsString()
  @MinLength(1, { message: 'Description cannot be empty' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description: string;

  @ApiPropertyOptional({
    description: 'Custom name for the supply request',
    example: 'Foundation Work - Week 1',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'Date when supplies are required by',
    example: '2025-06-15T00:00:00Z'
  })
  @IsDateString({}, { message: 'Required date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  requiredDate: Date;

  @ApiPropertyOptional({
    description: 'Priority level of the request',
    enum: SupplyRequestPriority,
    example: SupplyRequestPriority.MEDIUM
  })
  @IsOptional()
  @IsEnum(SupplyRequestPriority, { message: 'Priority must be a valid priority level' })
  priority?: SupplyRequestPriority;

  @ApiProperty({
    description: 'List of equipment items requested',
    type: [RequestedEquipmentItemDto],
    minItems: 1
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one equipment item must be requested' })
  @ValidateNested({ each: true })
  @Type(() => RequestedEquipmentItemDto)
  requestedItems: RequestedEquipmentItemDto[];

  @ApiPropertyOptional({
    description: 'Additional metadata for the request',
    example: { isUrgent: true }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateSupplyRequestDto {
  @ApiPropertyOptional({
    description: 'Updated description',
    minLength: 1,
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Description cannot be empty' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated name',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated required date',
    example: '2025-06-20T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Required date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  requiredDate?: Date;

  @ApiPropertyOptional({
    description: 'Updated priority',
    enum: SupplyRequestPriority
  })
  @IsOptional()
  @IsEnum(SupplyRequestPriority, { message: 'Priority must be a valid priority level' })
  priority?: SupplyRequestPriority;

  @ApiPropertyOptional({
    description: 'Updated equipment items',
    type: [RequestedEquipmentItemDto]
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one equipment item must be requested' })
  @ValidateNested({ each: true })
  @Type(() => RequestedEquipmentItemDto)
  requestedItems?: RequestedEquipmentItemDto[];
}

export class ApproveSupplyRequestDto {
  @ApiPropertyOptional({
    description: 'Approval notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Approval notes cannot exceed 1000 characters' })
  approvalNotes?: string;

  @ApiPropertyOptional({
    description: 'Approved quantities for each item (by equipment ID)',
    example: { '507f1f77bcf86cd799439011': 3, '507f1f77bcf86cd799439012': 5 }
  })
  @IsOptional()
  approvedQuantities?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Expected delivery date',
    example: '2025-06-25T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expected delivery date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  expectedDeliveryDate?: Date;
}

export class RejectSupplyRequestDto {
  @ApiProperty({
    description: 'Reason for rejection',
    minLength: 1,
    maxLength: 1000
  })
  @IsString()
  @MinLength(1, { message: 'Rejection reason cannot be empty' })
  @MaxLength(1000, { message: 'Rejection reason cannot exceed 1000 characters' })
  rejectionReason: string;
}

export class MarkDeliveredDto {
  @ApiPropertyOptional({
    description: 'Delivery notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Delivery notes cannot exceed 1000 characters' })
  deliveryNotes?: string;

  @ApiPropertyOptional({
    description: 'Delivered quantities for each item (by equipment ID)',
    example: { '507f1f77bcf86cd799439011': 3, '507f1f77bcf86cd799439012': 4 }
  })
  @IsOptional()
  deliveredQuantities?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Actual total cost',
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'Actual cost must be a number' })
  @Min(0, { message: 'Actual cost must be non-negative' })
  actualCost?: number;

  @ApiPropertyOptional({
    description: 'Supplier information'
  })
  @IsOptional()
  @IsString()
  supplierName?: string;
}

export class SupplyRequestResponseDto {
  @ApiProperty({
    description: 'Supply request ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Requester information'
  })
  requester: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Request description',
    example: 'Tools and materials needed for foundation work'
  })
  description: string;

  @ApiPropertyOptional({
    description: 'Request name',
    example: 'Foundation Work - Week 1'
  })
  name?: string;

  @ApiProperty({
    description: 'Date when request was made',
    example: '2025-06-11T10:30:00Z'
  })
  requestedDate: Date;

  @ApiProperty({
    description: 'Date when supplies are required by',
    example: '2025-06-15T00:00:00Z'
  })
  requiredDate: Date;

  @ApiProperty({
    description: 'Request status',
    enum: SupplyRequestStatus,
    example: SupplyRequestStatus.PENDING
  })
  status: SupplyRequestStatus;

  @ApiProperty({
    description: 'Request priority',
    enum: SupplyRequestPriority,
    example: SupplyRequestPriority.MEDIUM
  })
  priority: SupplyRequestPriority;

  @ApiProperty({
    description: 'Requested equipment items'
  })
  requestedItems: Array<{
    equipmentId: string;
    equipmentName: string;
    equipmentCategory: string;
    quantityRequested: number;
    unitOfMeasure: string;
    estimatedUnitCost?: number;
    estimatedTotalCost?: number;
    notes?: string;
    quantityApproved?: number;
    quantityDelivered?: number;
  }>;

  @ApiPropertyOptional({
    description: 'Total estimated cost',
    example: 250.75
  })
  totalEstimatedCost?: number;

  @ApiPropertyOptional({
    description: 'Approver information'
  })
  approver?: {
    id: string;
    name: string;
    email: string;
  };

  @ApiPropertyOptional({
    description: 'Approval date',
    example: '2025-06-12T14:15:00Z'
  })
  approvedAt?: Date;

  @ApiPropertyOptional({
    description: 'Approval notes',
    example: 'Approved with budget constraints'
  })
  approvalNotes?: string;

  @ApiPropertyOptional({
    description: 'Rejection reason if rejected',
    example: 'Budget exceeded for this month'
  })
  rejectionReason?: string;

  @ApiPropertyOptional({
    description: 'Expected delivery date',
    example: '2025-06-25T00:00:00Z'
  })
  expectedDeliveryDate?: Date;

  @ApiPropertyOptional({
    description: 'Actual delivery date',
    example: '2025-06-24T16:30:00Z'
  })
  deliveredAt?: Date;

  @ApiProperty({
    description: 'Request creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Request last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether request is overdue',
    example: false
  })
  isOverdue: boolean;

  @ApiProperty({
    description: 'Completion percentage',
    example: 75
  })
  completionPercentage: number;

  @ApiPropertyOptional({
    description: 'Request metadata'
  })
  metadata?: Record<string, any>;
}

export class SupplyRequestsListResponseDto {
  @ApiProperty({
    description: 'List of supply requests',
    type: [SupplyRequestResponseDto]
  })
  requests: SupplyRequestResponseDto[];

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
    description: 'Summary statistics'
  })
  summary: {
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    deliveredRequests: number;
    overdueRequests: number;
    totalEstimatedCost: number;
    lastRequestAt?: Date;
  };
}

export class SupplyRequestActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Supply request created successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Supply request data',
    type: SupplyRequestResponseDto
  })
  request?: SupplyRequestResponseDto;
}