// src/controllers/template.controller.ts
import {Body, Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors} from "@nestjs/common";
import {Client} from "../schemas/client.schema";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {TemplateService} from "../services/import/processors/template.service";
import {CreateTemplateDto} from "../dtos/template.dto";
import {FileInterceptor} from "@nestjs/platform-express";

@Controller('templates')
@UseGuards(ClientAuthGuard)
export class TemplateController {
    constructor(
        private templateService: TemplateService
    ) {}

    @Post()
    async create(
        @Body() createTemplateDto: CreateTemplateDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.templateService.create({
            ...createTemplateDto,
            clientId: req.client.id
        });
    }

    @Get()
    async findAll(@Req() req: Request & { client: Client }) {
        return this.templateService.findAll(req.client.id);
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.templateService.findOne(id, req.client.id);
    }

    @Post(':id/import')
    @UseInterceptors(FileInterceptor('file'))
    async importFile(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request & { client: Client }
    ) {
        return this.templateService.processImport(id, file.buffer);
    }
}