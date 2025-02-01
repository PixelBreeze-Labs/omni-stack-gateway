// dtos/benefit.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class BenefitResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    description: string;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    type: string;

    @ApiProperty()
    value: number;

    @ApiProperty()
    isActive: boolean;
}

export class BenefitUsageResponse {
    @ApiProperty()
    name: string;

    @ApiProperty()
    usageCount: number;

    @ApiProperty()
    savings: number;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    type: string;

    @ApiProperty()
    benefitId: string;
}