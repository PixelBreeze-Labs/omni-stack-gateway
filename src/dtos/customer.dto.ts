import { IsNotEmpty, IsString, IsEmail, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    status: string;

    @ApiProperty({ enum: ['REGULAR', 'VIP'] })
    @IsEnum(['REGULAR', 'VIP'])
    type: string;

    @ApiProperty({ type: [String] })
    @IsArray()
    @IsNotEmpty()
    clientIds: string[];
}

export class UpdateCustomerDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
    @IsEnum(['ACTIVE', 'INACTIVE'])
    @IsOptional()
    status?: string;

    @ApiProperty({ required: false, enum: ['REGULAR', 'VIP'] })
    @IsEnum(['REGULAR', 'VIP'])
    @IsOptional()
    type?: string;

    @ApiProperty({ type: [String], required: false })
    @IsArray()
    @IsOptional()
    clientIds?: string[];
}
