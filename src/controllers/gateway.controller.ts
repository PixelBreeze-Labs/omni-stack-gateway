// src/controllers/gateway.controller.ts
import { Controller, All, Param, Req, Body } from '@nestjs/common';
import { SnapfoodService } from '../services/snapfood.service';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';
import { Request } from 'express';

@Controller('api')
export class GatewayController {
    constructor(
        private readonly snapfoodService: SnapfoodService,
        private readonly snapfoodAdminService: SnapfoodAdminService,
    ) {}

    // Route to SnapFood
    @All('legacy/*')
    async routeToLumen(@Req() req: Request, @Body() body: any) {
        const endpoint = req.url.replace('/api/legacy/', '');
        return await this.snapfoodService.forward(endpoint, req.method, body);
    }

    // Route to SnapFood Admin
    @All('admin/*')
    async routeToAdmin(@Req() req: Request, @Body() body: any) {
        const endpoint = req.url.replace('/api/admin/', '');
        return await this.snapfoodAdminService.forward(endpoint, req.method, body);
    }
}