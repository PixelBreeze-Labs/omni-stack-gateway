import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class BonusDay {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    date: Date;

    @Prop({ default: 2 })
    multiplier: number;
}
export const BonusDaySchema = SchemaFactory.createForClass(BonusDay);

@Schema({ _id: false })
export class EarningPoints {
    @Prop({ default: 1 })
    spend: number;

    @Prop({ type: [BonusDaySchema], default: [] })
    bonusDays: BonusDay[];

    @Prop({ default: 50 })
    signUpBonus: number;

    @Prop({ default: 10 })
    reviewPoints: number;

    @Prop({ default: 5 })
    socialSharePoints: number;
}
export const EarningPointsSchema = SchemaFactory.createForClass(EarningPoints);

@Schema({ _id: false })
export class RedeemingPoints {
    @Prop({ default: 100 })
    pointsPerDiscount: number;

    @Prop({ default: 5 })
    discountValue: number;

    @Prop({ enum: ['fixed', 'percentage'], default: 'fixed' })
    discountType: string;

    @Prop({ type: [String], default: [] })
    exclusiveRewards: string[];
}
export const RedeemingPointsSchema = SchemaFactory.createForClass(RedeemingPoints);

@Schema({ _id: false })
export class MembershipTier {
    @Prop({ required: true })
    name: string;

    // Specify the type for spendRange explicitly:
    @Prop({ required: true, type: { min: Number, max: Number } })
    spendRange: { min: number; max: number };

    @Prop({ required: true })
    pointsMultiplier: number;

    @Prop({ required: true })
    birthdayReward: number;

    @Prop({ type: [String], default: [] })
    perks: string[];

    @Prop({ required: true })
    referralPoints: number;
}
export const MembershipTierSchema = SchemaFactory.createForClass(MembershipTier);

@Schema({ _id: false })
export class PointsSystem {
    @Prop({ type: EarningPointsSchema, default: () => ({}) })
    earningPoints: EarningPoints;

    @Prop({ type: RedeemingPointsSchema, default: () => ({}) })
    redeemingPoints: RedeemingPoints;
}
export const PointsSystemSchema = SchemaFactory.createForClass(PointsSystem);

// New schemas for accommodation-specific features
@Schema({ _id: false })
export class StayDefinition {
    @Prop({ default: 1 })
    minimumNights: number;

    @Prop({ default: true })
    checkoutRequired: boolean;
}
export const StayDefinitionSchema = SchemaFactory.createForClass(StayDefinition);

@Schema({ _id: false })
export class EvaluationPeriod {
    @Prop({ default: 12 })
    upgrade: number;

    @Prop({ default: 6 })
    downgrade: number;
}
export const EvaluationPeriodSchema = SchemaFactory.createForClass(EvaluationPeriod);

@Schema({ _id: false })
export class StayTracking {
    @Prop({ type: EvaluationPeriodSchema, default: () => ({}) })
    evaluationPeriod: EvaluationPeriod;

    @Prop({ type: Map, of: Number, default: () => new Map() })
    pointsPerStay: Map<string, number>;

    @Prop({ type: StayDefinitionSchema, default: () => ({}) })
    stayDefinition: StayDefinition;
}
export const StayTrackingSchema = SchemaFactory.createForClass(StayTracking);

@Schema({ _id: false })
export class LoyaltyProgram {
    @Prop({ default: '' })
    programName: string;

    @Prop({ default: 'EUR' })
    currency: string;

    @Prop({ type: PointsSystemSchema, default: () => ({}) })
    pointsSystem: PointsSystem;

    @Prop({ type: [MembershipTierSchema], default: [] })
    membershipTiers: MembershipTier[];

    // Add accommodation-specific fields
    @Prop({ type: StayTrackingSchema, default: () => ({}) })
    stayTracking: StayTracking;
}
export const LoyaltyProgramSchema = SchemaFactory.createForClass(LoyaltyProgram);