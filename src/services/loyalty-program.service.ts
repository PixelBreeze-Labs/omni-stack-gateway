import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Client } from '../schemas/client.schema';
import { Model } from 'mongoose';
import {
    UpdateLoyaltyProgramDto,
    UpdatePointsSystemDto,
    BonusDayDto,
    StayTrackingDto
} from '../dtos/loyalty-program.dto';
import { LoyaltyProgram, StayTracking } from '../schemas/loyalty-program.schema';

@Injectable()
export class LoyaltyProgramService {
    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    private transformBonusDays(bonusDays: BonusDayDto[] = []): any[] {
        return bonusDays.map(day => ({
            ...day,
            date: new Date(day.date)
        }));
    }

    // Transform pointsPerStay from plain object to Map for storage
    private transformPointsPerStay(pointsPerStay: Record<string, number> = {}): Map<string, number> {
        return new Map(Object.entries(pointsPerStay));
    }

    async getLoyaltyProgram(clientId: string): Promise<LoyaltyProgram> {
        const client = await this.clientModel.findById(clientId)
            .select('+apiKey')
            .exec();

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        return client.loyaltyProgram;
    }

    async updateLoyaltyProgram(
        clientId: string,
        updateDto: UpdateLoyaltyProgramDto,
    ): Promise<Client> {
        const client = await this.clientModel.findById(clientId)
            .select('+apiKey')
            .exec();

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        // Cast the current loyalty program to our expected type
        const currentLp = (client.loyaltyProgram as LoyaltyProgram) || ({} as LoyaltyProgram);
        const currentPointsSystem = currentLp.pointsSystem || {
            earningPoints: {} as any,
            redeemingPoints: {} as any
        };

        const updatedPointsSystem = {
            ...currentPointsSystem,
            ...updateDto.pointsSystem,
            earningPoints: {
                spend:
                    updateDto.pointsSystem?.earningPoints?.spend ??
                    currentPointsSystem.earningPoints?.spend ??
                    1,
                bonusDays: this.transformBonusDays(
                    updateDto.pointsSystem?.earningPoints?.bonusDays ||
                    (currentPointsSystem.earningPoints?.bonusDays as BonusDayDto[]) ||
                    []
                ),
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

        // Map membership tiers from DTO
        const updatedMembershipTiers = (updateDto.membershipTiers ?? currentLp.membershipTiers ?? []).map((mt) => ({
            ...mt,
            perks: mt.perks ?? []
        }));

        // Initialize with default values for accommodation-specific stayTracking
        const defaultStayTracking: StayTracking = {
            evaluationPeriod: { upgrade: 12, downgrade: 6 },
            pointsPerStay: new Map<string, number>(),
            stayDefinition: { minimumNights: 1, checkoutRequired: true }
        };

        // Handle accommodation-specific stayTracking
        const currentStayTracking = currentLp.stayTracking || defaultStayTracking;

        const updatedStayTracking = updateDto.stayTracking
            ? {
                ...currentStayTracking,
                evaluationPeriod: {
                    ...currentStayTracking.evaluationPeriod,
                    ...updateDto.stayTracking.evaluationPeriod
                },
                stayDefinition: {
                    ...currentStayTracking.stayDefinition,
                    ...updateDto.stayTracking.stayDefinition
                },
                pointsPerStay: updateDto.stayTracking.pointsPerStay
                    ? this.transformPointsPerStay(updateDto.stayTracking.pointsPerStay)
                    : currentStayTracking.pointsPerStay
            }
            : currentStayTracking;

        const updatedLoyaltyProgram = {
            ...currentLp,
            ...updateDto,
            pointsSystem: updatedPointsSystem,
            membershipTiers: updatedMembershipTiers,
            stayTracking: updatedStayTracking
        };

        client.loyaltyProgram = updatedLoyaltyProgram as LoyaltyProgram;
        return client.save();
    }

    async updatePointsSystem(clientId: string, updateDto: UpdatePointsSystemDto) {
        const client = await this.clientModel.findById(clientId);
        if (!client) throw new NotFoundException('Client not found');

        // Transform dates in bonusDays before updating
        const transformedUpdateDto = {
            ...updateDto,
            earningPoints: {
                ...updateDto.earningPoints,
                bonusDays: this.transformBonusDays(updateDto.earningPoints.bonusDays)
            }
        };

        const updatedProgram = {
            ...client.loyaltyProgram,
            pointsSystem: {
                ...client.loyaltyProgram.pointsSystem,
                ...transformedUpdateDto
            }
        };

        client.loyaltyProgram = updatedProgram as LoyaltyProgram;
        return client.save();
    }

    async updateStayTracking(clientId: string, updateDto: StayTrackingDto) {
        const client = await this.clientModel.findById(clientId);
        if (!client) throw new NotFoundException('Client not found');

        // Initialize with default values for stay tracking
        const defaultStayTracking: StayTracking = {
            evaluationPeriod: { upgrade: 12, downgrade: 6 },
            pointsPerStay: new Map<string, number>(),
            stayDefinition: { minimumNights: 1, checkoutRequired: true }
        };

        // Get current stayTracking or initialize if doesn't exist
        const currentStayTracking = client.loyaltyProgram.stayTracking || defaultStayTracking;

        const updatedStayTracking = {
            ...currentStayTracking,
            evaluationPeriod: {
                ...currentStayTracking.evaluationPeriod,
                ...updateDto.evaluationPeriod
            },
            stayDefinition: {
                ...currentStayTracking.stayDefinition,
                ...updateDto.stayDefinition
            },
            pointsPerStay: updateDto.pointsPerStay
                ? this.transformPointsPerStay(updateDto.pointsPerStay)
                : currentStayTracking.pointsPerStay
        };

        const updatedProgram = {
            ...client.loyaltyProgram,
            stayTracking: updatedStayTracking
        };

        client.loyaltyProgram = updatedProgram as LoyaltyProgram;
        return client.save();
    }

    async addBonusDay(clientId: string, bonusDay: BonusDayDto) {
        const client = await this.clientModel.findById(clientId);
        if (!client) throw new NotFoundException('Client not found');

        const bonusDayWithDate = {
            ...bonusDay,
            date: new Date(bonusDay.date)
        };

        if (!client.loyaltyProgram.pointsSystem.earningPoints.bonusDays) {
            client.loyaltyProgram.pointsSystem.earningPoints.bonusDays = [];
        }

        client.loyaltyProgram.pointsSystem.earningPoints.bonusDays.push(bonusDayWithDate);
        return client.save();
    }

    async disableLoyaltyProgram(clientId: string): Promise<Client> {
        const client = await this.clientModel.findById(clientId)
            .select('+apiKey')
            .exec();

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        client.loyaltyProgram = {} as LoyaltyProgram;
        return client.save();
    }

    async removeBonusDay(clientId: string, bonusDayId: string) {
        const client = await this.clientModel.findById(clientId);
        if (!client) throw new NotFoundException('Client not found');

        client.loyaltyProgram.pointsSystem.earningPoints.bonusDays =
            client.loyaltyProgram.pointsSystem.earningPoints.bonusDays.filter(
                day => day.name !== bonusDayId
            );

        return client.save();
    }
}