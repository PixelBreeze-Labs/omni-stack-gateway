import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Currency } from '../enums/currency.enum';
import { ClientStatus } from '../enums/clients.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
    @ApiProperty({ description: 'Client name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Unique client code' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({ required: true, type: [String] })
    @IsArray()
    @IsNotEmpty()
    clientAppIds: string[];

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    externalId?: string;

    @ApiProperty({ enum: Currency, default: Currency.USD })
    @IsEnum(Currency)
    @IsOptional()
    defaultCurrency?: Currency = Currency.USD;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    apiKey?: string;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ListClientDto {
    @ApiProperty({ required: false, description: 'Number of items per page', default: 10 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ required: false, description: 'Number of items to skip', default: 0 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    skip?: number;

    @ApiProperty({ required: false, description: 'Page number (alternative to skip)', default: 1 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    page?: number;

    @ApiProperty({ required: false, description: 'Search term for name or code' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({ enum: ClientStatus, required: false, description: 'Filter by client status' })
    @IsOptional()
    @IsEnum(ClientStatus)
    status?: ClientStatus;

    @ApiProperty({ required: false, description: 'Filter by creation date (format: YYYY-MM-DD)' })
    @IsOptional()
    @IsString()
    fromDate?: string;

    @ApiProperty({ required: false, description: 'Filter by creation date (format: YYYY-MM-DD)' })
    @IsOptional()
    @IsString()
    toDate?: string;
}