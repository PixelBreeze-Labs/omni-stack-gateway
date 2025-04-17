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
    IsHexColor
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
  
    @ApiProperty({ description: 'Client ID' })
    @IsMongoId()
    @IsNotEmpty()
    clientId: string;
  
    @ApiPropertyOptional({ description: 'Original WordPress Poll ID' })
    @IsNumber()
    @IsOptional()
    wordpressId?: number;

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
  }
  
  export class UpdatePollDto {
    @ApiPropertyOptional({ description: 'Poll title' })
    @IsString()
    @IsOptional()
    title?: string;
  
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
  }