import {Body, Controller, Put, Req, UseGuards, HttpCode, Delete, Get, Post, Param} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LoyaltyProgramService } from '../services/loyalty-program.service';
import { UpdateLoyaltyProgramDto, UpdatePointsSystemDto, BonusDayDto } from '../dtos/loyalty-program.dto';
import { Client } from '../schemas/client.schema';
import {ClientAuthGuard} from "../guards/client-auth.guard";
import {LoyaltyProgram} from "../schemas/loyalty-program.schema";

@ApiTags('Loyalty Program')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(ClientAuthGuard)
export class LoyaltyProgramController {
    constructor(private readonly loyaltyProgramService: LoyaltyProgramService) {}

    @Put()
    @HttpCode(200)
    @ApiOperation({ summary: 'Create or update loyalty program for a client' })
    @ApiResponse({ status: 200, description: 'Loyalty program updated successfully' })
    async updateLoyaltyProgram(
        @Req() req: Request & { client: Client },
        @Body() updateDto: UpdateLoyaltyProgramDto,
    ): Promise<Client> {
        return this.loyaltyProgramService.updateLoyaltyProgram(req.client.id, updateDto);
    }

    @Delete()
    @HttpCode(200)
    @ApiOperation({ summary: 'Disable (remove) loyalty program for a client' })
    @ApiResponse({ status: 200, description: 'Loyalty program disabled successfully' })
    async disableLoyaltyProgram(
        @Req() req: Request & { client: Client }
    ): Promise<Client> {
        return this.loyaltyProgramService.disableLoyaltyProgram(req.client.id);
    }

    @Get()
    @HttpCode(200)
    @ApiOperation({ summary: 'Get current loyalty program' })
    @ApiResponse({ status: 200, description: 'Returns the current loyalty program configuration' })
    async getLoyaltyProgram(@Req() req: Request & { client: Client }): Promise<LoyaltyProgram> {
        return this.loyaltyProgramService.getLoyaltyProgram(req.client.id);
    }

    @Put('points')
    @ApiOperation({ summary: 'Update points system' })
    async updatePointsSystem(
        @Req() req: Request & { client: Client },
        @Body() updateDto: UpdatePointsSystemDto
    ) {
        return this.loyaltyProgramService.updatePointsSystem(req.client.id, updateDto);
    }

    @Post('points/bonus-days')
    @ApiOperation({ summary: 'Add bonus day' })
    async addBonusDay(
        @Req() req: Request & { client: Client },
        @Body() bonusDay: BonusDayDto
    ) {
        return this.loyaltyProgramService.addBonusDay(req.client.id, bonusDay);
    }

    @Delete('points/bonus-days/:id')
    @ApiOperation({ summary: 'Remove bonus day' })
    async removeBonusDay(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.loyaltyProgramService.removeBonusDay(req.client.id, id);
    }
}