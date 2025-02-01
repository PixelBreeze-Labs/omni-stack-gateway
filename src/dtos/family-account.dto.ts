// dtos/family-account.dto.ts
import { IsString, IsArray, IsEnum, IsOptional, ValidateNested, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MemberDto {
    @ApiProperty()
    @IsMongoId()
    customerId: string;

    @ApiProperty()
    @IsString()
    relationship: string;
}

export class LinkFamilyAccountDto {
    @ApiProperty()
    @IsMongoId()
    mainCustomerId: string;

    @ApiProperty({ type: [MemberDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MemberDto)
    members: MemberDto[];

    @ApiProperty({ required: false })
    @IsArray()
    @IsOptional()
    sharedBenefits?: string[];
}

export class UpdateFamilyAccountDto {
    @ApiProperty({ required: false })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MemberDto)
    @IsOptional()
    members?: MemberDto[];

    @ApiProperty({ required: false })
    @IsArray()
    @IsOptional()
    sharedBenefits?: string[];

    @ApiProperty({ required: false })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    @IsOptional()
    status?: string;
}

export class ListFamilyAccountDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE', 'ALL'] })
    @IsOptional()
    @IsEnum(['ACTIVE', 'INACTIVE', 'ALL'])
    status?: string;

    @ApiProperty({ required: false, default: 1 })
    @IsOptional()
    page?: number;

    @ApiProperty({ required: false, default: 10 })
    @IsOptional()
    limit?: number;
}