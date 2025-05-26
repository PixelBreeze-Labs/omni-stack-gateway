// src/dtos/user-notification-preferences.dto.ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ 
    description: 'Enable or disable email notifications',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @ApiProperty({ 
    description: 'Enable or disable SMS notifications',
    example: false,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  smsNotificationsEnabled?: boolean;
}

export class NotificationPreferencesResponse {
  @ApiProperty({ description: 'Email notifications enabled status' })
  emailNotificationsEnabled: boolean;

  @ApiProperty({ description: 'SMS notifications enabled status' })
  smsNotificationsEnabled: boolean;
}