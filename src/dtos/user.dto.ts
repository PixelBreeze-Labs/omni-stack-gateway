// src/dtos/user.dto.ts
import { IsString, IsEmail, IsOptional, IsObject, IsArray, IsEnum, IsNotEmpty, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {RegistrationSource} from "../schemas/user.schema";

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
}

export class SalesAssociateLoginDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsString()
    password: string;
}