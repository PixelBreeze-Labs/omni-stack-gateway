// src/repositories/ai/feature-collection.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FeatureCollection } from '../../schemas/ai/feature-collection.schema';
import { CreateFeatureCollectionDto, UpdateFeatureCollectionDto } from '../../dtos/ai/feature-collection.dto';

@Injectable()
export class FeatureCollectionRepository {
  constructor(
    @InjectModel(FeatureCollection.name) private featureCollectionModel: Model<FeatureCollection>
  ) {}

  async create(createDto: CreateFeatureCollectionDto): Promise<FeatureCollection> {
    const newFeatureSet = new this.featureCollectionModel(createDto);
    return newFeatureSet.save();
  }

  async findAll(filters: any = {}): Promise<FeatureCollection[]> {
    return this.featureCollectionModel.find(filters).exec();
  }

  async findById(id: string): Promise<FeatureCollection> {
    return this.featureCollectionModel.findById(id).exec();
  }

  async findByEntityId(entityId: string, entityType: string): Promise<FeatureCollection[]> {
    return this.featureCollectionModel.find({ entityId, entityType }).exec();
  }

  async findLatestByEntityId(
    entityId: string, 
    entityType: string, 
    featureSetName: string
  ): Promise<FeatureCollection> {
    return this.featureCollectionModel
      .findOne({ entityId, entityType, featureSetName })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findByBusinessId(businessId: string, limit: number = 100): Promise<FeatureCollection[]> {
    return this.featureCollectionModel
      .find({ businessId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();
  }

  async findValidFeatures(
    entityType: string, 
    featureSetName: string, 
    businessId?: string
  ): Promise<FeatureCollection[]> {
    const now = new Date();
    
    const query: any = { 
      entityType,
      featureSetName,
      $or: [
        { validUntil: { $gt: now } },
        { validUntil: null }
      ]
    };
    
    if (businessId) {
      query.businessId = businessId;
    }
    
    return this.featureCollectionModel.find(query).exec();
  }

  async update(id: string, updateDto: UpdateFeatureCollectionDto): Promise<FeatureCollection> {
    return this.featureCollectionModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async upsertFeatures(
    entityId: string, 
    entityType: string, 
    featureSetName: string, 
    features: Record<string, any>,
    businessId?: string
  ): Promise<FeatureCollection> {
    const now = new Date();
    
    // Invalidate existing features for this entity
    await this.featureCollectionModel.updateMany(
      { 
        entityId, 
        entityType, 
        featureSetName,
        validUntil: null
      },
      { validUntil: now }
    ).exec();
    
    // Create new feature set
    return this.create({
      featureSetName,
      entityType,
      entityId,
      features,
      businessId,
      updatedAt: now
    });
  }

  async remove(id: string): Promise<FeatureCollection> {
    return this.featureCollectionModel.findByIdAndDelete(id).exec();
  }

  async removeAllEntityFeatures(entityId: string, entityType: string): Promise<number> {
    const result = await this.featureCollectionModel.deleteMany({ 
      entityId, 
      entityType 
    }).exec();
    
    return result.deletedCount;
  }
}