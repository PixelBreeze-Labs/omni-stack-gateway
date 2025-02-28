// src/dtos/staffluent-login.dto.ts
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StaffluentsBusinessAdminLoginDto {
  @ApiProperty({
    description: 'Email address of the business admin',
    example: 'admin@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password for authentication',
    example: 'securePassword123'
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}