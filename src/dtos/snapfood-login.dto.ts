// src/dtos/snapfood-login.dto.ts
import { IsEmail, IsNotEmpty, IsString, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SnapfoodLoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email',
    required: false
  })
  @IsEmail()
  @ValidateIf(o => !o.snapFoodId)
  @IsNotEmpty({ message: 'Either email or snapFoodId must be provided' })
  email?: string;

  @ApiProperty({
    example: 'SF12345',
    description: 'SnapFood user ID',
    required: false
  })
  @IsString()
  @ValidateIf(o => !o.email)
  @IsNotEmpty({ message: 'Either email or snapFoodId must be provided' })
  snapFoodId?: string;
}