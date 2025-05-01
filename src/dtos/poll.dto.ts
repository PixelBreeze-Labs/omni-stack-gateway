// src/dtos/poll.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
  IsMongoId,
  IsHexColor,
  IsObject
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PollOptionDto {
  @ApiProperty({ description: 'Text for this poll option' })
  @IsString()
  @IsNotEmpty()
  optionText: string;

  @ApiPropertyOptional({ description: 'Number of votes for this option' })
  @IsNumber()
  @IsOptional()
  votes?: number = 0;

  @ApiPropertyOptional({ description: 'Custom highlight color for this option' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  customHighlight?: string;
}

// All possible style overrides a client can have
export class ClientStyleOverrideDto {
  // Light mode colors
  @ApiPropertyOptional({ description: 'Highlight color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  highlightColor?: string;

  @ApiPropertyOptional({ description: 'Vote button color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonColor?: string;

  @ApiPropertyOptional({ description: 'Vote button hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonHoverColor?: string;

  @ApiPropertyOptional({ description: 'Options background color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsBackgroundColor?: string;

  @ApiPropertyOptional({ description: 'Options hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsHoverColor?: string;

  @ApiPropertyOptional({ description: 'Results link color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkColor?: string;

  @ApiPropertyOptional({ description: 'Results link hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkHoverColor?: string;

  @ApiPropertyOptional({ description: 'Progress bar background color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  progressBarBackgroundColor?: string;

  @ApiPropertyOptional({ description: 'Percentage label color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  percentageLabelColor?: string;

  @ApiPropertyOptional({ description: 'Icon color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconColor?: string;

  @ApiPropertyOptional({ description: 'Icon hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconHoverColor?: string;

  @ApiPropertyOptional({ description: 'Radio border color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioBorderColor?: string;

  @ApiPropertyOptional({ description: 'Radio checked border color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedBorderColor?: string;

  @ApiPropertyOptional({ description: 'Radio checked dot color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedDotColor?: string;

  // Dark mode overrides
  @ApiPropertyOptional({ description: 'Enable dark mode override for this client' })
  @IsBoolean()
  @IsOptional()
  darkMode?: boolean;

  @ApiPropertyOptional({ description: 'Dark mode background color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeBackground?: string;

  @ApiPropertyOptional({ description: 'Dark mode text color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeTextColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode option background color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionBackground?: string;

  @ApiPropertyOptional({ description: 'Dark mode option hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionHover?: string;

  @ApiPropertyOptional({ description: 'Dark mode link color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode link hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkHoverColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode progress bar background override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeProgressBackground?: string;

  @ApiPropertyOptional({ description: 'Dark mode percentage label color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModePercentageLabelColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode icon color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode icon hover color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconHoverColor?: string;

  @ApiPropertyOptional({ description: 'Dark mode radio border color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioBorder?: string;

  @ApiPropertyOptional({ description: 'Dark mode radio checked border color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedBorder?: string;

  @ApiPropertyOptional({ description: 'Dark mode radio checked dot color override for this client' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedDot?: string;
}

export class CreatePollDto {
  @ApiProperty({ description: 'Poll title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Poll description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Default highlight color for poll results', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  highlightColor?: string = '#2597a4';

  @ApiPropertyOptional({ 
    description: 'Animation effect for poll results', 
    enum: ['fade', 'slide', 'pulse', 'bounce', 'none'],
    default: 'fade'
  })
  @IsEnum(['fade', 'slide', 'pulse', 'bounce', 'none'])
  @IsOptional()
  highlightAnimation?: string = 'fade';

  @ApiPropertyOptional({ description: 'Allow users to view results before voting', default: true })
  @IsBoolean()
  @IsOptional()
  showResults?: boolean = true;

  @ApiPropertyOptional({ description: 'Auto-embed poll in content', default: false })
  @IsBoolean()
  @IsOptional()
  autoEmbed?: boolean = false;
  
  @ApiPropertyOptional({ description: 'Auto-embed poll in all posts', default: false })
  @IsBoolean()
  @IsOptional()
  autoEmbedAllPosts?: boolean = false;

  @ApiPropertyOptional({ description: 'Locations to auto-embed the poll (array of post IDs)' })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  autoEmbedLocations?: number[] = [];

  @ApiProperty({ type: [PollOptionDto], description: 'Poll options' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  options: PollOptionDto[];

  @ApiProperty({ description: 'Primary Client ID' })
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;

  @ApiPropertyOptional({ description: 'Make this poll available to multiple clients', default: false })
  @IsBoolean()
  @IsOptional()
  isMultiClient?: boolean = false;

  @ApiPropertyOptional({ description: 'Additional client IDs for multi-client poll', type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  additionalClientIds?: string[] = [];

  @ApiPropertyOptional({ description: 'Client-specific style overrides' })
  @IsObject()
  @IsOptional()
  clientStyleOverrides?: Record<string, ClientStyleOverrideDto> = {};

  @ApiPropertyOptional({ description: 'Original WordPress Poll ID' })
  @IsNumber()
  @IsOptional()
  wordpressId?: number;

  // All style properties
  @ApiPropertyOptional({ description: 'Vote button color', default: '#0a0a0a' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonColor?: string = '#0a0a0a';

  @ApiPropertyOptional({ description: 'Vote button hover color', default: '#1d7a84' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonHoverColor?: string = '#1d7a84';

  @ApiPropertyOptional({ description: 'Options background color', default: '#fcfcfc' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsBackgroundColor?: string = '#fcfcfc';

  @ApiPropertyOptional({ description: 'Options hover color', default: '#f7f9fc' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsHoverColor?: string = '#f7f9fc';

  @ApiPropertyOptional({ description: 'Results link color', default: '#0a0a0a' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkColor?: string = '#0a0a0a';

  @ApiPropertyOptional({ description: 'Results link hover color', default: '#1d7a84' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkHoverColor?: string = '#1d7a84';

  @ApiPropertyOptional({ description: 'Progress bar background color', default: '#f0f0f5' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  progressBarBackgroundColor?: string = '#f0f0f5';
  
  @ApiPropertyOptional({ description: 'Percentage label color', default: '#ffffff' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  percentageLabelColor?: string = '#ffffff';
  
  @ApiPropertyOptional({ description: 'Icon color', default: '#d0d5dd' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconColor?: string = '#d0d5dd';
  
  @ApiPropertyOptional({ description: 'Icon hover color', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconHoverColor?: string = '#2597a4';
  
  // Radio button styling
  @ApiPropertyOptional({ description: 'Radio button border color (unchecked)', default: '#d0d5dd' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioBorderColor?: string = '#d0d5dd';

  @ApiPropertyOptional({ description: 'Radio button border color (checked)', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedBorderColor?: string = '#2597a4';

  @ApiPropertyOptional({ description: 'Radio button dot color (checked)', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedDotColor?: string = '#2597a4';
  
  // Dark mode properties
  @ApiPropertyOptional({ description: 'Enable dark mode version of the poll', default: false })
  @IsBoolean()
  @IsOptional()
  darkMode?: boolean = false;
  
  @ApiPropertyOptional({ description: 'Dark mode background color', default: '#222222' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeBackground?: string = '#222222';
  
  @ApiPropertyOptional({ description: 'Dark mode text color', default: '#ffffff' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeTextColor?: string = '#ffffff';
  
  @ApiPropertyOptional({ description: 'Dark mode option background color', default: '#333333' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionBackground?: string = '#333333';
  
  @ApiPropertyOptional({ description: 'Dark mode option hover color', default: '#444444' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionHover?: string = '#444444';
  
  @ApiPropertyOptional({ description: 'Dark mode link color', default: '#ffffff' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkColor?: string = '#ffffff';
  
  @ApiPropertyOptional({ description: 'Dark mode link hover color', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkHoverColor?: string = '#2597a4';
  
  @ApiPropertyOptional({ description: 'Dark mode progress bar background', default: '#444444' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeProgressBackground?: string = '#444444';
  
  @ApiPropertyOptional({ description: 'Dark mode percentage label color', default: '#ffffff' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModePercentageLabelColor?: string = '#ffffff';
  
  @ApiPropertyOptional({ description: 'Dark mode icon color', default: '#ffffff' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconColor?: string = '#ffffff';
  
  @ApiPropertyOptional({ description: 'Dark mode icon hover color', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconHoverColor?: string = '#2597a4';
  
  // Dark mode radio button styling
  @ApiPropertyOptional({ description: 'Dark mode radio border color (unchecked)', default: '#444444' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioBorder?: string = '#444444';

  @ApiPropertyOptional({ description: 'Dark mode radio border color (checked)', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedBorder?: string = '#2597a4';

  @ApiPropertyOptional({ description: 'Dark mode radio dot color (checked)', default: '#2597a4' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedDot?: string = '#2597a4';

  @ApiPropertyOptional({ description: 'Allow users to vote multiple times', default: false })
  @IsBoolean()
  @IsOptional()
  allowMultipleVotes?: boolean = false;
}

// For multi-client poll creation with more control
export class CreateMultiClientPollDto extends CreatePollDto {
  @ApiProperty({ description: 'Make this poll available to multiple clients' })
  @IsBoolean()
  isMultiClient: boolean = true;

  @ApiProperty({ description: 'Additional client IDs for multi-client poll', type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  additionalClientIds: string[];

  @ApiProperty({ description: 'Client-specific style overrides' })
  @IsObject()
  clientStyleOverrides: Record<string, ClientStyleOverrideDto>;
}

export class UpdatePollDto {
  @ApiPropertyOptional({ description: 'Poll title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Allow users to vote multiple times' })
  @IsBoolean()
  @IsOptional()
  allowMultipleVotes?: boolean;

  @ApiPropertyOptional({ description: 'Poll description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Default highlight color for poll results' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  highlightColor?: string;

  @ApiPropertyOptional({ 
    description: 'Animation effect for poll results', 
    enum: ['fade', 'slide', 'pulse', 'bounce', 'none']
  })
  @IsEnum(['fade', 'slide', 'pulse', 'bounce', 'none'])
  @IsOptional()
  highlightAnimation?: string;

  @ApiPropertyOptional({ description: 'Allow users to view results before voting' })
  @IsBoolean()
  @IsOptional()
  showResults?: boolean;

  @ApiPropertyOptional({ description: 'Auto-embed poll in content' })
  @IsBoolean()
  @IsOptional()
  autoEmbed?: boolean;
  
  @ApiPropertyOptional({ description: 'Auto-embed poll in all posts' })
  @IsBoolean()
  @IsOptional()
  autoEmbedAllPosts?: boolean;

  @ApiPropertyOptional({ description: 'Locations to auto-embed the poll (array of post IDs)' })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  autoEmbedLocations?: number[];

  @ApiPropertyOptional({ type: [PollOptionDto], description: 'Poll options' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  @IsOptional()
  options?: PollOptionDto[];

  @ApiPropertyOptional({ description: 'Make this poll available to multiple clients' })
  @IsBoolean()
  @IsOptional()
  isMultiClient?: boolean;

  @ApiPropertyOptional({ description: 'Additional client IDs for multi-client poll', type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  additionalClientIds?: string[];

  @ApiPropertyOptional({ description: 'Client-specific style overrides' })
  @IsObject()
  @IsOptional()
  clientStyleOverrides?: Record<string, ClientStyleOverrideDto>;

  // All other style properties - same as in CreatePollDto but all optional
  @ApiPropertyOptional({ description: 'Vote button color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonColor?: string;

  @ApiPropertyOptional({ description: 'Vote button hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  voteButtonHoverColor?: string;

  @ApiPropertyOptional({ description: 'Options background color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsBackgroundColor?: string;

  @ApiPropertyOptional({ description: 'Options hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  optionsHoverColor?: string;

  @ApiPropertyOptional({ description: 'Results link color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkColor?: string;

  @ApiPropertyOptional({ description: 'Results link hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  resultsLinkHoverColor?: string;

  @ApiPropertyOptional({ description: 'Progress bar background color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  progressBarBackgroundColor?: string;
  
  @ApiPropertyOptional({ description: 'Percentage label color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  percentageLabelColor?: string;
  
  @ApiPropertyOptional({ description: 'Icon color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconColor?: string;
  
  @ApiPropertyOptional({ description: 'Icon hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  iconHoverColor?: string;
  
  // Radio button styling
  @ApiPropertyOptional({ description: 'Radio button border color (unchecked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioBorderColor?: string;

  @ApiPropertyOptional({ description: 'Radio button border color (checked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedBorderColor?: string;

  @ApiPropertyOptional({ description: 'Radio button dot color (checked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  radioCheckedDotColor?: string;
  
  // Dark mode properties
  @ApiPropertyOptional({ description: 'Enable dark mode version of the poll' })
  @IsBoolean()
  @IsOptional()
  darkMode?: boolean;
  
  @ApiPropertyOptional({ description: 'Dark mode background color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeBackground?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode text color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeTextColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode option background color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionBackground?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode option hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeOptionHover?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode link color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode link hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeLinkHoverColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode progress bar background' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeProgressBackground?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode percentage label color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModePercentageLabelColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode icon color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode icon hover color' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeIconHoverColor?: string;
  
  @ApiPropertyOptional({ description: 'Dark mode radio border color (unchecked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioBorder?: string;

  @ApiPropertyOptional({ description: 'Dark mode radio border color (checked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedBorder?: string;

  @ApiPropertyOptional({ description: 'Dark mode radio dot color (checked)' })
  @IsString()
  @IsHexColor()
  @IsOptional()
  darkModeRadioCheckedDot?: string;
}

export class PollVoteDto {
  @ApiProperty({ description: 'Option ID to vote for' })
  @IsNumber()
  @IsNotEmpty()
  optionIndex: number;
}

export class ListPollsQueryDto {
  @ApiPropertyOptional({ description: 'Search term for poll title', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 10, minimum: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt' })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Include polls shared between multiple clients', default: true })
  @IsBoolean()
  @IsOptional()
  includeMultiClient?: boolean = true;
}

// DTO for adding a client to a poll
export class AddClientToPollDto {
  @ApiProperty({ description: 'Client ID to add to poll' })
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;
  
  @ApiPropertyOptional({ description: 'Style overrides for this client' })
  @ValidateNested()
  @Type(() => ClientStyleOverrideDto)
  @IsOptional()
  styleOverrides?: ClientStyleOverrideDto;
}

// DTO for removing a client from a poll
export class RemoveClientFromPollDto {
  @ApiProperty({ description: 'Client ID to remove from poll' })
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;
}

// Get the client-specific styling for a poll
export class ClientSpecificPollDto {
  @ApiProperty({ description: 'Poll ID' })
  @IsMongoId()
  @IsNotEmpty()
  pollId: string;

  @ApiProperty({ description: 'Client ID' })
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;
}