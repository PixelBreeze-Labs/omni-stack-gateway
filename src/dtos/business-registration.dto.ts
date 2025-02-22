// src/dtos/business-registration.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BusinessRegistrationDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    businessEmail: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    businessName: string;
}