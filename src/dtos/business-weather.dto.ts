// src/dto/business-weather.dto.ts
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, Max, ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { WeatherType } from '../schemas/weather-alert.schema';

export class WeatherAlertThresholdDto {
  @ApiProperty({ description: 'Type of weather to monitor', enum: WeatherType })
  @IsEnum(WeatherType)
  type: WeatherType;

  @ApiProperty({ description: 'Minimum threshold value to trigger alert' })
  @IsNumber()
  @Min(0)
  threshold: number;
  
  @ApiProperty({ description: 'Enable alerts for this type' })
  @IsBoolean()
  enabled: boolean;
}

export class BusinessWeatherSettingsDto {
  @ApiProperty({ description: 'Enable weather alerts for this business' })
  @IsBoolean()
  enableWeatherAlerts: boolean;
  
  @ApiProperty({ description: 'Notification recipients (user IDs)' })
  @IsArray()
  @IsString({ each: true })
  notificationRecipients: string[];
  
  @ApiProperty({ description: 'Send notifications via app' })
  @IsBoolean()
  appNotificationsEnabled: boolean;
  
  @ApiProperty({ description: 'Send notifications via email' })
  @IsBoolean()
  emailNotificationsEnabled: boolean;
  
  @ApiProperty({ description: 'Send notifications via SMS' })
  @IsBoolean()
  smsNotificationsEnabled: boolean;

  @ApiProperty({ description: 'Email notification recipients (direct email addresses)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailNotificationRecipients?: string[];

  @ApiProperty({ description: 'SMS notification recipients (direct phone numbers)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  smsNotificationRecipients?: string[];
  
  @ApiProperty({ description: 'Check interval in hours' })
  @IsNumber()
  @Min(1)
  @Max(24)
  checkIntervalHours: number;
  
  @ApiProperty({ description: 'Alert thresholds for different weather types', type: [WeatherAlertThresholdDto] })
  @ValidateNested({ each: true })
  @Type(() => WeatherAlertThresholdDto)
  @ArrayMinSize(1)
  alertThresholds: WeatherAlertThresholdDto[];
}

export class WeatherAlertConfigDto {
  @ApiProperty({ description: 'Enable project-specific settings (overrides business settings)' })
  @IsBoolean()
  useCustomSettings: boolean;
  
  @ApiProperty({ description: 'Enable weather alerts for this project' })
  @IsBoolean()
  enableWeatherAlerts: boolean;
  
  @ApiProperty({ description: 'Project-specific notification recipients (user IDs)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notificationRecipients?: string[];
  
  @ApiProperty({ description: 'Project-specific alert thresholds', required: false, type: [WeatherAlertThresholdDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WeatherAlertThresholdDto)
  alertThresholds?: WeatherAlertThresholdDto[];

  @ApiProperty({ description: 'Project-specific email notification recipients', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailNotificationRecipients?: string[];

  @ApiProperty({ description: 'Project-specific SMS notification recipients', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  smsNotificationRecipients?: string[];
}

export class ForecastResponseDto {
  @ApiProperty({ description: 'Project ID' })
  projectId: string;
  
  @ApiProperty({ description: 'Project name' })
  projectName: string;
  
  @ApiProperty({ description: 'Current weather data' })
  current: any;
  
  @ApiProperty({ description: 'Hourly forecast data' })
  hourly: any[];
  
  @ApiProperty({ description: 'Daily forecast data' })
  daily: any[];
  
  @ApiProperty({ description: 'Weather alerts' })
  alerts: any[];
  
  @ApiProperty({ description: 'Location information' })
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };

  @ApiProperty({ description: 'Location source', enum: ['project', 'construction_site'] })
  locationSource: string;
}

export class ProjectAlertResponseDto {
  @ApiProperty({ description: 'Alert ID' })
  id: string;
  
  @ApiProperty({ description: 'Alert title' })
  title: string;
  
  @ApiProperty({ description: 'Alert description' })
  description: string;
  
  @ApiProperty({ description: 'Weather type', enum: WeatherType })
  weatherType: WeatherType;
  
  @ApiProperty({ description: 'Alert severity' })
  severity: string;
  
  @ApiProperty({ description: 'Start time' })
  startTime: Date;
  
  @ApiProperty({ description: 'End time' })
  endTime: Date;
  
  @ApiProperty({ description: 'Affected projects' })
  affectedProjects: {
    id: string;
    name: string;
  }[];

  @ApiProperty({ description: 'Alert resolved' })
  resolved: boolean;
  
  @ApiProperty({ description: 'Location information' })
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
}