// src/dtos/submission.dto.ts
import { IsString, IsOptional, IsObject, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubmissionType } from '../schemas/submission.schema';

export class CreateSubmissionDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    email?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    content?: string;

    @ApiProperty({ enum: SubmissionType, required: true })
    @IsEnum(SubmissionType)
    @IsNotEmpty()
    type: SubmissionType;

    @ApiProperty()
    @IsObject()
    metadata: {
        timestamp: Date;
        ipHash: string;
        userAgent: string;
    };
}

export class UpdateSubmissionDto {
    @ApiProperty({ required: false, enum: ['pending', 'reviewed', 'archived'] })
    @IsEnum(['pending', 'reviewed', 'archived'])
    @IsOptional()
    status?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    notes?: string;
}

export class ListSubmissionDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({ required: false, default: 10 })
    @IsOptional()
    limit?: number;

    @ApiProperty({ required: false, default: 1 })
    @IsOptional()
    page?: number;

    @ApiProperty({ required: false, enum: ['pending', 'reviewed', 'archived'] })
    @IsOptional()
    @IsEnum(['pending', 'reviewed', 'archived'])
    status?: string;

    @ApiProperty({ required: false, enum: SubmissionType })
    @IsOptional()
    @IsEnum(SubmissionType)
    type?: SubmissionType;

    @ApiProperty({ required: false, description: 'Form configuration ID' })
    @IsOptional()
    @IsString()
    formConfigId?: string;
}