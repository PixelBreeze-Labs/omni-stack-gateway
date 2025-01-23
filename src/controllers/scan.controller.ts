// scan.controller.ts
import {Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req} from '@nestjs/common';
import { ReportsService } from '../services/reports.service';
import {Client} from "../schemas/client.schema";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {ScanService} from "../services/scan.service";
import {ScanProductDto} from "../dtos/scan.dto";

@Controller('scan')
@UseGuards(ClientAuthGuard)
export class ScanController {
    constructor(private scanService: ScanService) {}

    @Get(':barcode')
    async scanBarcode(
        @Param('barcode') barcode: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.scanService.findByBarcode(barcode, req.client.id);
    }

    @Post()
    async scanProduct(
        @Body() scanDto: ScanProductDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.scanService.processProductScan(scanDto, req.client.id);
    }
}