import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsMongoId, IsOptional } from 'class-validator';

export class CreateAddressDto {
    @ApiProperty({ description: 'Address line 1' })
    @IsString()
    @IsNotEmpty()
    addressLine1: string;

    @ApiProperty({ description: 'Address line 2', required: false })
    @IsString()
    @IsOptional()
    addressLine2?: string;

    @ApiProperty({ description: 'Postal code' })
    @IsString()
    @IsNotEmpty()
    postcode: string;

    @ApiProperty({ description: 'City' })
    @IsOptional()
    city: string;

    @ApiProperty({ description: 'State' })
    @IsOptional()
    state: string;

    @ApiProperty({ description: 'Country' })
    @IsOptional()
    country: string;
}