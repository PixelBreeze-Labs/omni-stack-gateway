import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
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
   * Create a new knowledge document with client ID
   */
  async createDocument(document: {
    title: string;
    content: string;
    keywords?: string[];
    type: string;
    categories: string[];
    applicableBusinessTypes: string[];
    applicableFeatures: string[];
    createdBy: string;
    clientId: string; // Add client ID
  }): Promise<KnowledgeDocument> {
    // Automatically extract keywords if not provided
    if (!document.keywords || document.keywords.length === 0) {
      document.keywords = this.extractKeywords(document.content);
    }
    
    const newDocument = new this.knowledgeDocumentModel(document);
    return newDocument.save();
  }

  /**
   * Update an existing knowledge document with client ID check
   */
  async updateDocument(
    id: string,
    clientId: string,
    updates: Partial<KnowledgeDocument>
  ): Promise<KnowledgeDocument> {
    // First verify the document belongs to the client
    const existingDoc = await this.knowledgeDocumentModel.findOne({ _id: id, clientId });
    if (!existingDoc) {
      throw new NotFoundException(`Knowledge document with ID ${id} not found or does not belong to this client`);
    }
    
    // Re-extract keywords if content was updated
    if (updates.content && (!updates.keywords || updates.keywords.length === 0)) {
      updates.keywords = this.extractKeywords(updates.content);
    }
    
    const document = await this.knowledgeDocumentModel.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    ).exec();

    return document;
  }

  /**
   * Delete a knowledge document with client ID check
   */
  async deleteDocument(id: string, clientId: string): Promise<boolean> {
    // First verify the document belongs to the client
    const existingDoc = await this.knowledgeDocumentModel.findOne({ _id: id, clientId });
    if (!existingDoc) {
      throw new NotFoundException(`Knowledge document with ID ${id} not found or does not belong to this client`);
    }
    
    const result = await this.knowledgeDocumentModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  /**
   * Search knowledge documents by query and context with client ID filter
   */
  async searchDocuments(
    query: string,
    options: {
      clientId?: string;
      businessType?: string;
      features?: string[];
      categories?: string[];
      currentView?: string;
      limit?: number;
    } = {}
  ): Promise<KnowledgeDocument[]> {
    const { 
      clientId,
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
    
    // Build the query filter with client ID
    const filter: any = {
      active: true,
      $or: [
        { applicableBusinessTypes: 'all' },
        { applicableBusinessTypes: businessType },
        { applicableBusinessTypes: { $size: 0 } } // Empty array means applicable to all
      ]
    };
    
    // Add client ID filter if provided
    if (clientId) {
      filter.clientId = clientId;
    }
    
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
   * Get a single knowledge document by ID with client check
   */
  async findOne(id: string, clientId: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentModel.findOne({ _id: id, clientId });
    
    if (!document) {
      throw new NotFoundException(`Knowledge document with ID ${id} not found or does not belong to this client`);
    }
    
    return document;
  }
  
  /**
   * Get all knowledge documents for a client with pagination
   */
  async findAll(options: {
    clientId: string;
    limit?: number;
    page?: number;
    search?: string;
    categories?: string[];
    type?: string;
  }): Promise<{
    items: KnowledgeDocument[];
    total: number;
    pages: number;
    page: number;
    limit: number;
  }> {
    const {
      clientId,
      limit = 10,
      page = 1,
      search,
      categories = [],
      type
    } = options;
    
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter: any = { clientId, active: true };
    
    // Add search if provided
    if (search) {
      filter.$text = { $search: search };
    }
    
    // Add categories filter if provided
    if (categories.length > 0) {
      filter.categories = { $in: categories };
    }
    
    // Add type filter if provided
    if (type) {
      filter.type = type;
    }
    
    // Get total count
    const total = await this.knowledgeDocumentModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Get documents
    const documents = await this.knowledgeDocumentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    
    return {
      items: documents,
      total,
      pages: totalPages,
      page,
      limit
    };
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
      clientId?: string;
      businessType?: string;
      userId?: string;
      sessionId?: string;
      context?: Record<string, any>;
    } = {}
  ): Promise<UnrecognizedQuery> {
    const { clientId, businessType, userId, sessionId, context } = options;
    
    // Check if similar query exists
    const existingQuery = await this.unrecognizedQueryModel.findOne({
      message: { $regex: new RegExp('^' + message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
      ...(clientId ? { clientId } : {})
    });
    
    if (existingQuery) {
      // Update frequency and context
      // Use findByIdAndUpdate instead of updateOne to return the updated document
      return this.unrecognizedQueryModel.findByIdAndUpdate(
        existingQuery._id,
        { 
          $inc: { frequency: 1 },
          ...(context ? { $set: { context: { ...existingQuery.context, ...context } } } : {})
        },
        { new: true } // Return the updated document
      );
    }
    
    // Create new unrecognized query with clientId
    const newQuery = new this.unrecognizedQueryModel({
      message,
      clientId, // Add client ID if provided
      businessType,
      userId,
      sessionId,
      context,
      status: 'pending'
    });
    
    return newQuery.save();
  }
  
  /**
   * Respond to an unrecognized query with client ID check
   */
  async respondToUnrecognizedQuery(
    id: string,
    response: string,
    adminId: string,
    clientId: string,
    createKnowledgeDoc: boolean = false,
    knowledgeDocData?: Partial<KnowledgeDocument>
  ): Promise<UnrecognizedQuery> {
    // Find the query and check client ID if provided
    const findFilter: any = { _id: id };
    if (clientId) {
      findFilter.clientId = clientId;
    }
    
    const query = await this.unrecognizedQueryModel.findOne(findFilter);
    
    if (!query) {
      throw new NotFoundException(`Unrecognized query with ID ${id} not found or does not belong to this client`);
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
        createdBy: adminId,
        clientId: clientId // Include client ID
      });
      
      knowledgeDocId = knowledgeDoc._id;
    }
    
    // Create query-response pair for learning
    await this.createQueryResponsePair({
      query: query.message,
      response,
      category: query.context?.currentView || 'general',
      keywords: this.extractKeywords(query.message),
      clientId // Include client ID
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
   * Create a query-response pair for learning with client ID
   */
  async createQueryResponsePair(pair: {
    query: string;
    response: string;
    category?: string;
    keywords?: string[];
    clientId?: string;
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
   * Update success rate for a response with client ID check
   */
  async updateResponseSuccess(
    id: string,
    wasSuccessful: boolean,
    clientId?: string
  ): Promise<QueryResponsePair> {
    // Find the pair and check client ID if provided
    const findFilter: any = { _id: id };
    if (clientId) {
      findFilter.clientId = clientId;
    }
    
    const pair = await this.queryResponsePairModel.findOne(findFilter);
    
    if (!pair) {
      throw new NotFoundException(`Query-response pair with ID ${id} not found or does not belong to this client`);
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
   * Get pending unrecognized queries with client ID filter
   */
  async getPendingQueries(
    options: {
      clientId?: string;
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
    const { clientId, limit = 20, page = 1, businessType } = options;
    const skip = (page - 1) * limit;
    
    // Build filter with client ID
    const filter: any = { status: 'pending' };
    
    if (clientId) {
      filter.clientId = clientId;
    }
    
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