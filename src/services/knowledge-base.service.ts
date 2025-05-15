// src/services/knowledge-base.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeDocument } from '../schemas/knowledge-document.schema';
import { UnrecognizedQuery } from '../schemas/unrecognized-query.schema';
import { QueryResponsePair } from '../schemas/query-response-pair.schema';
import * as natural from 'natural';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private tokenizer: natural.WordTokenizer;
  private stemmer: any;
  
  constructor(
    @InjectModel(KnowledgeDocument.name) private knowledgeDocumentModel: Model<KnowledgeDocument>,
    @InjectModel(UnrecognizedQuery.name) private unrecognizedQueryModel: Model<UnrecognizedQuery>,
    @InjectModel(QueryResponsePair.name) private queryResponsePairModel: Model<QueryResponsePair>
  ) {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
  }

  /**
   * Create a new knowledge document
   */
  async createDocument(document: {
    title: string;
    content: string;
    keywords: string[];
    type: string;
    categories: string[];
    applicableBusinessTypes: string[];
    applicableFeatures: string[];
    createdBy: string;
  }): Promise<KnowledgeDocument> {
    // Automatically extract keywords if not provided
    if (!document.keywords || document.keywords.length === 0) {
      document.keywords = this.extractKeywords(document.content);
    }
    
    const newDocument = new this.knowledgeDocumentModel(document);
    return newDocument.save();
  }

  /**
   * Update an existing knowledge document
   */
  async updateDocument(
    id: string,
    updates: Partial<KnowledgeDocument>
  ): Promise<KnowledgeDocument> {
    // Re-extract keywords if content was updated
    if (updates.content && (!updates.keywords || updates.keywords.length === 0)) {
      updates.keywords = this.extractKeywords(updates.content);
    }
    
    const document = await this.knowledgeDocumentModel.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    ).exec();

    if (!document) {
      throw new NotFoundException(`Knowledge document with ID ${id} not found`);
    }

    return document;
  }

  /**
   * Delete a knowledge document
   */
  async deleteDocument(id: string): Promise<boolean> {
    const result = await this.knowledgeDocumentModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  /**
   * Search knowledge documents by query and context
   */
  async searchDocuments(
    query: string,
    options: {
      businessType?: string;
      features?: string[];
      categories?: string[];
      currentView?: string;
      limit?: number;
    } = {}
  ): Promise<KnowledgeDocument[]> {
    const { 
      businessType = 'default',
      features = [], 
      categories = [], 
      currentView,
      limit = 5
    } = options;

    // Map view to category if needed
    if (currentView && categories.length === 0) {
      const categoryMap = {
        'projects': 'project_management',
        'tasks': 'task_management',
        'team': 'team_management',
        'time': 'time_tracking',
        'clients': 'client_management',
        'reports': 'reporting',
        // Add more mappings as needed
      };
      
      if (categoryMap[currentView]) {
        categories.push(categoryMap[currentView]);
      }
    }
    
    // Build the query filter
    const filter: any = {
      active: true,
      $or: [
        { applicableBusinessTypes: 'all' },
        { applicableBusinessTypes: businessType },
        { applicableBusinessTypes: { $size: 0 } } // Empty array means applicable to all
      ]
    };
    
    // Add feature filter if we have enabled features
    if (features.length > 0) {
      filter.$or.push(
        { applicableFeatures: 'all' },
        { applicableFeatures: { $in: features } },
        { applicableFeatures: { $size: 0 } } // Empty array means applicable to all
      );
    }
    
    // Add category filter if we have categories
    if (categories.length > 0) {
      filter.$or.push(
        { categories: { $in: categories } }
      );
    }
    
    // Extract keywords from the query
    const queryKeywords = this.extractKeywords(query);
    
    // Create the search filter for keywords and content
    const searchFilter = {
      $or: [
        { $text: { $search: query } }, // Full-text search
        { keywords: { $in: queryKeywords } } // Keyword match
      ]
    };
    
    // Combine filters
    const finalFilter = { ...filter, ...searchFilter };
    
    // Perform search with text score sorting
    const documents = await this.knowledgeDocumentModel
      .find(finalFilter)
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .exec();
    
    // Update use count for found documents
    if (documents.length > 0) {
      await this.knowledgeDocumentModel.updateMany(
        { _id: { $in: documents.map(d => d._id) } },
        { $inc: { useCount: 1 } }
      );
    }
    
    return documents;
  }
  
  /**
   * Search query-response pairs for matches
   */
  async searchQueryResponses(
    query: string,
    options: {
      category?: string;
      limit?: number;
    } = {}
  ): Promise<QueryResponsePair[]> {
    const { category, limit = 3 } = options;
    
    // Extract keywords from the query
    const queryKeywords = this.extractKeywords(query);
    
    // Build the search filter
    const filter: any = {
      active: true,
      $or: [
        { $text: { $search: query } }, // Full-text search
        { keywords: { $in: queryKeywords } } // Keyword match
      ]
    };
    
    // Add category filter if provided
    if (category) {
      filter.category = category;
    }
    
    // Execute search
    const pairs = await this.queryResponsePairModel
      .find(filter)
      .sort({ score: { $meta: 'textScore' }, useCount: -1, successRate: -1 })
      .limit(limit)
      .exec();
    
    // Update use count for results
    if (pairs.length > 0) {
      await this.queryResponsePairModel.updateMany(
        { _id: { $in: pairs.map(p => p._id) } },
        { $inc: { useCount: 1 } }
      );
    }
    
    return pairs;
  }
  
  /**
   * Log an unrecognized query
   */
  async logUnrecognizedQuery(
    message: string,
    options: {
      businessType?: string;
      userId?: string;
      sessionId?: string;
      context?: Record<string, any>;
    } = {}
  ): Promise<UnrecognizedQuery> {
    const { businessType, userId, sessionId, context } = options;
    
    // Check if similar query exists
    const existingQuery = await this.unrecognizedQueryModel.findOne({
      message: { $regex: new RegExp('^' + message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
    });
    
    if (existingQuery) {
      // Update frequency and context
      return this.unrecognizedQueryModel.findByIdAndUpdate(
        existingQuery._id,
        { 
          $inc: { frequency: 1 },
          ...(context ? { context: { ...existingQuery.context, ...context } } : {})
        },
        { new: true }
      );
    }
    
    // Create new unrecognized query
    const newQuery = new this.unrecognizedQueryModel({
      message,
      businessType,
      userId,
      sessionId,
      context,
      status: 'pending'
    });
    
    return newQuery.save();
  }
  
  /**
   * Respond to an unrecognized query
   */
  async respondToUnrecognizedQuery(
    id: string,
    response: string,
    adminId: string,
    createKnowledgeDoc: boolean = false,
    knowledgeDocData?: Partial<KnowledgeDocument>
  ): Promise<UnrecognizedQuery> {
    const query = await this.unrecognizedQueryModel.findById(id);
    
    if (!query) {
      throw new NotFoundException(`Unrecognized query with ID ${id} not found`);
    }
    
    // Create knowledge document if requested
    let knowledgeDocId = null;
    
    if (createKnowledgeDoc && knowledgeDocData) {
      const knowledgeDoc = await this.createDocument({
        title: knowledgeDocData.title || `Response to: ${query.message.substring(0, 50)}`,
        content: response,
        keywords: knowledgeDocData.keywords || this.extractKeywords(query.message),
        type: knowledgeDocData.type || 'faq',
        categories: knowledgeDocData.categories || [],
        applicableBusinessTypes: knowledgeDocData.applicableBusinessTypes || [],
        applicableFeatures: knowledgeDocData.applicableFeatures || [],
        createdBy: adminId
      });
      
      knowledgeDocId = knowledgeDoc._id;
    }
    
    // Create query-response pair for learning
    await this.createQueryResponsePair({
      query: query.message,
      response,
      category: query.context?.currentView || 'general',
      keywords: this.extractKeywords(query.message)
    });
    
    // Update the unrecognized query
    return this.unrecognizedQueryModel.findByIdAndUpdate(
      id,
      {
        response,
        status: 'answered',
        resolved: true,
        answeredBy: adminId,
        answeredAt: new Date(),
        knowledgeDocumentId: knowledgeDocId
      },
      { new: true }
    );
  }
  
  /**
   * Create a query-response pair for learning
   */
  async createQueryResponsePair(pair: {
    query: string;
    response: string;
    category?: string;
    keywords?: string[];
  }): Promise<QueryResponsePair> {
    // Extract keywords if not provided
    if (!pair.keywords || pair.keywords.length === 0) {
      pair.keywords = this.extractKeywords(pair.query);
    }
    
    const newPair = new this.queryResponsePairModel({
      ...pair,
      active: true,
      useCount: 0,
      successRate: 0
    });
    
    return newPair.save();
  }
  
  /**
   * Update success rate for a response
   */
  async updateResponseSuccess(
    id: string,
    wasSuccessful: boolean
  ): Promise<QueryResponsePair> {
    const pair = await this.queryResponsePairModel.findById(id);
    
    if (!pair) {
      throw new NotFoundException(`Query-response pair with ID ${id} not found`);
    }
    
    // Calculate new success rate
    const totalUses = pair.useCount;
    const currentSuccessCount = Math.round(pair.successRate * totalUses / 100);
    const newSuccessCount = wasSuccessful ? currentSuccessCount + 1 : currentSuccessCount;
    const newSuccessRate = totalUses > 0 ? (newSuccessCount / (totalUses + 1)) * 100 : 0;
    
    return this.queryResponsePairModel.findByIdAndUpdate(
      id,
      { successRate: newSuccessRate },
      { new: true }
    );
  }
  
  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common words and punctuation
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 
      'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 
      'can', 'will', 'just', 'should', 'now', 'about', 'what', 'which'
    ]);
    
    // Tokenize and filter
    const tokens = this.tokenizer.tokenize(text.toLowerCase()) || [];
    const filteredTokens = tokens
      .filter(token => token.length > 2 && !stopWords.has(token))
      .map(token => this.stemmer.stem(token));
    
    // Remove duplicates
    return [...new Set(filteredTokens)];
  }
  
  /**
   * Get pending unrecognized queries
   */
  async getPendingQueries(
    options: {
      limit?: number;
      page?: number;
      businessType?: string;
    } = {}
  ): Promise<{
    queries: UnrecognizedQuery[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { limit = 20, page = 1, businessType } = options;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter: any = { status: 'pending' };
    
    if (businessType) {
      filter.businessType = businessType;
    }
    
    // Get total count
    const total = await this.unrecognizedQueryModel.countDocuments(filter);
    
    // Get queries sorted by frequency
    const queries = await this.unrecognizedQueryModel
      .find(filter)
      .sort({ frequency: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    
    return {
      queries,
      total,
      page,
      limit
    };
  }
}