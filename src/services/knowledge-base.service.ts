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
 * **COMPLETELY REWRITTEN** Enhanced document search with proper ranking and relevance scoring
 */
async searchDocuments(
  query: string,
  options: {
    clientId?: string;
    businessType?: string;
    features?: string[];
    currentView?: string;
    categories?: string[];
    limit?: number;
  } = {}
): Promise<any[]> {
  try {
    const {
      clientId,
      businessType = 'default',
      features = [],
      currentView,
      limit = 5
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    // Build base search criteria
    const baseQuery: any = {
      active: true
    };

    // Add clientId filter if provided
    if (clientId) {
      baseQuery.clientId = clientId;
    }

    this.logger.log(`🔍 Searching for: "${normalizedQuery}" with clientId: ${clientId}`);

    // **NEW APPROACH**: Multi-strategy search with proper weighting
    const searchStrategies = await Promise.all([
      this.searchByExactMatch(normalizedQuery, baseQuery),
      this.searchByKeywords(normalizedQuery, baseQuery, limit),
      this.searchByFullText(normalizedQuery, baseQuery, limit),
      this.searchByCategory(normalizedQuery, baseQuery, limit)
    ]);

    const [exactMatches, keywordResults, textResults, categoryResults] = searchStrategies;

    this.logger.log(`Search results: exact=${exactMatches.length}, keywords=${keywordResults.length}, text=${textResults.length}, category=${categoryResults.length}`);

    // **IMPROVED**: Combine and rank results with better scoring
    const combinedResults = this.combineAndRankResultsImproved(
      exactMatches,
      keywordResults,
      textResults, 
      categoryResults,
      normalizedQuery,
      limit
    );

    // Filter by business context if specified
    const filteredResults = this.filterByBusinessContext(
      combinedResults,
      businessType,
      features
    );

    this.logger.log(`Final results: ${filteredResults.length} documents for "${query}"`);
    
    // Log top result for debugging
    if (filteredResults.length > 0) {
      const topResult = filteredResults[0];
      this.logger.log(`🎯 Top result: "${topResult.title}" (score: ${topResult.searchScore?.toFixed(2)})`);
    }

    return filteredResults.slice(0, limit);

  } catch (error) {
    this.logger.error(`Error searching documents: ${error.message}`, error.stack);
    return [];
  }
}


/**
 * **COMPLETELY REWRITTEN**: Better result combination and ranking
 */
private combineAndRankResultsImproved(
  exactMatches: any[],
  keywordResults: any[],
  textResults: any[],
  categoryResults: any[],
  query: string,
  limit: number
): any[] {
  const resultsMap = new Map();

  // **PRIORITY 1**: Exact matches (highest weight)
  exactMatches.forEach(doc => {
    const id = doc._id.toString();
    resultsMap.set(id, { 
      ...doc, 
      searchScore: doc.searchScore * 2.0, // Major boost for exact matches
      searchMethods: ['exact']
    });
  });

  // **PRIORITY 2**: Keyword results (high weight)
  keywordResults.forEach(doc => {
    const id = doc._id.toString();
    const existing = resultsMap.get(id);
    if (!existing) {
      resultsMap.set(id, { 
        ...doc, 
        searchScore: doc.searchScore * 1.5, // Boost keyword matches
        searchMethods: ['keywords']
      });
    } else {
      // Combine scores for documents found by multiple methods
      existing.searchScore += doc.searchScore * 1.2;
      existing.searchMethods.push('keywords');
    }
  });

  // **PRIORITY 3**: Text results (medium weight)
  textResults.forEach(doc => {
    const id = doc._id.toString();
    const existing = resultsMap.get(id);
    if (!existing) {
      resultsMap.set(id, { 
        ...doc,
        searchMethods: ['fulltext']
      });
    } else {
      existing.searchScore += doc.searchScore * 0.8;
      existing.searchMethods.push('fulltext');
    }
  });

  // **PRIORITY 4**: Category results (lower weight)
  categoryResults.forEach(doc => {
    const id = doc._id.toString();
    const existing = resultsMap.get(id);
    if (!existing) {
      resultsMap.set(id, { 
        ...doc, 
        searchScore: doc.searchScore * 0.7,
        searchMethods: ['category']
      });
    } else {
      existing.searchScore += doc.searchScore * 0.5;
      existing.searchMethods.push('category');
    }
  });

  // Convert to array, apply final scoring, and sort
  const combinedResults = Array.from(resultsMap.values())
    .map(doc => ({
      ...doc,
      searchScore: this.applyFinalScoring(doc, query),
      searchMethod: doc.searchMethods.join(', ')
    }))
    .sort((a, b) => b.searchScore - a.searchScore);

  return combinedResults;
}

/**
 * **NEW**: Calculate exact match score
 */
private calculateExactMatchScore(doc: any, query: string): number {
  const title = (doc.title || '').toLowerCase();
  const content = (doc.content || '').toLowerCase();
  
  let score = 0;
  
  // Perfect title match
  if (title === query) {
    score += 1.0;
  } else if (title.includes(query)) {
    score += 0.8;
  }
  
  // Content relevance
  if (content.includes(query)) {
    score += 0.3;
  }
  
  return score;
}

/**
 * **NEW**: Search for exact or very close matches first
 */
private async searchByExactMatch(
  query: string,
  baseQuery: any
): Promise<any[]> {
  try {
    // Look for exact title matches or very close title matches
    const exactQuery = {
      ...baseQuery,
      $or: [
        { title: { $regex: `^${query}`, $options: 'i' } },
        { title: { $regex: query, $options: 'i' } },
        { keywords: query }
      ]
    };

    const results = await this.knowledgeDocumentModel
      .find(exactQuery)
      .lean()
      .limit(5);

    return results.map(doc => ({
      ...doc,
      searchScore: this.calculateExactMatchScore(doc, query),
      searchMethod: 'exact'
    }));

  } catch (error) {
    this.logger.error(`Error in exact match search: ${error.message}`);
    return [];
  }
}


/**
 * **IMPROVED**: Enhanced category search
 */
private async searchByCategory(
  query: string,
  baseQuery: any,
  limit: number
): Promise<any[]> {
  try {
    // **IMPROVED**: Better category mapping
    const categoryMap: { [key: string]: string[] } = {
      'what is': ['general', 'overview'],
      'about': ['general', 'overview'],
      'overview': ['general', 'overview'],
      'chat': ['communication', 'features'],
      'communication': ['communication', 'features'],
      'messaging': ['communication', 'features'],
      'message': ['communication', 'features'],
      'project': ['project_management', 'features'],
      'task': ['task_management', 'features'],
      'time': ['time_tracking', 'features'],
      'team': ['team_management', 'features'],
      'report': ['reporting', 'features'],
      'client': ['client_management', 'features'],
      'dashboard': ['features', 'general'],
      'management': ['features', 'general'],
      'features': ['features']
    };

    const queryTerms = query.split(/\s+/);
    const relevantCategories = new Set<string>();

    // Check each term and phrase
    queryTerms.forEach(term => {
      const categories = categoryMap[term.toLowerCase()];
      if (categories) {
        categories.forEach(cat => relevantCategories.add(cat));
      }
    });

    // Check full query phrases
    Object.keys(categoryMap).forEach(phrase => {
      if (query.includes(phrase)) {
        categoryMap[phrase].forEach(cat => relevantCategories.add(cat));
      }
    });

    if (relevantCategories.size === 0) {
      return [];
    }

    const categoryArray = Array.from(relevantCategories);
    const categoryQuery = {
      ...baseQuery,
      categories: { $in: categoryArray }
    };

    const results = await this.knowledgeDocumentModel
      .find(categoryQuery)
      .lean()
      .limit(limit * 2);

    return results.map(doc => ({
      ...doc,
      searchScore: this.calculateCategoryScoreImproved(doc, categoryArray, query),
      searchMethod: 'category'
    }));

  } catch (error) {
    this.logger.error(`Error in category search: ${error.message}`);
    return [];
  }
}

/**
 * **IMPROVED**: Better category scoring
 */
private calculateCategoryScoreImproved(doc: any, relevantCategories: string[], query: string): number {
  const docCategories = doc.categories || [];
  const title = (doc.title || '').toLowerCase();
  
  let score = 0;
  
  // Base category matching
  const matches = docCategories.filter(cat => relevantCategories.includes(cat));
  score += matches.length * 3;
  
  // **NEW**: Bonus for specific category-query combinations
  if (query.includes('what is') && docCategories.includes('general')) {
    score += 5;
  }
  
  if (query.includes('chat') && docCategories.includes('communication')) {
    score += 5;
  }
  
  if (query.includes('project') && docCategories.includes('project_management')) {
    score += 5;
  }
  
  // Title relevance bonus
  if (title.includes(query)) {
    score += 3;
  }
  
  return score;
}

/**
 * **NEW**: Apply final scoring adjustments
 */
private applyFinalScoring(doc: any, query: string): number {
  let finalScore = doc.searchScore || 0;
  
  const title = (doc.title || '').toLowerCase();
  const searchMethods = doc.searchMethods || [];
  
  // **BOOST**: Documents found by multiple methods
  if (searchMethods.length > 1) {
    finalScore += searchMethods.length * 0.5;
  }
  
  // **BOOST**: Recent or frequently accessed documents
  if (doc.successRate > 80) {
    finalScore += 1.0;
  }
  
  // **BOOST**: Documents with comprehensive content
  const contentLength = (doc.content || '').length;
  if (contentLength > 500 && contentLength < 3000) { // Sweet spot for content length
    finalScore += 0.5;
  }
  
  // **PENALTY**: Very long documents that might be less specific
  if (contentLength > 5000) {
    finalScore -= 0.3;
  }
  
  return Math.max(0, finalScore);
}


private async searchByKeywords(
  query: string,
  baseQuery: any,
  limit: number
): Promise<any[]> {
  try {
    // **FIXED**: Extract meaningful terms only
    const meaningfulTerms = query.split(/\s+/)
      .filter(term => term.length > 3)
      .filter(term => !['what', 'does', 'have', 'offer', 'with', 'your', 'this', 'that'].includes(term));
    
    if (meaningfulTerms.length === 0) return [];

    // **FIXED**: Search only for the important terms
    const conditions = meaningfulTerms.map(term => ({
      $or: [
        { title: { $regex: `\\b${term}`, $options: 'i' } },
        { keywords: { $regex: term, $options: 'i' } },
        { categories: { $regex: term, $options: 'i' } }
      ]
    }));

    const results = await this.knowledgeDocumentModel
      .find({
        ...baseQuery,
        $and: conditions
      })
      .lean()
      .limit(limit * 2);

    return results.map(doc => ({
      ...doc,
      searchScore: this.calculateSimpleRelevance(doc, meaningfulTerms, query),
      searchMethod: 'keywords'
    }));

  } catch (error) {
    this.logger.error(`Error in keyword search: ${error.message}`);
    return [];
  }
}

// **NEW**: Simple, working relevance calculation
private calculateSimpleRelevance(doc: any, terms: string[], fullQuery: string): number {
  const title = (doc.title || '').toLowerCase();
  const content = (doc.content || '').toLowerCase();
  const categories = (doc.categories || []).join(' ').toLowerCase();
  
  let score = 0;
  
  // Exact query in title = highest score
  if (title.includes(fullQuery.toLowerCase())) {
    score += 100;
  }
  
  // Count how many important terms are in title
  terms.forEach(term => {
    if (title.includes(term.toLowerCase())) {
      score += 20;
    }
    if (categories.includes(term.toLowerCase())) {
      score += 10;
    }
  });
  
  // Penalty for irrelevant docs
  if (fullQuery.includes('chat') && !title.includes('communication') && !title.includes('chat')) {
    score *= 0.1;
  }
  
  return score;
}

private calculateKeywordScoreImproved(doc: any, searchTerms: string[], fullQuery: string): number {
  const title = (doc.title || '').toLowerCase();
  const keywords = (doc.keywords || []).map(k => k.toLowerCase());
  const content = (doc.content || '').toLowerCase();
  
  let score = 0;
  
  // **FIXED**: Exact phrase match gets MASSIVE boost
  if (title.includes(fullQuery)) {
    score += 50; // Much higher for exact phrase in title
  }
  if (content.includes(fullQuery)) {
    score += 25; // High for exact phrase in content
  }
  
  // **FIXED**: Individual term scoring with context awareness
  const criticalTerms = ['chat', 'communication', 'messaging', 'project', 'task', 'time', 'team'];
  
  searchTerms.forEach(term => {
    if (term.length <= 3) return; // Skip short words like "do", "you"
    
    const isCriticalTerm = criticalTerms.includes(term);
    
    // Title matches
    if (title.includes(term)) {
      score += isCriticalTerm ? 20 : 5; // Higher score for important terms
    }
    
    // Keyword matches  
    if (keywords.some(k => k.includes(term))) {
      score += isCriticalTerm ? 15 : 3;
    }
    
    // Content matches (heavily reduced for generic terms)
    const contentMatches = (content.match(new RegExp(`\\b${term}\\b`, 'gi')) || []).length;
    if (isCriticalTerm) {
      score += Math.min(contentMatches * 3, 10);
    } else {
      score += Math.min(contentMatches * 0.5, 2); // Much lower for generic terms
    }
  });
  
  // **NEW**: Penalty for documents that don't match the query intent
  if (fullQuery.includes('chat') || fullQuery.includes('communication')) {
    const hasCommTerms = title.includes('chat') || title.includes('communication') || 
                         title.includes('message') || content.includes('communication hub');
    if (!hasCommTerms) {
      score *= 0.1; // Major penalty for non-communication docs
    }
  }
  
  return score;
}


/**
 * **NEW**: Normalize text search scores
 */
private normalizeTextScore(mongoScore: number, query: string, doc: any): number {
  // MongoDB text scores can vary widely, normalize them
  let normalizedScore = Math.min(mongoScore, 10) / 10; // Cap at 10 and normalize to 0-1
  
  // Apply additional relevance factors
  const title = (doc.title || '').toLowerCase();
  const content = (doc.content || '').toLowerCase();
  
  // Boost if query appears in title
  if (title.includes(query.toLowerCase())) {
    normalizedScore += 0.5;
  }
  
  // Boost based on query term density in content
  const queryTerms = query.toLowerCase().split(/\s+/);
  const contentWords = content.split(/\s+/).length;
  const queryTermMatches = queryTerms.reduce((count, term) => {
    return count + (content.match(new RegExp(term, 'gi')) || []).length;
  }, 0);
  
  if (contentWords > 0) {
    const density = queryTermMatches / contentWords;
    normalizedScore += density * 2; // Boost based on term density
  }
  
  return Math.min(normalizedScore, 2.0); // Cap the final score
}


/**
 * **IMPROVED**: Better full-text search
 */
private async searchByFullText(
  query: string,
  baseQuery: any,
  limit: number
): Promise<any[]> {
  try {
    const textQuery = {
      ...baseQuery,
      $text: { $search: query }
    };

    const results = await this.knowledgeDocumentModel
      .find(textQuery, { 
        score: { $meta: "textScore" },
        title: 1,
        content: 1,
        keywords: 1,
        categories: 1,
        businessTypes: 1,
        features: 1,
        active: 1,
        clientId: 1
      })
      .sort({ score: { $meta: "textScore" } })
      .lean()
      .limit(limit * 2);

    return results.map(doc => ({
      ...doc,
      searchScore: this.normalizeTextScore((doc as any).score || 0, query, doc),
      searchMethod: 'fulltext'
    }));

  } catch (error) {
    this.logger.warn(`Full-text search failed, using regex fallback: ${error.message}`);
    return this.searchByRegexFallback(query, baseQuery, limit);
  }
}

private async searchByRegexFallback(
  query: string,
  baseQuery: any,
  limit: number
): Promise<any[]> {
  try {
    const regexQuery = {
      ...baseQuery,
      $or: [
        { content: { $regex: query, $options: 'i' } },
        { title: { $regex: query, $options: 'i' } }
      ]
    };

    const results = await this.knowledgeDocumentModel
      .find(regexQuery)
      .lean()
      .limit(limit * 2);

    return results.map(doc => ({
      ...doc,
      searchScore: this.calculateContentScore(doc, query),
      searchMethod: 'regex'
    }));

  } catch (error) {
    this.logger.error(`Error in regex fallback search: ${error.message}`);
    return [];
  }
}




/**
 * Calculate relevance score for keyword matches
 */
private calculateKeywordScore(doc: any, searchTerms: string[]): number {
  let score = 0;
  const title = (doc.title || '').toLowerCase();
  const keywords = (doc.keywords || []).map(k => k.toLowerCase());
  const content = (doc.content || '').toLowerCase();

  searchTerms.forEach(term => {
    // Title exact match = highest score
    if (title.includes(term)) {
      score += 10;
    }
    
    // Keyword exact match = high score
    if (keywords.some(k => k.includes(term))) {
      score += 8;
    }
    
    // Content match = medium score
    if (content.includes(term)) {
      score += 3;
    }
    
    // Partial matches get lower scores
    if (title.includes(term.substring(0, Math.max(3, term.length - 1)))) {
      score += 2;
    }
  });

  return score;
}

/**
 * Calculate relevance score for content matches
 */
private calculateContentScore(doc: any, query: string): number {
  const title = (doc.title || '').toLowerCase();
  const content = (doc.content || '').toLowerCase();
  const keywords = (doc.keywords || []).join(' ').toLowerCase();
  
  let score = 0;
  
  // Count occurrences in different fields
  const titleMatches = (title.match(new RegExp(query, 'gi')) || []).length;
  const keywordMatches = (keywords.match(new RegExp(query, 'gi')) || []).length;
  const contentMatches = (content.match(new RegExp(query, 'gi')) || []).length;
  
  score += titleMatches * 10;
  score += keywordMatches * 8;
  score += contentMatches * 2;
  
  return score;
}

/**
 * Calculate relevance score for category matches
 */
private calculateCategoryScore(doc: any, relevantCategories: string[]): number {
  const docCategories = doc.categories || [];
  const matches = docCategories.filter(cat => relevantCategories.includes(cat));
  return matches.length * 5;
}

/**
 * Combine and rank results from all search strategies
 */
private combineAndRankResults(
  keywordResults: any[],
  textResults: any[],
  categoryResults: any[],
  query: string,
  limit: number
): any[] {
  // Create a map to avoid duplicates
  const resultsMap = new Map();

  // Add keyword results (highest priority)
  keywordResults.forEach(doc => {
    const id = doc._id.toString();
    if (!resultsMap.has(id) || resultsMap.get(id).searchScore < doc.searchScore) {
      resultsMap.set(id, { ...doc, searchScore: doc.searchScore * 1.5 }); // Boost keyword matches
    }
  });

  // Add text results (medium priority)
  textResults.forEach(doc => {
    const id = doc._id.toString();
    const existing = resultsMap.get(id);
    if (!existing) {
      resultsMap.set(id, doc);
    } else {
      // Combine scores for documents found by multiple methods
      existing.searchScore += doc.searchScore * 0.8;
      existing.searchMethod += `, ${doc.searchMethod}`;
    }
  });

  // Add category results (lower priority)
  categoryResults.forEach(doc => {
    const id = doc._id.toString();
    const existing = resultsMap.get(id);
    if (!existing) {
      resultsMap.set(id, { ...doc, searchScore: doc.searchScore * 0.5 });
    } else {
      existing.searchScore += doc.searchScore * 0.3;
      existing.searchMethod += `, ${doc.searchMethod}`;
    }
  });

  // Convert to array and sort by score
  const combinedResults = Array.from(resultsMap.values())
    .sort((a, b) => b.searchScore - a.searchScore);

  return combinedResults;
}

/**
 * Filter results by business context
 */
private filterByBusinessContext(
  results: any[],
  businessType: string,
  features: string[]
): any[] {
  return results.filter(doc => {
    // Check business type compatibility
    if (doc.businessTypes && doc.businessTypes.length > 0) {
      const isBusinessTypeMatch = doc.businessTypes.includes(businessType) ||
                                doc.businessTypes.includes('all') ||
                                businessType === 'default';
      if (!isBusinessTypeMatch) {
        return false;
      }
    }

    // Check feature compatibility
    if (features.length > 0 && doc.features && doc.features.length > 0) {
      const hasFeatureMatch = doc.features.some(feature => features.includes(feature));
      if (!hasFeatureMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * SETUP: Ensure proper database indexes exist
 */
async ensureSearchIndexes(): Promise<void> {
  try {
    // Create text search index
    await this.knowledgeDocumentModel.collection.createIndex({
      title: 'text',
      content: 'text',
      keywords: 'text'
    }, {
      name: 'knowledge_text_search',
      weights: {
        title: 10,
        keywords: 8,
        content: 1
      }
    });

    // Create other necessary indexes
    await this.knowledgeDocumentModel.collection.createIndex({ clientId: 1, active: 1 });
    await this.knowledgeDocumentModel.collection.createIndex({ categories: 1, active: 1 });
    await this.knowledgeDocumentModel.collection.createIndex({ keywords: 1, active: 1 });

    this.logger.log('Search indexes created successfully');
  } catch (error) {
    this.logger.error(`Error creating search indexes: ${error.message}`);
  }
}

// CALL THIS DURING SERVICE INITIALIZATION
async onModuleInit() {
  await this.ensureSearchIndexes();
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
 * **IMPROVED**: Better query response search
 */
async searchQueryResponses(
  query: string,
  options: {
    category?: string;
    limit?: number;
    clientId?: string;
  } = {}
): Promise<any[]> {
  const { category, limit = 10, clientId } = options; // Increased default limit
  
  this.logger.log(`🔍 Searching query responses for: "${query}" with clientId: ${clientId}`);
  
  // **IMPROVED**: Multi-strategy search for query responses
  const strategies = await Promise.all([
    this.searchQueryResponsesByExact(query, options),
    this.searchQueryResponsesByKeywords(query, options),
    this.searchQueryResponsesByText(query, options)
  ]);
  
  const [exactMatches, keywordMatches, textMatches] = strategies;
  
  // Combine and deduplicate
  const allMatches = new Map();
  
  // Prioritize exact matches
  exactMatches.forEach(pair => {
    allMatches.set(pair._id.toString(), { ...pair, similarity: 1.0 });
  });
  
  // Add keyword matches
  keywordMatches.forEach(pair => {
    const id = pair._id.toString();
    if (!allMatches.has(id)) {
      allMatches.set(id, pair);
    }
  });
  
  // Add text matches
  textMatches.forEach(pair => {
    const id = pair._id.toString();
    if (!allMatches.has(id)) {
      allMatches.set(id, pair);
    }
  });
  
  const results = Array.from(allMatches.values())
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
  
  this.logger.log(`Found ${results.length} query response matches`);
  
  // Update use count for results
  if (results.length > 0) {
    await this.queryResponsePairModel.updateMany(
      { _id: { $in: results.map(p => p._id) } },
      { $inc: { useCount: 1 } }
    );
  }
  
  return results;
}


private async searchQueryResponsesByExact(
  query: string,
  options: { category?: string; clientId?: string; limit?: number }
): Promise<any[]> {
  
  // First try exact string match (no regex)
  const exactFilter: any = {
    active: true,
    query: query // Exact string match
  };
  
  if (options.clientId) exactFilter.clientId = options.clientId;
  if (options.category) exactFilter.category = options.category;
  
  const exactResults = await this.queryResponsePairModel
    .find(exactFilter)
    .sort({ useCount: -1, successRate: -1 })
    .limit(5)
    .lean();
    
  if (exactResults.length > 0) {
    return exactResults.map(result => ({ ...result, similarity: 1.0 }));
  }
  
  // If no exact match, try case-insensitive
  const caseInsensitiveFilter: any = {
    active: true,
    query: { $regex: `^${query}$`, $options: 'i' }
  };
  
  if (options.clientId) caseInsensitiveFilter.clientId = options.clientId;
  if (options.category) caseInsensitiveFilter.category = options.category;
  
  const caseResults = await this.queryResponsePairModel
    .find(caseInsensitiveFilter)
    .sort({ useCount: -1, successRate: -1 })
    .limit(5)
    .lean();
    
  return caseResults.map(result => ({ ...result, similarity: 0.9 }));
}

/**
 * **NEW**: Search query responses by keywords
 */
private async searchQueryResponsesByKeywords(
  query: string,
  options: { category?: string; clientId?: string; limit?: number }
): Promise<any[]> {
  const queryKeywords = this.extractKeywords(query);
  
  if (queryKeywords.length === 0) return [];
  
  const filter: any = {
    active: true,
    keywords: { $in: queryKeywords }
  };
  
  if (options.clientId) filter.clientId = options.clientId;
  if (options.category) filter.category = options.category;
  
  const results = await this.queryResponsePairModel
    .find(filter)
    .sort({ useCount: -1, successRate: -1 })
    .limit(options.limit || 10)
    .lean();
  
  // Calculate similarity scores
  return results.map(pair => ({
    ...pair,
    similarity: this.calculateQuerySimilarity(query, pair.query, queryKeywords, pair.keywords)
  }));
}

/**
 * **NEW**: Search query responses by full text
 */
private async searchQueryResponsesByText(
  query: string,
  options: { category?: string; clientId?: string; limit?: number }
): Promise<any[]> {
  try {
    const filter: any = {
      active: true,
      $text: { $search: query }
    };
    
    if (options.clientId) filter.clientId = options.clientId;
    if (options.category) filter.category = options.category;
    
    const results = await this.queryResponsePairModel
      .find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, useCount: -1 })
      .limit(options.limit || 10)
      .lean();
    
    return results.map(pair => ({
      ...pair,
      similarity: Math.min((pair as any).score / 5, 1.0) // Normalize MongoDB text score
    }));
    
  } catch (error) {
    this.logger.warn(`Text search failed for query responses: ${error.message}`);
    return [];
  }
}

/**
 * **NEW**: Calculate similarity between queries
 */
private calculateQuerySimilarity(
  userQuery: string, 
  storedQuery: string, 
  userKeywords: string[], 
  storedKeywords: string[]
): number {
  // Exact match
  if (userQuery.toLowerCase() === storedQuery.toLowerCase()) {
    return 1.0;
  }
  
  // Keyword overlap
  const commonKeywords = userKeywords.filter(uk => 
    storedKeywords.some(sk => sk.includes(uk) || uk.includes(sk))
  );
  
  const keywordSimilarity = userKeywords.length > 0 ? 
    commonKeywords.length / userKeywords.length : 0;
  
  // String similarity (basic)
  const maxLength = Math.max(userQuery.length, storedQuery.length);
  const editDistance = this.calculateEditDistance(userQuery.toLowerCase(), storedQuery.toLowerCase());
  const stringSimilarity = (maxLength - editDistance) / maxLength;
  
  // Combine similarities
  return (keywordSimilarity * 0.7) + (stringSimilarity * 0.3);
}

/**
 * **NEW**: Calculate edit distance for string similarity
 */
private calculateEditDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i] + 1,     // deletion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
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

  async cleanupBadResponses(patterns: RegExp[]): Promise<number> {
     let totalDeleted = 0;
     for (const pattern of patterns) {
     const result = await this.queryResponsePairModel.deleteMany({
       response: { $regex: pattern }
     });
     totalDeleted += result.deletedCount;
   }
    return totalDeleted;
   }
}