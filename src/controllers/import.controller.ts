// src/controllers/import.controller.ts
import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    Body,
    UseGuards,
    Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportServiceFactory } from '../services/import/import-factory.service';
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {Client} from "../schemas/client.schema";
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiConsumes,
    ApiBearerAuth, ApiBody
} from '@nestjs/swagger';

@ApiTags('Import')
@Controller('import')
export class ImportController {
    constructor(private importServiceFactory: ImportServiceFactory) {}

    @ApiOperation({ summary: 'Import products from file' })
    @ApiConsumes('multipart/form-data')
    @ApiBearerAuth()
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
                type: {
                    type: 'string',
                    enum: ['bybest']
                },
                brandId: {
                    type: 'string'
                }
            }
        }
    })
    @ApiResponse({ status: 201, description: 'Products imported successfully' })
    @Post('products')
    @UseGuards(ClientAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    async importProducts(
        @UploadedFile() file: Express.Multer.File,
        @Body('type') type: string,
        @Body('brandId') brandId: string,
        @Req() req: Request & { client: Client }
    ) {
        const importService = this.importServiceFactory.getImportService(type);
        return importService.processFile(file.buffer, file.originalname, brandId, req.client.id);
    }
}