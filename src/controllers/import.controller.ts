// src/controllers/import.controller.ts
import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportServiceFactory } from '../services/import/import-factory.service';

@Controller('import')
export class ImportController {
    constructor(private importServiceFactory: ImportServiceFactory) {}

    @Post('products')
    @UseInterceptors(FileInterceptor('file'))
    async importProducts(
        @UploadedFile() file: Express.Multer.File,
        @Body('type') type: string,
        @Body('brandId') brandId?: string
    ) {
        if (!file) throw new BadRequestException('File is required');
        if (!type) throw new BadRequestException('Type is required');

        const importService = this.importServiceFactory.getImportService(type);
        return importService.processFile(file.buffer, file.originalname, brandId);
    }
}