// src/services/loyalty-program.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Client } from '../schemas/client.schema';
import { Model } from 'mongoose';
import { UpdateLoyaltyProgramDto } from '../dtos/loyalty-program.dto';
import { LoyaltyProgram } from '../schemas/loyalty-program.schema';

@Injectable()
export class LoyaltyProgramService {
    constructor(@InjectModel(Client.name) private clientModel: Model<Client>) {}

    async updateLoyaltyProgram(
        clientId: string,
        updateDto: UpdateLoyaltyProgramDto,
    ): Promise<Client> {
        const client = await this.clientModel.findById(clientId).exec();
        if (!client) {
            throw new NotFoundException('Client not found');
        }

        // Cast the current loyalty program to our expected type.
        const currentLp = (client.loyaltyProgram as LoyaltyProgram) || ({} as LoyaltyProgram);
        // Ensure currentPointsSystem.earningPoints exists as an object.
        const currentPointsSystem = currentLp.pointsSystem || {
            earningPoints: {} as any,
            redeemingPoints: {} as any
        };

        // Ensure that bonusDays is available from either the DTO or the current value.
        const currentEarningPoints = currentPointsSystem.earningPoints as any;
        const bonusDaysFromDto =
            updateDto.pointsSystem?.earningPoints?.bonusDays ??
            (currentEarningPoints && currentEarningPoints.bonusDays ? currentEarningPoints.bonusDays : []);

        // Convert bonusDays dates from string to Date objects.
        const parsedBonusDays = bonusDaysFromDto.map((bd: any) => ({
            ...bd,
            date: bd.date ? new Date(bd.date) : new Date(),
        }));

        const updatedPointsSystem = {
            ...currentPointsSystem,
            ...updateDto.pointsSystem,
            earningPoints: {
                spend:
                    updateDto.pointsSystem?.earningPoints?.spend ??
                    currentPointsSystem.earningPoints?.spend ??
                    1,
                bonusDays: parsedBonusDays,
                signUpBonus:
                    updateDto.pointsSystem?.earningPoints?.signUpBonus ??
                    currentPointsSystem.earningPoints?.signUpBonus ??
                    50,
                reviewPoints:
                    updateDto.pointsSystem?.earningPoints?.reviewPoints ??
                    currentPointsSystem.earningPoints?.reviewPoints ??
                    10,
                socialSharePoints:
                    updateDto.pointsSystem?.earningPoints?.socialSharePoints ??
                    currentPointsSystem.earningPoints?.socialSharePoints ??
                    5,
            },
            redeemingPoints: {
                pointsPerDiscount:
                    updateDto.pointsSystem?.redeemingPoints?.pointsPerDiscount ??
                    currentPointsSystem.redeemingPoints?.pointsPerDiscount ??
                    100,
                discountValue:
                    updateDto.pointsSystem?.redeemingPoints?.discountValue ??
                    currentPointsSystem.redeemingPoints?.discountValue ??
                    5,
                discountType:
                    updateDto.pointsSystem?.redeemingPoints?.discountType ??
                    currentPointsSystem.redeemingPoints?.discountType ??
                    'fixed',
                exclusiveRewards:
                    updateDto.pointsSystem?.redeemingPoints?.exclusiveRewards ??
                    currentPointsSystem.redeemingPoints?.exclusiveRewards ??
                    [],
            },
        };

        const updatedLoyaltyProgram = {
            ...currentLp,
            ...updateDto,
            pointsSystem: updatedPointsSystem,
            membershipTiers:
                updateDto.membershipTiers ?? currentLp.membershipTiers ?? [],
        };

        client.loyaltyProgram = updatedLoyaltyProgram;
        return client.save();
    }

    async disableLoyaltyProgram(clientId: string): Promise<Client> {
        const client = await this.clientModel.findById(clientId).exec();
        if (!client) {
            throw new NotFoundException('Client not found');
        }
        client.loyaltyProgram = {} as any;
        return client.save();
    }
}
