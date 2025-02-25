// src/controllers/subscription-config.controller.ts
import { ClientAuthGuard } from "../guards/client-auth.guard";
import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { UpdateSubscriptionConfigDto } from "../dtos/subscription-config.dto";
import { Client } from "../schemas/client.schema";
import { SubscriptionConfigService } from "../services/subscription-config.service";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Subscription Config')
@ApiBearerAuth()
@Controller('subscription-config')
@UseGuards(ClientAuthGuard)
export class SubscriptionConfigController {
    constructor(private subscriptionConfigService: SubscriptionConfigService) {}

    @ApiOperation({ summary: 'Get subscription configuration' })
    @ApiResponse({ status: 200, description: 'Return subscription configuration' })
    @Get()
    async getConfig(@Req() req: Request & { client: Client }) {
        return this.subscriptionConfigService.getConfig(req.client.id);
    }

    @ApiOperation({ summary: 'Update subscription configuration' })
    @ApiBody({ type: UpdateSubscriptionConfigDto })
    @ApiResponse({ status: 200, description: 'Subscription configuration updated successfully' })
    @Put()
    async updateConfig(
        @Body() updateConfigDto: UpdateSubscriptionConfigDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.subscriptionConfigService.updateConfig(req.client.id, updateConfigDto);
    }
}