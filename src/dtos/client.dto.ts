// src/dtos/client.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';
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
    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    skip?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({ enum: ClientStatus, required: false })
    @IsOptional()
    @IsEnum(ClientStatus)
    status?: ClientStatus;
}