import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeDocument } from '../schemas/knowledge-document.schema';
import { UnrecognizedQuery } from '../schemas/unrecognized-query.schema';
import { QueryResponsePair } from '../schemas/query-response-pair.schema';
import * as natural from 'natural';
import { Business } from '../schemas/business.schema';
import { ChatbotMessage } from '../schemas/chatbot-message.schema';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private tokenizer: natural.WordTokenizer;
  private stemmer: any;
  
  constructor(
    @InjectModel(KnowledgeDocument.name) private knowledgeDocumentModel: Model<KnowledgeDocument>,
    @InjectModel(UnrecognizedQuery.name) private unrecognizedQueryModel: Model<UnrecognizedQuery>,
    @InjectModel(QueryResponsePair.name) private queryResponsePairModel: Model<QueryResponsePair>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(ChatbotMessage.name) private chatbotMessageModel: Model<ChatbotMessage>
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
      clientId?: string;
    } = {}
  ): Promise<QueryResponsePair[]> {
    const { category, limit = 3, clientId } = options;
    
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
 * Log an unrecognized query with businessId or clientId support
 */
async logUnrecognizedQuery(
    message: string,
    options: {
      clientId?: string;
      businessId?: string;
      businessType?: string;
      userId?: string;
      sessionId?: string;
      context?: Record<string, any>;
    } = {}
  ): Promise<UnrecognizedQuery> {
    const { clientId: directClientId, businessId, businessType, userId, sessionId, context } = options;
    
    // Determine clientId from businessId if not directly provided
    let clientId = directClientId;
    
    if (!clientId && businessId) {
      try {
        // Look up the business to get its clientId
        const business = await this.businessModel.findById(businessId).select('clientId').lean();
        if (business) {
          clientId = business.clientId;
          this.logger.debug(`Retrieved clientId ${clientId} from businessId ${businessId}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to retrieve clientId from businessId ${businessId}: ${error.message}`);
        // Continue with null clientId
      }
    }
    
    // Check if similar query exists
    const existingQuery = await this.unrecognizedQueryModel.findOne({
      message: { $regex: new RegExp('^' + message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
      ...(clientId ? { clientId } : {})
    });
    
    if (existingQuery) {
      // Update frequency and context
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
      clientId, // Add client ID if provided or retrieved
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

/**
 * Get a query-response pair by ID with client verification
 */
async getQueryResponsePair(
    id: string,
    clientId: string
  ): Promise<QueryResponsePair> {
    const pair = await this.queryResponsePairModel.findOne({ 
      _id: id, 
      clientId 
    });
    
    if (!pair) {
      throw new NotFoundException(`Query-response pair with ID ${id} not found or does not belong to this client`);
    }
    
    return pair;
  }
  
  /**
   * List query-response pairs with pagination and filtering
   */
  async listQueryResponsePairs(
    options: {
      clientId: string;
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
    }
  ): Promise<{
    items: QueryResponsePair[];
    total: number;
    pages: number;
    page: number;
    limit: number;
  }> {
    const {
      clientId,
      page = 1,
      limit = 10,
      category,
      search,
      sortBy = 'createdAt',
      sortDirection = 'desc'
    } = options;
    
    const skip = (page - 1) * limit;
    
    // Build query filter
    const filter: any = {
      clientId,
      active: true
    };
    
    // Add category filter if provided
    if (category) {
      filter.category = category;
    }
    
    // Add search filter if provided
    if (search) {
      filter.$or = [
        { query: { $regex: search, $options: 'i' } },
        { response: { $regex: search, $options: 'i' } },
        { keywords: { $in: [search] } }
      ];
    }
    
    // Determine sort order
    const sort: any = {};
    sort[sortBy] = sortDirection === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await this.queryResponsePairModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Get paginated results
    const pairs = await this.queryResponsePairModel
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .exec();
    
    return {
      items: pairs,
      total,
      pages: totalPages,
      page,
      limit
    };
  }
  
  /**
   * Update a query-response pair with client verification
   */
  async updateQueryResponsePair(
    id: string,
    clientId: string,
    updates: {
      query?: string;
      response?: string;
      category?: string;
      keywords?: string[];
      active?: boolean;
    }
  ): Promise<QueryResponsePair> {
    // First verify ownership
    const existing = await this.queryResponsePairModel.findOne({ _id: id, clientId });
    
    if (!existing) {
      throw new NotFoundException(`Query-response pair with ID ${id} not found or does not belong to this client`);
    }
    
    // Extract keywords from query if not provided but query is updated
    if (updates.query && (!updates.keywords || updates.keywords.length === 0)) {
      updates.keywords = this.extractKeywords(updates.query);
    }
    
    // Update the pair
    const updated = await this.queryResponsePairModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );
    
    return updated;
  }
  


  /**
 * Get comprehensive feedback statistics including chatbot message feedback
 */
async getResponseStatistics(
    clientId: string,
    timeframe: 'day' | 'week' | 'month' | 'year' = 'month'
  ): Promise<{
    totalResponses: number;
    helpfulResponses: number;
    unhelpfulResponses: number;
    helpfulPercentage: number;
    responsesByCategory: { category: string; count: number; helpfulCount: number; unhelpfulCount: number; helpfulPercentage: number }[];
    topPerformingResponses: { id: string; query: string; successRate: number; useCount: number; category?: string }[];
    totalDocuments: number;
    totalQueryResponses: number;
    totalUnrecognizedQueries: number;
    overallSuccessRate: number;
    recentUnrecognizedQueries: { _id: string; query: string; createdAt: Date; frequency: number }[];
    feedbackBreakdown: {
      totalFeedback: number;
      helpfulCount: number;
      unhelpfulCount: number;
      byTimeframe: Array<{ date: string; helpful: number; unhelpful: number }>;
    };
  }> {
    // Determine date range based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    switch (timeframe) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }
  
    // Get all active query-response pairs for this client within timeframe
    const pairs = await this.queryResponsePairModel.find({
      clientId,
      active: true,
      updatedAt: { $gte: startDate }
    }).exec();
  
    // Get feedback from chatbot messages
    // You'll need to inject the ChatbotMessage model
    const messagesWithFeedback = await this.chatbotMessageModel.find({
      clientId,
      sender: 'bot',
      'metadata.feedback': { $exists: true },
      createdAt: { $gte: startDate }
    }).exec();
  
    // Aggregate feedback data
    let totalFeedback = messagesWithFeedback.length;
    let helpfulCount = 0;
    let unhelpfulCount = 0;
    const dailyFeedback = new Map();
  
    messagesWithFeedback.forEach(message => {
      const feedback = message.metadata.feedback;
      if (feedback.wasHelpful) {
        helpfulCount++;
      } else {
        unhelpfulCount++;
      }
  
      // Group by day
      const day = new Date(feedback.timestamp).toISOString().split('T')[0];
      if (!dailyFeedback.has(day)) {
        dailyFeedback.set(day, { helpful: 0, unhelpful: 0 });
      }
      if (feedback.wasHelpful) {
        dailyFeedback.get(day).helpful++;
      } else {
        dailyFeedback.get(day).unhelpful++;
      }
    });
  
    // Calculate statistics
    const totalResponses = pairs.length;
    const helpfulResponses = pairs.filter(p => p.successRate >= 50).length;
    const helpfulPercentage = totalResponses > 0 ? (helpfulResponses / totalResponses) * 100 : 0;
  
    // Get responses by category
    const categoryMap = new Map<string, { count: number; helpfulCount: number; unhelpfulCount: number }>();
    
    pairs.forEach(pair => {
      const category = pair.category || 'general';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { count: 0, helpfulCount: 0, unhelpfulCount: 0 });
      }
      
      const data = categoryMap.get(category);
      data.count += 1;
      
      if (pair.successRate >= 50) {
        data.helpfulCount += 1;
      } else {
        data.unhelpfulCount += 1;
      }
    });
  
    const responsesByCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      helpfulCount: data.helpfulCount,
      unhelpfulCount: data.unhelpfulCount,
      helpfulPercentage: data.count > 0 ? (data.helpfulCount / data.count) * 100 : 0
    }));
  
    // Get top performing responses
    const topPerformingResponses = [...pairs]
      .filter(pair => pair.useCount > 0)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5)
      .map(pair => ({
        id: pair._id.toString(),
        query: pair.query,
        successRate: pair.successRate,
        useCount: pair.useCount,
        category: pair.category
      }));
  
    // Get document counts
    const totalDocuments = await this.knowledgeDocumentModel.countDocuments({ clientId, active: true });
    const totalQueryResponses = await this.queryResponsePairModel.countDocuments({ clientId, active: true });
    
    // Get unrecognized queries
    const unrecognizedQueries = await this.unrecognizedQueryModel
  .find({ clientId, status: 'pending' })
  .sort({ frequency: -1, createdAt: -1 })
  .limit(5)
  .lean() // Use lean() for better performance and cleaner typing
  .exec();
  
  const totalUnrecognizedQueries = await this.unrecognizedQueryModel.countDocuments({ 
    clientId, 
    status: 'pending' 
  });
  
  
    // Calculate overall success rate
    const overallSuccessRate = pairs.length > 0 
      ? pairs.reduce((sum, pair) => sum + pair.successRate, 0) / pairs.length 
      : 0;
  
    // Format daily feedback for frontend
    const byTimeframe = Array.from(dailyFeedback.entries()).map(([date, counts]) => ({
      date,
      helpful: counts.helpful,
      unhelpful: counts.unhelpful
    })).sort((a, b) => a.date.localeCompare(b.date));
  
    return {
        totalResponses,
        helpfulResponses,
        unhelpfulResponses: pairs.filter(p => p.successRate < 50).length,
        helpfulPercentage,
        responsesByCategory,
        topPerformingResponses,
        totalDocuments,
        totalQueryResponses,
        totalUnrecognizedQueries,
        overallSuccessRate,
        recentUnrecognizedQueries: unrecognizedQueries.map(q => ({
          _id: q._id.toString(),
          query: q.message,
          createdAt: (q as any).createdAt,
          frequency: q.frequency
        })),
        feedbackBreakdown: {
          totalFeedback,
          helpfulCount,
          unhelpfulCount,
          byTimeframe
        }
      };
  }
}