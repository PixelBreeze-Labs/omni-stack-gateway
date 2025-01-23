import {Controller, Req, UseGuards, Query, Get, Param} from "@nestjs/common";
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {ScanReportService} from "../services/scan-report.service";
import {ScanReportQueryDto} from "../dtos/scan-report.dto";
import {Client} from "../schemas/client.schema";
import {ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Scan Reports')
@ApiBearerAuth()
@Controller('scan-reports')
@UseGuards(ClientAuthGuard)
export class ScanReportController {
    constructor(private scanReportService: ScanReportService) {}

    @ApiOperation({ summary: 'Get daily scan report' })
    @ApiQuery({ type: ScanReportQueryDto })
    @ApiResponse({
        status: 200,
        description: 'Daily scan aggregation by action'
    })
    @Get('daily')
    getDailyReport(
        @Query() query: ScanReportQueryDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.scanReportService.getDailyReport(query, req.client.id);
    }

    @ApiOperation({ summary: 'Get scan history for product' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiResponse({
        status: 200,
        description: 'Product scan history'
    })
    @Get('product/:productId')
    getProductScanHistory(@Param('productId') productId: string) {
        return this.scanReportService.getProductHistory(productId);
    }
}