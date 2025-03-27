// src/dtos/snapfood-login.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SnapfoodLoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}