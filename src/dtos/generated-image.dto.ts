import { IsNotEmpty, IsOptional, IsString, IsDate, IsEnum, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum EntityType {
    ICONSTYLE = 'iconstyle',
    GAZETAREFORMA = 'reforma',
    OTHER = 'other'
}

export class CreateGeneratedImageDto {
    @ApiProperty({ description: 'File path of the generated image' })
    @IsString()
    @IsNotEmpty()
    path: string;

    @ApiProperty({ description: 'Unique session ID for the generation process' })
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({ description: 'Type of template used' })
    @IsString()
    @IsNotEmpty()
    templateType: string;

    @ApiProperty({ description: 'Subtitle used in the template', required: false })
    @IsString()
    @IsOptional()
    subtitle?: string;

    @ApiProperty({ description: 'Entity type', enum: EntityType })
    @IsEnum(EntityType)
    @IsNotEmpty()
    entity: EntityType;


    @ApiProperty({ description: 'URL of the article used to generate the image', required: false })
    @IsString()
    @IsOptional()
    articleUrl?: string;
}

export class UpdateGeneratedImageDto {
    @ApiProperty({ description: 'Time when the image was downloaded', required: false })
    @IsDate()
    @Type(() => Date)
    @IsOptional()
    downloadTime?: Date;
}

export class ListGeneratedImagesDto {
    @ApiProperty({ description: 'Client ID', required: false })
    @IsMongoId()
    @IsOptional()
    clientId?: string;

    @ApiProperty({ description: 'Entity type', enum: EntityType, required: false })
    @IsEnum(EntityType)
    @IsOptional()
    entity?: EntityType;

    @ApiProperty({ description: 'Template type', required: false })
    @IsString()
    @IsOptional()
    templateType?: string;

    @ApiProperty({ description: 'Page number', required: false, default: 1 })
    @Type(() => Number)
    @IsOptional()
    page?: number = 1;

    @ApiProperty({ description: 'Items per page', required: false, default: 20 })
    @Type(() => Number)
    @IsOptional()
    limit?: number = 20;
}