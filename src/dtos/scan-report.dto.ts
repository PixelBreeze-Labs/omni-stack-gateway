import {IsDateString, IsEnum, IsMongoId, IsOptional} from "class-validator";

export class ScanReportQueryDto {
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsMongoId()
    @IsOptional()
    warehouseId?: string;

    @IsEnum(['create', 'update'])
    @IsOptional()
    action?: string;
}