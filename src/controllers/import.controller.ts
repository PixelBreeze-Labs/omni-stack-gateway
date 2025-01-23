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

@Controller('import')
export class ImportController {
    constructor(
        private importServiceFactory: ImportServiceFactory,
    ) {}

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
        return importService.processFile(file.buffer, file.originalname, brandId,  req.client.id);
    }
}