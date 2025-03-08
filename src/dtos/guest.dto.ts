// src/dtos/guest.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { RegistrationSource } from '../schemas/user.schema';

export class ListGuestDto {
    @ApiPropertyOptional({
        description: 'Page number',
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional({
        description: 'Number of items per page',
        minimum: 1,
        maximum: 100,
        default: 10,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 10;

    @ApiPropertyOptional({
        description: 'Search term',
    })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Filter by status',
        enum: ['ACTIVE', 'INACTIVE', 'ALL'],
        default: 'ALL',
    })
    @IsOptional()
    @IsEnum(['ACTIVE', 'INACTIVE', 'ALL'])
    status?: 'ACTIVE' | 'INACTIVE' | 'ALL' = 'ALL';

    @ApiPropertyOptional({
        description: 'Filter by source',
        enum: [
            'metrosuites', 
            'metroshop', 
            'bookmaster', 
            'trackmaster', 
            'manual', 
            'other', 
            'ALL'
        ],
        default: 'ALL',
    })
    @IsOptional()
    @IsEnum([
        'metrosuites', 
        'metroshop', 
        'bookmaster', 
        'trackmaster', 
        'manual', 
        'other', 
        'ALL'
    ])
    source?: string = 'ALL';
}

export class GetOrCreateGuestDto {
    @ApiProperty({ description: 'The guest name' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'The guest surname' })
    @IsOptional()
    @IsString()
    surname?: string;

    @ApiProperty({ description: 'The guest email' })
    @IsString()
    email: string;

    @ApiPropertyOptional({ description: 'The guest phone' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ description: 'The guest password' })
    @IsString()
    password: string;

    @ApiPropertyOptional({
        description: 'Registration source',
        enum: Object.values(RegistrationSource),
        default: RegistrationSource.METROSUITES
    })
    @IsOptional()
    @IsEnum(RegistrationSource)
    registrationSource?: RegistrationSource = RegistrationSource.METROSUITES;

    @ApiPropertyOptional({
        description: 'External IDs',
        type: 'object',
        example: { venueBoostUserId: "123", venueBoostGuestId: "456" }
    })
    @IsOptional()
    external_ids?: {
        venueBoostUserId?: string;
        venueBoostGuestId?: string;
        [key: string]: any;
    };
}