// src/controllers/gateway.controller.ts
import { Controller, All, Param, Req, Body } from '@nestjs/common';
import { SnapfoodService } from '../services/snapfood.service';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';
import { Request } from 'express';
import {ApiBody, ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Gateway')
@Controller('api')
export class GatewayController {
    constructor(
        private readonly snapfoodService: SnapfoodService,
        private readonly snapfoodAdminService: SnapfoodAdminService,
    ) {}

    // Route to SnapFood
    @ApiOperation({ summary: 'Forward request to SnapFood legacy service' })
    @ApiBody({ description: 'Request body to forward' })
    @ApiResponse({ status: 200, description: 'Request forwarded successfully' })
    @All('legacy/*')
    async routeToLumen(@Req() req: Request, @Body() body: any) {
        const endpoint = req.url.replace('/api/legacy/', '');
        return await this.snapfoodService.forward(endpoint, req.method, body);
    }

    // Route to SnapFood Admin
    @ApiOperation({ summary: 'Forward request to SnapFood admin service' })
    @ApiBody({ description: 'Request body to forward' })
    @ApiResponse({ status: 200, description: 'Request forwarded successfully' })
    @All('admin/*')
    async routeToAdmin(@Req() req: Request, @Body() body: any) {
        const endpoint = req.url.replace('/api/admin/', '');
        return await this.snapfoodAdminService.forward(endpoint, req.method, body);
    }
}