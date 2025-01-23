@Controller('scan-reports')
@UseGuards(ClientAuthGuard)
export class ScanReportController {
    constructor(private scanReportService: ScanReportService) {}

    @Get('daily')
    getDailyReport(
        @Query() query: ScanReportQueryDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.scanReportService.getDailyReport(query, req.client.id);
    }

    @Get('product/:productId')
    getProductScanHistory(@Param('productId') productId: string) {
        return this.scanReportService.getProductHistory(productId);
    }
}