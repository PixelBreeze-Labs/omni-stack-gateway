// src/dtos/project-weather.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsDate, IsEnum, IsOptional } from 'class-validator';

export enum WeatherDelayType {
  RAIN = 'rain',
  SNOW = 'snow',
  STORM = 'storm',
  WIND = 'wind',
  HEAT = 'heat',
  COLD = 'cold',
  FOG = 'fog',
  OTHER = 'other'
}

export class AddWeatherDelayDto {
  @ApiProperty({ description: 'Delay hours caused by weather', type: Number })
  @IsNotEmpty()
  @IsNumber()
  delayHours: number;

  @ApiProperty({ description: 'Reason for the delay', type: String })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Date of the delay', type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  @ApiProperty({ 
    description: 'Weather type that caused the delay',
    enum: WeatherDelayType,
    example: WeatherDelayType.RAIN
  })
  @IsNotEmpty()
  @IsEnum(WeatherDelayType)
  weatherType: WeatherDelayType;

  @ApiProperty({ description: 'Optional notes about the delay', type: String, required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ProjectWeatherDetailsDto {
  projectId: string;
  projectName: string;
  activeAlertsCount: number;
  totalDelayHours: number;
  recentDelays: Array<{
    date: Date;
    hours: number;
    reason: string;
    weatherType: string;
  }>;
  weatherAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    startTime: Date;
    endTime: Date;
    weatherType: string;
    resolved: boolean;
  }>;
}