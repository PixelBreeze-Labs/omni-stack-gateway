// src/dtos/report-flag.dto.ts
import { IsString, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FlagReason } from '../schemas/report-flag.schema';

export class CreateReportFlagDto {
    @ApiProperty({ enum: FlagReason })
    @IsEnum(FlagReason)
    reason: FlagReason;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    comment?: string;
}