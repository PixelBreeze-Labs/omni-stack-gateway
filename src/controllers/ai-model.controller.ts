// src/controllers/ai-model.controller.ts
import {
    Controller,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    Patch
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AiModelService } from '../services/ai-model.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';

@ApiTags('AI Models')
@ApiBearerAuth()
@Controller('ai-models')
@UseGuards(ClientAuthGuard)
export class AiModelController {
    constructor(
        private readonly aiModelService: AiModelService
    ) {}


    /**
     * Sync AI models from NextJS
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync AI models from NextJS' })
    @ApiResponse({
        status: 200,
        description: 'AI models synced successfully'
    })
    async syncAiModels(
        @Req() req: Request & { client: Client },
        @Body() data: { models: any[] }
    ) {
        return this.aiModelService.syncAiModelsFromNextjs(req.client.id, data.models);
    }

    /**
     * Update NextJS ID for a model
     */
    @Patch(':id/nextjs-id')
    @ApiOperation({ summary: 'Update NextJS ID for a model' })
    @ApiResponse({
        status: 200,
        description: 'NextJS ID updated successfully'
    })
    async updateNextJsId(
        @Param('id') id: string,
        @Body() data: { nextJsId: string }
    ) {
        return this.aiModelService.updateNextJsId(id, data.nextJsId);
    }
}