import {BrandScraperService} from "../services/scraping/brand-scraper.service";
import {Controller, Post, Body} from "@nestjs/common";
import {ApiBody, ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Scraper')
@Controller('scraper')
export class ScraperController {
    constructor(private brandScraperService: BrandScraperService) {}

    @ApiOperation({ summary: 'Test brand product scraping' })
    @ApiBody({
        schema: {
            properties: {
                brandId: { type: 'string' },
                url: { type: 'string' }
            }
        }
    })
    @ApiResponse({ status: 200, description: 'Scraping completed' })
    @Post('test')
    async testScrape(
        @Body('brandId') brandId: string,
        @Body('url') url: string
    ) {
        return this.brandScraperService.scrapeProducts(brandId, url);
    }
}