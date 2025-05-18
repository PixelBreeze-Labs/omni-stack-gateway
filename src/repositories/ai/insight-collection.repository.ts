// src/repositories/ai/insight-collection.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InsightCollection } from '../../schemas/ai/insight-collection.schema';
import { CreateInsightCollectionDto, UpdateInsightCollectionDto } from '../../dtos/ai/insight-collection.dto';

@Injectable()
export class InsightCollectionRepository {
  constructor(
    @InjectModel(InsightCollection.name) private insightCollectionModel: Model<InsightCollection>
  ) {}

  async create(createDto: CreateInsightCollectionDto): Promise<InsightCollection> {
    const newInsight = new this.insightCollectionModel(createDto);
    return newInsight.save();
  }

  async findAll(filters: any = {}): Promise<InsightCollection[]> {
    return this.insightCollectionModel.find(filters).exec();
  }

  async findById(id: string): Promise<InsightCollection> {
    return this.insightCollectionModel.findById(id).exec();
  }

  async findByEntityId(entityId: string, entityType: string): Promise<InsightCollection[]> {
    return this.insightCollectionModel.find({ entityId, entityType }).exec();
  }

  async findLatestByEntityId(entityId: string, entityType: string, insightType: string): Promise<InsightCollection> {
    return this.insightCollectionModel
      .findOne({ entityId, entityType, insightType })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBusinessId(businessId: string, limit: number = 100): Promise<InsightCollection[]> {
    return this.insightCollectionModel
      .find({ businessId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findActiveInsights(entityType: string, businessId?: string): Promise<InsightCollection[]> {
    const now = new Date();
    
    const query: any = { 
      entityType,
      validFrom: { $lte: now },
      $or: [
        { validTo: { $gt: now } },
        { validTo: null }
      ]
    };
    
    if (businessId) {
      query.businessId = businessId;
    }
    
    return this.insightCollectionModel.find(query).exec();
  }

  async update(id: string, updateDto: UpdateInsightCollectionDto): Promise<InsightCollection> {
    return this.insightCollectionModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<InsightCollection> {
    return this.insightCollectionModel.findByIdAndDelete(id).exec();
  }

  async invalidateInsights(entityId: string, entityType: string, insightType?: string): Promise<number> {
    const now = new Date();
    
    const query: any = { 
      entityId, 
      entityType,
      validTo: null
    };
    
    if (insightType) {
      query.insightType = insightType;
    }
    
    const result = await this.insightCollectionModel.updateMany(
      query,
      { validTo: now }
    ).exec();
    
    return result.modifiedCount;
  }
}