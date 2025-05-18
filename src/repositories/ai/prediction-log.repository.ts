// src/repositories/ai/prediction-log.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PredictionLog } from '../../schemas/ai/prediction-log.schema';
import { CreatePredictionLogDto, UpdatePredictionLogDto } from '../../dtos/ai/prediction-log.dto';

@Injectable()
export class PredictionLogRepository {
  constructor(
    @InjectModel(PredictionLog.name) private predictionLogModel: Model<PredictionLog>
  ) {}

  async create(createDto: CreatePredictionLogDto): Promise<PredictionLog> {
    const newPrediction = new this.predictionLogModel(createDto);
    return newPrediction.save();
  }

  async findAll(filters: any = {}): Promise<PredictionLog[]> {
    return this.predictionLogModel.find(filters).exec();
  }

  async findById(id: string): Promise<PredictionLog> {
    return this.predictionLogModel.findById(id).exec();
  }

  async findByEntityId(entityId: string, entityType: string): Promise<PredictionLog[]> {
    return this.predictionLogModel.find({ entityId, entityType }).exec();
  }

  async findByBusinessId(businessId: string, limit: number = 100): Promise<PredictionLog[]> {
    return this.predictionLogModel
      .find({ businessId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async update(id: string, updateDto: UpdatePredictionLogDto): Promise<PredictionLog> {
    return this.predictionLogModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<PredictionLog> {
    return this.predictionLogModel.findByIdAndDelete(id).exec();
  }

  async provideFeedback(id: string, isCorrect: boolean, actualOutcome?: Record<string, any>): Promise<PredictionLog> {
    return this.predictionLogModel.findByIdAndUpdate(
      id,
      {
        feedbackProvided: true,
        feedbackCorrect: isCorrect,
        ...(actualOutcome && { actualOutcome })
      },
      { new: true }
    ).exec();
  }

  async getModelAccuracy(modelId: string): Promise<{ total: number, correct: number, accuracy: number }> {
    const logs = await this.predictionLogModel.find({
      modelId,
      feedbackProvided: true
    }).exec();

    const total = logs.length;
    const correct = logs.filter(log => log.feedbackCorrect).length;
    const accuracy = total > 0 ? correct / total : 0;

    return { total, correct, accuracy };
  }
}