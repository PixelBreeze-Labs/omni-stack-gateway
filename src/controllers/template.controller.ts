// src/controllers/template.controller.ts
import {Body, Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors} from "@nestjs/common";
import {Client} from "../schemas/client.schema";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {TemplateService} from "../services/import/processors/template.service";
import {CreateTemplateDto} from "../dtos/template.dto";
import {FileInterceptor} from "@nestjs/platform-express";
import {ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Templates')
@Controller('templates')
@UseGuards(ClientAuthGuard)
export class TemplateController {
    constructor(
        private templateService: TemplateService
    ) {}

    @ApiOperation({ summary: 'Create import template' })
    @ApiBody({ type: CreateTemplateDto })
    @ApiResponse({ status: 201, description: 'Template created' })
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

    @ApiOperation({ summary: 'List all templates' })
    @ApiResponse({ status: 200, description: 'Templates retrieved' })
    @Get()
    async findAll(@Req() req: Request & { client: Client }) {
        return this.templateService.findAll(req.client.id);
    }

    @ApiOperation({ summary: 'Get single template' })
    @ApiParam({ name: 'id', description: 'Template ID' })
    @ApiResponse({ status: 200, description: 'Template retrieved' })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.templateService.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Import file using template' })
    @ApiParam({ name: 'id', description: 'Template ID' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary'
                }
            }
        }
    })
    @ApiResponse({ status: 200, description: 'File imported' })
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