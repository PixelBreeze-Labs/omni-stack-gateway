// src/dtos/user.dto.ts
import { IsString, IsEmail, IsOptional, IsObject, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}

export class SalesAssociateLoginDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsString()
    password: string;
}