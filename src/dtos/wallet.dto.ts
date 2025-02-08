// src/dtos/wallet.dto.ts
import { IsString, IsNumber, IsOptional, IsEnum, IsDate, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TransactionDto {
    @ApiProperty()
    @IsNumber()
    amount: number;

    @ApiProperty()
    @IsString()
    description: string;

    @ApiProperty({ enum: ['points_redemption', 'refund', 'manual_adjustment', 'reward'] })
    @IsEnum(['points_redemption', 'refund', 'manual_adjustment', 'reward'])
    source: 'points_redemption' | 'refund' | 'manual_adjustment' | 'reward';

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    metadata?: Record<string, any>;
}

export class TransactionFilterDto {
    @ApiProperty({ required: false })
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    startDate?: Date;

    @ApiProperty({ required: false })
    @IsDate()
    @IsOptional()
    @Type(() => Date)
    endDate?: Date;

    @ApiProperty({ required: false, enum: ['points_redemption', 'refund', 'manual_adjustment', 'reward'] })
    @IsEnum(['points_redemption', 'refund', 'manual_adjustment', 'reward'])
    @IsOptional()
    source?: 'points_redemption' | 'refund' | 'manual_adjustment' | 'reward';

    @ApiProperty({ required: false, enum: ['credit', 'debit'] })
    @IsEnum(['credit', 'debit'])
    @IsOptional()
    type?: 'credit' | 'debit';
}