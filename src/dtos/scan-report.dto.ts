import {IsDateString, IsEnum, IsMongoId, IsOptional} from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class ScanReportQueryDto {
    @ApiProperty({ required: false })
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @ApiProperty({ required: false })
    @IsDateString()
    @IsOptional()
    endDate?: string;

    @ApiProperty({ required: false })
    @IsMongoId()
    @IsOptional()
    warehouseId?: string;

    @ApiProperty({ enum: ['create', 'update'], required: false })
    @IsEnum(['create', 'update'])
    @IsOptional()
    action?: string;
}