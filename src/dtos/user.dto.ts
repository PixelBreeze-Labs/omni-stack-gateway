// src/dtos/user.dto.ts
import { IsString, IsEmail, IsOptional, IsObject, IsNumber, IsArray, IsEnum, IsNotEmpty, IsDate, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {RegistrationSource} from "../schemas/user.schema";
import { Type } from 'class-transformer';
import { CreateAddressDto } from './address.dto';

export class CreateUserDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    surname: string;

    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsString()
    password: string;

    @ApiProperty({ required: false, description: "External IDs as key-value pairs" })
    @IsOptional()
    @IsObject()
    external_ids?: Record<string, any>;

    @ApiProperty({ required: false, description: "Client IDs" })
    @IsOptional()
    @IsArray()
    client_ids?: string[];

    @ApiProperty({ enum: RegistrationSource })
    @IsEnum(RegistrationSource)
    @IsNotEmpty()
    registrationSource: RegistrationSource;

    @ApiProperty({ required: false })
    @IsDate()
    @IsOptional()
    birthday?: Date;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    referralCode?: string;


    @ApiProperty()
    @IsString()
    @IsOptional()
    external_id?: string;

    @ApiProperty({ type: CreateAddressDto })
    @ValidateNested()
    @Type(() => CreateAddressDto)
    @IsOptional()
    address?: CreateAddressDto;

    @ApiProperty()
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    points?: number;

   @ApiProperty({
       required: false,
       description: "Additional metadata as key-value pairs",
       type: Object
   })
   @IsOptional()
   @IsObject()
   metadata?: Record<string, any>;
}

export class SalesAssociateLoginDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsString()
    password: string;
}

export class GetOrCreateUserDto {
    external_id: string | number;  // Accept both since it could come as either
    registrationSource: RegistrationSource;
    name: string;
    surname: string;
    email: string;
    phone: string;
    password: string;
}

export class ChangePasswordDto {
    @ApiPropertyOptional({ description: 'Current password (required for users who have changed their password before)' })
    currentPassword?: string;

    @ApiProperty({ description: 'New password' })
    newPassword: string;
}