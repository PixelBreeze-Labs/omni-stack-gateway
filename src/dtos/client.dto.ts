// src/dtos/client.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Currency } from '../enums/currency.enum';
import { ClientStatus } from '../enums/clients.enum';

export class CreateClientDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsOptional()
    externalId?: string;

    @IsEnum(Currency)
    @IsOptional()
    defaultCurrency?: Currency = Currency.USD;

    @IsString()
    @IsOptional()
    apiKey?: string;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ListClientDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    skip?: number;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(ClientStatus)
    status?: ClientStatus;
}
