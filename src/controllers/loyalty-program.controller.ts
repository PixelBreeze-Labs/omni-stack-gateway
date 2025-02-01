import { Controller, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoyaltyProgramService } from '../services/loyalty-program.service';
import { UpdateLoyaltyProgramDto } from '../dtos/loyalty-program.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Loyalty Program')
@Controller('api/clients/:clientId/loyalty')
export class LoyaltyProgramController {
    constructor(private readonly loyaltyProgramService: LoyaltyProgramService) {}

    @Put()
    @HttpCode(200)
    @ApiOperation({ summary: 'Create or update loyalty program for a client' })
    @ApiResponse({ status: 200, description: 'Loyalty program updated successfully' })
    async updateLoyaltyProgram(
        @Param('clientId') clientId: string,
        @Body() updateDto: UpdateLoyaltyProgramDto,
    ): Promise<Client> {
        return this.loyaltyProgramService.updateLoyaltyProgram(clientId, updateDto);
    }

    @Delete()
    @HttpCode(200)
    @ApiOperation({ summary: 'Disable (remove) loyalty program for a client' })
    @ApiResponse({ status: 200, description: 'Loyalty program disabled successfully' })
    async disableLoyaltyProgram(@Param('clientId') clientId: string): Promise<Client> {
        return this.loyaltyProgramService.disableLoyaltyProgram(clientId);
    }
}
