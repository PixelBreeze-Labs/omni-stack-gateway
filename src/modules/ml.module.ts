// src/ml.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MLRegistry, MLRegistrySchema } from '../schemas/ai/ml-registry.schema';
import { PredictionLog, PredictionLogSchema } from '../schemas/ai/prediction-log.schema';
import { InsightCollection, InsightCollectionSchema } from '../schemas/ai/insight-collection.schema';
import { FeatureCollection, FeatureCollectionSchema } from '../schemas/ai/feature-collection.schema';
import { MLRegistryRepository } from '../repositories/ai/ml-registry.repository';
import { PredictionLogRepository } from '../repositories/ai/prediction-log.repository';
import { InsightCollectionRepository } from '../repositories/ai/insight-collection.repository';
import { FeatureCollectionRepository } from '../repositories/ai/feature-collection.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MLRegistry.name, schema: MLRegistrySchema },
      { name: PredictionLog.name, schema: PredictionLogSchema },
      { name: InsightCollection.name, schema: InsightCollectionSchema },
      { name: FeatureCollection.name, schema: FeatureCollectionSchema },
    ]),
  ],
  providers: [
    MLRegistryRepository,
    PredictionLogRepository,
    InsightCollectionRepository,
    FeatureCollectionRepository,
  ],
  exports: [
    MLRegistryRepository,
    PredictionLogRepository,
    InsightCollectionRepository,
    FeatureCollectionRepository,
  ],
})
export class MLModule {}