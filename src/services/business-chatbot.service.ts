// src/services/business-chatbot.service.ts
import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotMessage } from '../schemas/chatbot-message.schema';
import { v4 as uuidv4 } from 'uuid';
import { BusinessService } from './business.service';
import { Business } from '../schemas/business.schema';
import { User } from '../schemas/user.schema';
import { KnowledgeBaseService } from './knowledge-base.service';
import { QueryResponsePair } from '../schemas/query-response-pair.schema';

// Export interfaces for TypeScript
export interface ChatResponse {
  text: string;
  suggestions?: { id: string; text: string }[];
  sessionId?: string;
  success: boolean;
}

export interface HistoryResponse {
  messages: ChatbotMessage[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

export interface ClearHistoryResponse {
  success: boolean;
  deletedCount: number;
}

export interface SessionsResponse {
  sessions: any[];
  total: number;
  page: number;
  limit: number;
  success: boolean;
}

@Injectable()
export class BusinessChatbotService {
  private readonly logger = new Logger(BusinessChatbotService.name);
  private static cleanedOnce = false; // Flag to track if cleanup has been performed

  constructor(
    @InjectModel(ChatbotMessage.name) private chatbotMessageModel: Model<ChatbotMessage>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(QueryResponsePair.name) private queryResponsePairModel: Model<QueryResponsePair>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly businessService: BusinessService,  
    private readonly knowledgeBaseService: KnowledgeBaseService
  ) {}

  /**
   * Clean up bad learned responses (run once)
   */
  private async cleanupBadResponses(): Promise<void> {
    if (BusinessChatbotService.cleanedOnce) {
      return; // Already cleaned
    }

    try {
      this.logger.log('Performing one-time cleanup of bad learned responses...');
      
      // Define patterns for bad responses that should be removed
      const badResponsePatterns = [
        /sports/i,
        /weather/i,
        /cooking/i,
        /politics/i,
        /entertainment/i,
        /music/i,
        /movies/i,
        /yes i know about sports/i,
        /purpose of this chat is to help only about/i
      ];

      let totalDeleted = 0;

      // Check if knowledgeBaseService has a method to clean responses
      if (typeof this.knowledgeBaseService.cleanupBadResponses === 'function') {
        const deletedCount = await this.knowledgeBaseService.cleanupBadResponses(badResponsePatterns);
        totalDeleted = deletedCount;
        this.logger.log(`Cleanup completed: Removed ${deletedCount} bad learned responses`);
      } else {
        // Fallback: Log what would be cleaned (since we don't have direct access to the query-response collection)
        this.logger.log('KnowledgeBaseService cleanup method not available. Cleanup patterns logged for manual cleanup.');
        this.logger.log(`Patterns to clean: ${badResponsePatterns.map(p => p.source).join(', ')}`);
        
        // Alternative: Try to use existing methods to identify and remove bad responses
        try {
          // Search for potentially bad responses and log them
          const suspiciousQueries = ['sports', 'weather', 'cooking', 'politics'];
          for (const query of suspiciousQueries) {
            const badResponses = await this.knowledgeBaseService.searchQueryResponses(
              query,
              { limit: 10 }
            );
            
            if (badResponses.length > 0) {
              this.logger.warn(`Found ${badResponses.length} potentially bad responses for query: ${query}`);
              // Log the IDs for manual cleanup if needed
              badResponses.forEach(response => {
                this.logger.warn(`Bad response ID: ${response._id} - Response: ${response.response.substring(0, 100)}...`);
              });
            }
          }
        } catch (searchError) {
          this.logger.warn(`Could not search for bad responses: ${searchError.message}`);
        }
      }

      BusinessChatbotService.cleanedOnce = true;
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error.message}`, error.stack);
      // Don't throw - allow the system to continue even if cleanup fails
      BusinessChatbotService.cleanedOnce = true; // Mark as attempted to avoid repeated failures
    }
  }

   /**
   * Process a message and return a response
   */
   async processMessage(
    businessId: string,
    clientId: string,
    userId: string | null,
    message: string,
    sessionId: string = null,
    context: Record<string, any> = {}
  ): Promise<ChatResponse> {
    try {
      // Create or use session ID
      if (!sessionId) {
        sessionId = uuidv4();
      }

      // Get previous messages for context if sessionId exists
      let previousMessages = [];
      if (sessionId) {
        previousMessages = await this.chatbotMessageModel
          .find({ businessId, clientId, sessionId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
      }
      
      // Add to context
      context.conversationHistory = previousMessages.map(msg => ({
        content: msg.content,
        sender: msg.sender
      })).reverse();

      // Store user message
      const userMessage = new this.chatbotMessageModel({
        businessId,
        clientId,
        userId,
        sender: 'user',
        content: message,
        sessionId,
        metadata: {
          context,
          timestamp: new Date()
        }
      });
      await userMessage.save();

      // Get business data for context-aware responses
      const business = await this.businessModel.findById(businessId).lean();
      
      // Get user data if available
      let user = null;
      if (userId) {
        user = await this.userModel.findById(userId).lean();
      }

      // Generate response based on message content and business context
      const response = await this.generateResponse(message, context, business, user);

      // Store bot response
      const botMessage = new this.chatbotMessageModel({
        businessId,
        clientId,
        userId,
        sender: 'bot',
        content: response.text,
        suggestions: response.suggestions || [],
        sessionId,
        metadata: {
          context,
          knowledgeUsed: response.knowledgeUsed || false,
          responseSource: response.responseSource || 'nlp',
          timestamp: new Date(),
          ...response.metadata
        }
      });
      await botMessage.save();

      // Log response quality for monitoring
      await this.logResponseQuality(
        message,
        response.text,
        response.responseSource || 'nlp',
        response.metadata?.confidence || 0
      );

      return {
        ...response,
        sessionId,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      return {
        text: "I'm sorry, I encountered an error while processing your request. Please try again.",
        sessionId,
        success: false
      };
    }
  }

  /**
   * Get conversation history for a business user
   */
  async getConversationHistory(
    businessId: string,
    clientId: string,
    userId: string = null,
    sessionId: string = null,
    limit: number = 20,
    page: number = 1
  ): Promise<HistoryResponse> {
    try {
      const query: any = { businessId, clientId };
      
      if (sessionId) {
        query.sessionId = sessionId;
      }
      
      if (userId) {
        query.userId = userId;
      }
      
      const total = await this.chatbotMessageModel.countDocuments(query);
      const skip = (page - 1) * limit;
      
      const messages = await this.chatbotMessageModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
      
      return {
        messages,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting conversation history: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Clear chat history for a session
   */
  async clearChatHistory(
    businessId: string,
    clientId: string,
    sessionId: string
  ): Promise<ClearHistoryResponse> {
    try {
      const result = await this.chatbotMessageModel.deleteMany({ 
        businessId, 
        clientId, 
        sessionId 
      });
      
      return { 
        success: true, 
        deletedCount: result.deletedCount 
      };
    } catch (error) {
      this.logger.error(`Error clearing chat history: ${error.message}`, error.stack);
      return { success: false, deletedCount: 0 };
    }
  }

  /**
   * Get active sessions for a business
   */
  async getActiveSessions(
    businessId: string,
    clientId: string,
    limit: number = 20,
    page: number = 1
  ): Promise<SessionsResponse> {
    try {
      const skip = (page - 1) * limit;
      
      // Aggregate to get unique sessions with their last message time
      const sessions = await this.chatbotMessageModel.aggregate([
        { $match: { businessId: businessId, clientId: clientId } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: "$sessionId",
            lastMessage: { $first: "$content" },
            lastMessageTime: { $first: "$createdAt" },
            userId: { $first: "$userId" },
            messageCount: { $sum: 1 }
          }
        },
        { $sort: { lastMessageTime: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);
      
      // Get total count of unique sessions
      const totalAgg = await this.chatbotMessageModel.aggregate([
        { $match: { businessId: businessId, clientId: clientId } },
        { $group: { _id: "$sessionId" } },
        { $count: "total" }
      ]);
      
      const total = totalAgg.length > 0 ? totalAgg[0].total : 0;
      
      // Populate user info for each session
      const sessionData = await Promise.all(
        sessions.map(async (session) => {
          let userInfo = null;
          if (session.userId) {
            try {
              const user = await this.userModel.findById(session.userId).lean();
              if (user) {
                userInfo = {
                  id: user._id,
                  name: user.name || 'Unknown',
                  email: user.email || 'Unknown'
                };
              }
            } catch (err) {
              this.logger.error(`Error fetching user info: ${err.message}`);
            }
          }
          
          return {
            sessionId: session._id,
            lastMessage: session.lastMessage,
            lastMessageTime: session.lastMessageTime,
            messageCount: session.messageCount,
            user: userInfo
          };
        })
      );
      
      return {
        sessions: sessionData,
        total,
        page,
        limit,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error getting active sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate business API key
   */
  async validateBusinessApiKey(businessId: string, apiKey: string): Promise<Business> {
    if (!apiKey) {
      throw new UnauthorizedException('Business API key missing');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }
    
    return business;
  }

  private async generateResponse(
    message: string, 
    context: Record<string, any>,
    business: any,
    user: any
  ): Promise<{ 
    text: string; 
    suggestions?: { id: string; text: string }[];
    knowledgeUsed?: boolean;
    responseSource?: string;
    metadata?: any;
  }> {
    
    const normalizedMessage = message.toLowerCase().trim();
    const platformName = 'Staffluent';
    const businessName = business?.name || 'your business';
    const userName = user ? `${user.name || 'there'}` : 'there';
    const clientId = business?.clientId;
    
    this.logger.log(`🔍 Processing: "${normalizedMessage}" for client: ${clientId}`);
    
    try {
      // STEP 1: Handle basic conversational queries (highest priority)
      const conversationalResponse = this.handleConversationalQueries(normalizedMessage, userName, businessName, platformName);
      if (conversationalResponse) {
        this.logger.log(`✅ Conversational response used`);
        return {
          ...conversationalResponse,
          responseSource: 'conversational',
          knowledgeUsed: false,
          metadata: { responseSource: 'conversational', shouldShowFeedback: false }
        };
      }
      
      // STEP 2: Search query pairs FIRST (before knowledge base)
      const queryPairResponse = await this.searchQueryPairsImproved(normalizedMessage, clientId);
      if (queryPairResponse) {
        this.logger.log(`✅ Query pair found: "${queryPairResponse.query}" (similarity: ${queryPairResponse.similarity})`);
        
        // Update usage stats
        try {
          await this.queryResponsePairModel.updateOne(
            { _id: queryPairResponse._id },
            { $inc: { useCount: 1 } }
          );
        } catch (updateError) {
          this.logger.warn(`Failed to update usage count: ${updateError.message}`);
        }
        
        return {
          text: this.personalizeResponse(queryPairResponse.response, businessName, userName, platformName),
          suggestions: this.generateSmartSuggestions(queryPairResponse),
          responseSource: 'learned',
          knowledgeUsed: true,
          metadata: {
            sourceId: queryPairResponse._id.toString(),
            knowledgeUsed: true,
            responseSource: 'learned',
            shouldShowFeedback: true,
            matchScore: queryPairResponse.similarity,
            originalQuery: queryPairResponse.query
          }
        };
      }
      
      // STEP 3: Built-in specific responses for common features
      const specificResponse = this.getSpecificFeatureResponse(normalizedMessage, businessName, userName, platformName);
      if (specificResponse) {
        this.logger.log(`✅ Specific feature response used`);
        return {
          ...specificResponse,
          responseSource: 'specific',
          knowledgeUsed: true,
          metadata: { responseSource: 'specific', shouldShowFeedback: true }
        };
      }
      
      // STEP 4: Search knowledge base (only if query pairs and specific responses failed)
      const knowledgeResponse = await this.searchKnowledgeBaseReliable(normalizedMessage, clientId, context);
      if (knowledgeResponse) {
        this.logger.log(`✅ Knowledge document found: "${knowledgeResponse.title}" (score: ${knowledgeResponse.searchScore})`);
        
        return {
          text: this.formatKnowledgeResponse(knowledgeResponse.content, businessName, userName, platformName),
          suggestions: this.generateKnowledgeSuggestions(knowledgeResponse),
          responseSource: 'knowledge',
          knowledgeUsed: true,
          metadata: {
            sourceId: knowledgeResponse._id.toString(),
            knowledgeUsed: true,
            responseSource: 'knowledge',
            shouldShowFeedback: true,
            documentTitle: knowledgeResponse.title,
            searchScore: knowledgeResponse.searchScore
          }
        };
      }
      
      // STEP 5: Generic built-in responses
      const genericResponse = this.getGenericResponse(normalizedMessage, businessName, userName, platformName);
      if (genericResponse && genericResponse.confidence > 0.6) {
        this.logger.log(`✅ Generic response used (confidence: ${genericResponse.confidence})`);
        return {
          text: genericResponse.text,
          suggestions: genericResponse.suggestions,
          responseSource: 'generic',
          knowledgeUsed: false,
          metadata: { 
            responseSource: 'generic', 
            confidence: genericResponse.confidence,
            shouldShowFeedback: true 
          }
        };
      }
      
      // STEP 6: Log unrecognized query and return fallback
      this.logger.log(`❌ No match found for: "${normalizedMessage}"`);
      
      try {
        await this.knowledgeBaseService.logUnrecognizedQuery(message, {
          clientId,
          businessId: business?._id?.toString(),
          context
        });
      } catch (logError) {
        this.logger.warn(`Failed to log unrecognized query: ${logError.message}`);
      }
      
      return {
        text: `I'm not sure I understand "${message}". Could you try rephrasing or select from these options?`,
        suggestions: [
          { id: 'features', text: 'What features do you offer?' },
          { id: 'communication', text: 'Communication features' },
          { id: 'projects', text: 'Project management' },
          { id: 'help', text: 'I need help' }
        ],
        responseSource: 'fallback',
        knowledgeUsed: false,
        metadata: { 
          responseSource: 'fallback', 
          unrecognized: true,
          shouldShowFeedback: true 
        }
      };
      
    } catch (error) {
      this.logger.error(`Error in generateResponse: ${error.message}`, error.stack);
      
      return {
        text: "I'm sorry, I encountered an error while processing your request. Please try again.",
        suggestions: [
          { id: 'help', text: 'I need help' },
          { id: 'features', text: 'Show features' }
        ],
        responseSource: 'error',
        knowledgeUsed: false,
        metadata: { error: true, shouldShowFeedback: false }
      };
    }
  }
  

  /**
 * STEP 1: Handle conversational queries (greetings, thanks, goodbye)
 */
private handleConversationalQueries(
  message: string,
  userName: string,
  businessName: string,
  platformName: string
): any | null {
  
  // Simple greetings
  if (/^(hi|hello|hey)(\s.*)?$/i.test(message) && message.length < 20) {
    return {
      text: `Hello ${userName}! I'm the ${platformName} assistant for ${businessName}. How can I help you today?`,
      suggestions: [
        { id: 'features', text: 'What features do you offer?' },
        { id: 'communication', text: 'Communication features' },
        { id: 'projects', text: 'About projects' },
        { id: 'help', text: 'I need help' }
      ]
    };
  }
  
  // How are you
  if (/^how are you/i.test(message) || /^how('s| is) it going/i.test(message)) {
    return {
      text: `I'm doing well, thanks for asking, ${userName}! I'm here to help you with anything related to ${platformName}. What would you like assistance with today?`,
      suggestions: [
        { id: 'features', text: 'Show me key features' },
        { id: 'communication', text: 'Communication capabilities' },
        { id: 'help', text: 'I need help with something' },
        { id: 'learn', text: 'Learn about Staffluent' }
      ]
    };
  }
  
  // Thank you
  if (/^(thank you|thanks|thx)/i.test(message)) {
    return {
      text: `You're welcome, ${userName}! Is there anything else you'd like to know about ${platformName}?`,
      suggestions: [
        { id: 'more_help', text: 'I need more help' },
        { id: 'features', text: 'Show me features' },
        { id: 'done', text: 'That\'s all for now' }
      ]
    };
  }
  
  // Goodbye
  if (/^(bye|goodbye|that('s| is) all|no thanks?|nothing else)(\s.*)?$/i.test(message)) {
    return {
      text: `You're welcome, ${userName}! Feel free to reach out anytime you have questions about ${platformName}. Have a great day!`,
      suggestions: [
        { id: 'new_question', text: 'I have another question' }
      ]
    };
  }
  
  return null;
}


/**
 * STEP 2: Improved query pair searching with better matching
 */
private async searchQueryPairsImproved(
  query: string,
  clientId: string
): Promise<any | null> {
  
  try {
    if (!clientId) {
      this.logger.warn('No clientId provided for query pair search');
      return null;
    }
    
    const allPairs = await this.queryResponsePairModel
      .find({ 
        clientId, 
        active: true,
        response: { $exists: true, $ne: '' }
      })
      .lean();
    
    if (allPairs.length === 0) {
      this.logger.log('No query pairs found for client');
      return null;
    }
    
    this.logger.log(`Searching ${allPairs.length} query pairs`);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const pair of allPairs) {
      if (!pair.query || !pair.response) continue;
      
      const score = this.calculateAdvancedSimilarity(query, pair.query);
      
      this.logger.log(`Query: "${pair.query}" | Score: ${score.toFixed(3)}`);
      
      // More permissive threshold - accept anything above 0.5
      if (score > bestScore && score >= 0.5) {
        bestMatch = { ...pair, similarity: score };
        bestScore = score;
      }
    }
    
    if (bestMatch) {
      this.logger.log(`Best match: "${bestMatch.query}" with score ${bestScore.toFixed(3)}`);
      return bestMatch;
    }
    
    this.logger.log('No query pair match found above threshold');
    return null;
    
  } catch (error) {
    this.logger.error(`Error in query pair search: ${error.message}`);
    return null;
  }
}


/**
 * Advanced similarity calculation with multiple strategies
 */
private calculateAdvancedSimilarity(query1: string, query2: string): number {
  const q1 = query1.toLowerCase().trim();
  const q2 = query2.toLowerCase().trim();
  
  // Exact match
  if (q1 === q2) return 1.0;
  
  // Case-insensitive exact match  
  if (q1.toLowerCase() === q2.toLowerCase()) return 0.95;
  
  // Handle common typos and variations
  const correctedQ1 = this.correctCommonTypos(q1);
  const correctedQ2 = this.correctCommonTypos(q2);
  if (correctedQ1 === correctedQ2) return 0.9;
  
  // Word-based matching
  const words1 = this.extractMeaningfulWords(q1);
  const words2 = this.extractMeaningfulWords(q2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count exact word matches
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  for (const word1 of words1) {
    let foundMatch = false;
    
    for (const word2 of words2) {
      if (word1 === word2) {
        exactMatches++;
        foundMatch = true;
        break;
      } else if (this.areWordsSimilar(word1, word2)) {
        fuzzyMatches++;
        foundMatch = true;
        break;
      }
    }
  }
  
  const totalWords = Math.max(words1.length, words2.length);
  const exactScore = exactMatches / totalWords;
  const fuzzyScore = fuzzyMatches / totalWords;
  
  // Combine scores with weight preference for exact matches
  const combinedScore = (exactScore * 0.8) + (fuzzyScore * 0.5);
  
  // Boost for high word coverage
  const coverage = (exactMatches + fuzzyMatches) / totalWords;
  if (coverage >= 0.8) return Math.min(0.85, combinedScore + 0.1);
  if (coverage >= 0.6) return Math.min(0.75, combinedScore + 0.05);
  
  return combinedScore;
}



/**
 * Extract meaningful words (filter out stop words)
 */
private extractMeaningfulWords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'you', 'it',
    'that', 'this', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her',
    'can', 'will', 'would', 'could', 'should', 'do', 'does', 'did', 'have', 'has', 'had'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Correct common typos
 */
private correctCommonTypos(text: string): string {
  const typoMap = {
    'browser': 'browse',
    'centre': 'center',
    'colour': 'color',
    'favour': 'favor',
    'labour': 'labor'
  };
  
  let corrected = text;
  for (const [typo, correct] of Object.entries(typoMap)) {
    corrected = corrected.replace(new RegExp(`\\b${typo}\\b`, 'gi'), correct);
  }
  
  return corrected;
}


/**
 * Check if two words are similar
 */
private areWordsSimilar(word1: string, word2: string): boolean {
  // Handle plurals
  if (word1 + 's' === word2 || word1 === word2 + 's') return true;
  if (word1 + 'es' === word2 || word1 === word2 + 'es') return true;
  
  // Handle verb forms
  if (word1 + 'ing' === word2 || word1 === word2 + 'ing') return true;
  if (word1 + 'ed' === word2 || word1 === word2 + 'ed') return true;
  
  // Handle y -> ies
  if (word1.endsWith('y') && word2 === word1.slice(0, -1) + 'ies') return true;
  if (word2.endsWith('y') && word1 === word2.slice(0, -1) + 'ies') return true;
  
  // One character difference tolerance
  if (Math.abs(word1.length - word2.length) <= 1) {
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;
    
    let differences = 0;
    let i = 0, j = 0;
    
    while (i < longer.length && j < shorter.length) {
      if (longer[i] !== shorter[j]) {
        differences++;
        if (differences > 1) return false;
        
        // Skip character in longer string
        if (longer.length > shorter.length) {
          i++;
        } else {
          i++;
          j++;
        }
      } else {
        i++;
        j++;
      }
    }
    
    return differences <= 1;
  }
  
  return false;
}

/**
 * STEP 3: Specific feature responses
 */
private getSpecificFeatureResponse(
  message: string,
  businessName: string,
  userName: string,
  platformName: string
): any | null {
  
  // Communication/Chat features
  if (/chat|communication|messaging|message|talk|communicate/i.test(message)) {
    return {
      text: `Yes! ${platformName} includes a comprehensive Communication Hub with team chat, project-specific channels, direct messaging, file sharing, real-time notifications, and client communication capabilities. You can collaborate with team members and communicate with clients directly through the platform.`,
      suggestions: [
        { id: 'team_chat', text: 'Team chat features' },
        { id: 'project_channels', text: 'Project channels' },
        { id: 'client_communication', text: 'Client communication' },
        { id: 'file_sharing', text: 'File sharing' }
      ]
    };
  }
  
  // What is Staffluent
  if (/what is staffluent|about staffluent|explain staffluent|tell me about staffluent/i.test(message)) {
    return {
      text: `${platformName} is a comprehensive workforce management platform that helps ${businessName} manage teams, projects, tasks, time tracking, field service operations, communication, and client relationships all in one place. It includes project management, team collaboration, communication hub, time & attendance, reporting & analytics, and mobile capabilities.`,
      suggestions: [
        { id: 'features', text: 'What features do you offer?' },
        { id: 'communication', text: 'Communication features' },
        { id: 'get_started', text: 'How do I get started?' },
        { id: 'tour', text: 'Take a tour' }
      ]
    };
  }
  
  // Features question
  if (/what.*features|what.*offer|what.*capabilities|what.*do/i.test(message)) {
    return {
      text: `${platformName} offers comprehensive features for ${businessName}: project management, task tracking, time & attendance, team management, communication hub, field service operations, client management, reporting & analytics, quality control, and equipment management. Which feature interests you most?`,
      suggestions: [
        { id: 'projects', text: 'Project management' },
        { id: 'communication', text: 'Communication features' },
        { id: 'time', text: 'Time tracking' },
        { id: 'teams', text: 'Team management' }
      ]
    };
  }
  
  return null;
}



/**
 * STEP 4: Reliable knowledge base search
 */
private async searchKnowledgeBaseReliable(
  query: string,
  clientId: string,
  context: any
): Promise<any | null> {
  
  try {
    if (!clientId) {
      this.logger.warn('No clientId for knowledge base search');
      return null;
    }
    
    const searchResults = await this.knowledgeBaseService.searchDocuments(
      query,
      {
        clientId,
        currentView: context?.currentView,
        limit: 3
      }
    );
    
    if (searchResults.length === 0) {
      this.logger.log('No knowledge documents found');
      return null;
    }
    
    // Only return if we have a decent match (score > 3)
    const bestResult = searchResults[0];
    if (bestResult.searchScore && bestResult.searchScore > 3) {
      return bestResult;
    }
    
    this.logger.log(`Knowledge base score too low: ${bestResult.searchScore}`);
    return null;
    
  } catch (error) {
    this.logger.error(`Error in knowledge base search: ${error.message}`);
    return null;
  }
}

/**
 * STEP 5: Generic responses for common patterns
 */
private getGenericResponse(
  message: string,
  businessName: string,
  userName: string,
  platformName: string
): any | null {
  
  const patterns = [
    {
      regex: /help|support|assistance|guide/i,
      response: {
        text: `I can help ${userName} with ${platformName} features like projects, tasks, time tracking, team management, and communication. What specific area would you like help with?`,
        suggestions: [
          { id: 'projects', text: 'Project management' },
          { id: 'tasks', text: 'Task management' },
          { id: 'time', text: 'Time tracking' },
          { id: 'communication', text: 'Communication' }
        ],
        confidence: 0.7
      }
    },
    {
      regex: /how.*work|how.*use|getting started|get started/i,
      response: {
        text: `Getting started with ${platformName} is easy! You can begin by exploring the dashboard, setting up your team, creating your first project, or taking a guided tour. What would you like to start with?`,
        suggestions: [
          { id: 'tour', text: 'Take a tour' },
          { id: 'setup', text: 'Setup guide' },
          { id: 'projects', text: 'Create first project' },
          { id: 'team', text: 'Setup team' }
        ],
        confidence: 0.8
      }
    }
  ];
  
  for (const pattern of patterns) {
    if (pattern.regex.test(message)) {
      return pattern.response;
    }
  }
  
  return null;
}



  private getSpecificResponseForQuery(query: string): any | null {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('chat') || lowerQuery.includes('communication') || 
        lowerQuery.includes('messaging') || lowerQuery.includes('message')) {
      return {
        text: `Yes! Staffluent includes a comprehensive Communication Hub with team chat, project-specific channels, direct messaging, file sharing, real-time notifications, and client communication capabilities. You can collaborate with team members and communicate with clients directly through the platform.`,
        suggestions: [
          { id: 'team_chat', text: 'Team chat features' },
          { id: 'project_channels', text: 'Project channels' },
          { id: 'client_communication', text: 'Client communication' },
          { id: 'file_sharing', text: 'File sharing' }
        ],
        responseSource: 'specific',
        knowledgeUsed: true
      };
    }
    
    if (lowerQuery.includes('what is staffluent')) {
      return {
        text: `Staffluent is a comprehensive workforce management platform that helps businesses manage teams, projects, tasks, time tracking, field service operations, communication, and client relationships all in one place. It includes project management, team collaboration, communication hub, time & attendance, reporting & analytics, and mobile capabilities.`,
        suggestions: [
          { id: 'features', text: 'What features do you offer?' },
          { id: 'communication', text: 'Communication features' },
          { id: 'get_started', text: 'How do I get started?' },
          { id: 'tour', text: 'Take a tour' }
        ],
        responseSource: 'specific',
        knowledgeUsed: true
      };
    }
    
    return null;
  }
  
  /**
 * Personalize response text with placeholders
 */
private personalizeResponse(
  response: string,
  businessName: string,
  userName: string,
  platformName: string
): string {
  return response
    .replace(/{businessName}/g, businessName)
    .replace(/{userName}/g, userName)
    .replace(/{platformName}/g, platformName);
}

/**
 * Generate smart suggestions based on query pair
 */
private generateSmartSuggestions(queryPair: any): { id: string; text: string }[] {
  const suggestions = [];
  const response = queryPair.response?.toLowerCase() || '';
  const category = queryPair.category || 'general';
  
  // Generate suggestions based on response content
  if (response.includes('project')) {
    suggestions.push({ id: 'projects', text: 'More about projects' });
  }
  
  if (response.includes('team')) {
    suggestions.push({ id: 'teams', text: 'Team features' });
  }
  
  if (response.includes('time') || response.includes('track')) {
    suggestions.push({ id: 'time', text: 'Time tracking' });
  }
  
  if (response.includes('communication') || response.includes('chat')) {
    suggestions.push({ id: 'communication', text: 'Communication features' });
  }
  
  // Add help if we don't have enough suggestions
  if (suggestions.length < 2) {
    suggestions.push({ id: 'help', text: 'Need more help?' });
  }
  
  return suggestions.slice(0, 4);
}

/**
 * Generate suggestions based on knowledge document
 */
private generateKnowledgeSuggestions(doc: any): { id: string; text: string }[] {
  const suggestions = [];
  const content = doc.content || '';
  const title = doc.title || '';
  
  if (content.includes('create') || title.includes('create')) {
    suggestions.push({ id: 'action_create', text: 'Create new' });
  }
  
  if (content.includes('view') || title.includes('view')) {
    suggestions.push({ id: 'action_view', text: 'View details' });
  }
  
  if (content.includes('manage') || title.includes('manage')) {
    suggestions.push({ id: 'action_manage', text: 'Management features' });
  }
  
  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push(
      { id: 'more_info', text: 'Tell me more' },
      { id: 'related', text: 'Related topics' }
    );
  }
  
  return suggestions.slice(0, 4);
}

  // **NEW**: Improved query pair relevance calculation
private calculateQueryPairRelevance(
  userQuery: string, 
  pair: any, 
  queryTerms: string[]
): number {
  const pairQuery = (pair.query || '').toLowerCase();
  const pairKeywords = pair.keywords || [];
  
  let score = 0;
  
  // 1. Exact query match (highest priority)
  if (userQuery === pairQuery) {
    return 1.0;
  }
  
  // 2. High similarity for similar queries
  const similarity = this.calculateStringSimilarity(userQuery, pairQuery);
  score += similarity * 0.8;
  
  // 3. Keyword matching
  const keywordMatches = queryTerms.filter(term => 
    pairKeywords.some(keyword => 
      keyword.toLowerCase().includes(term) || term.includes(keyword.toLowerCase())
    )
  ).length;
  
  if (queryTerms.length > 0) {
    score += (keywordMatches / queryTerms.length) * 0.6;
  }
  
  // 4. Common word matching (for phrase queries)
  const userWords = userQuery.split(' ').filter(w => w.length > 2);
  const pairWords = pairQuery.split(' ').filter(w => w.length > 2);
  
  const commonWords = userWords.filter(word => 
    pairWords.some(pairWord => 
      word.includes(pairWord) || pairWord.includes(word)
    )
  ).length;
  
  if (userWords.length > 0) {
    score += (commonWords / userWords.length) * 0.4;
  }
  
  // 5. Boost for high success rate pairs
  if (pair.successRate > 70) {
    score += 0.1;
  }
  
  // 6. Boost for frequently used pairs
  if (pair.useCount > 5) {
    score += 0.05;
  }
  
  return Math.min(1.0, score);
}

// **NEW**: Improved string similarity calculation
private calculateStringSimilarity(str1: string, str2: string): number {
  // Simple Levenshtein distance based similarity
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const distance = this.levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// **NEW**: Levenshtein distance calculation
private levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// **FIXED**: Much more permissive validation for learned responses
private validateLearnedResponseFixed(
  query: string, 
  learnedResponse: any, 
  queryTerms: string[]
): boolean {
  const response = learnedResponse.response?.toLowerCase() || '';
  const originalQuery = learnedResponse.query?.toLowerCase() || '';
  
  // Only block obviously bad patterns (be very selective)
  const obviouslyBadPatterns = [
    /yes i know about sports.*but.*staffluent/i,
    /purpose of this chat is to help only about.*and not/i,
    /i don't know about (sports|weather|cooking|politics)/i
  ];
  
  for (const pattern of obviouslyBadPatterns) {
    if (pattern.test(response)) {
      this.logger.warn(`❌ Blocking learned response for bad pattern: ${response.substring(0, 50)}...`);
      return false;
    }
  }
  
  // Block empty or very short responses
  if (!response || response.trim().length < 5) {
    this.logger.warn(`❌ Blocking learned response for being too short: "${response}"`);
    return false;
  }
  
  // Allow everything else - be permissive!
  this.logger.log(`✅ Learned response passed validation`);
  return true;
}

// **NEW**: Improved knowledge base search with better targeting
private async searchKnowledgeBaseImproved(
  query: string,
  keyTerms: string[],
  options: {
    clientId?: string;
    businessType?: string;
    features?: string[];
    currentView?: string;
    limit?: number;
  } = {}
): Promise<any[]> {
  
  // **IMPORTANT**: Use more specific search terms based on query intent
  const searchQuery = this.buildTargetedSearchQuery(query, keyTerms);
  
  this.logger.log(`Searching knowledge base with targeted query: "${searchQuery}"`);
  
  const results = await this.knowledgeBaseService.searchDocuments(
    searchQuery,
    {
      ...options,
      limit: (options.limit || 3) * 2 // Get more candidates for better filtering
    }
  );
  
  // **NEW**: Re-rank results based on actual relevance to the user query
  const rerankedResults = results.map(doc => ({
    ...doc,
    relevanceScore: this.calculateDocumentRelevance(query, keyTerms, doc)
  }))
  .filter(doc => doc.relevanceScore > 0.2) // Filter out irrelevant docs
  .sort((a, b) => b.relevanceScore - a.relevanceScore)
  .slice(0, options.limit || 3);
  
  this.logger.log(`Re-ranked ${results.length} -> ${rerankedResults.length} documents`);
  
  return rerankedResults;
}

// **NEW**: Build more targeted search queries
private buildTargetedSearchQuery(originalQuery: string, keyTerms: string[]): string {
  const query = originalQuery.toLowerCase();
  
  // For "what is staffluent" queries, search for overview/general content
  if (query.includes('what is staffluent') || query.includes('about staffluent')) {
    return 'staffluent overview platform workforce management what is';
  }
  
  // For feature questions, be more specific
  if (query.includes('chat') || query.includes('communication') || query.includes('messaging')) {
    return 'communication chat messaging features team collaboration';
  }
  
  if (query.includes('project')) {
    return 'project management features create assign track';
  }
  
  if (query.includes('task')) {
    return 'task management create assign priority tracking';
  }
  
  if (query.includes('team')) {
    return 'team management members staff organization roles';
  }
  
  if (query.includes('time')) {
    return 'time tracking attendance timesheet clock';
  }
  
  // Default: use key terms
  return keyTerms.length > 0 ? keyTerms.join(' ') : originalQuery;
}

// **NEW**: Calculate document relevance to user query
private calculateDocumentRelevance(
  userQuery: string, 
  keyTerms: string[], 
  doc: any
): number {
  const title = (doc.title || '').toLowerCase();
  const content = (doc.content || '').toLowerCase();
  const categories = doc.categories || [];
  const keywords = doc.keywords || [];
  
  let score = 0;
  
  // 1. Title relevance (highest weight)
  for (const term of keyTerms) {
    if (title.includes(term)) {
      score += 0.4;
    }
  }
  
  // 2. Exact query match in title
  if (title.includes(userQuery)) {
    score += 0.3;
  }
  
  // 3. Category relevance
  const relevantCategories = this.getRelevantCategories(userQuery, keyTerms);
  const categoryMatches = categories.filter(cat => relevantCategories.includes(cat)).length;
  if (categoryMatches > 0) {
    score += categoryMatches * 0.2;
  }
  
  // 4. Keyword relevance
  const keywordMatches = keyTerms.filter(term =>
    keywords.some(keyword => keyword.toLowerCase().includes(term))
  ).length;
  if (keyTerms.length > 0) {
    score += (keywordMatches / keyTerms.length) * 0.3;
  }
  
  // 5. Content relevance (lower weight)
  for (const term of keyTerms) {
    const occurrences = (content.match(new RegExp(term, 'gi')) || []).length;
    score += Math.min(occurrences * 0.05, 0.2); // Cap content score
  }
  
  // 6. Document type bonuses
  if (userQuery.includes('what is') && (title.includes('overview') || title.includes('guide'))) {
    score += 0.3;
  }
  
  return Math.min(1.0, score);
}

// **NEW**: Get relevant categories based on query
private getRelevantCategories(query: string, keyTerms: string[]): string[] {
  const categories = [];
  
  if (query.includes('chat') || query.includes('communication') || query.includes('messaging')) {
    categories.push('communication', 'features');
  }
  
  if (query.includes('project')) {
    categories.push('project_management', 'features');
  }
  
  if (query.includes('task')) {
    categories.push('task_management', 'features');
  }
  
  if (query.includes('team')) {
    categories.push('team_management', 'features');
  }
  
  if (query.includes('time')) {
    categories.push('time_tracking', 'features');
  }
  
  if (query.includes('what is') || query.includes('about') || query.includes('overview')) {
    categories.push('general', 'overview');
  }
  
  return categories;
}

  /**
 * IMPROVED: Much more flexible validation for learned responses
 */
private validateLearnedResponseImproved(
  query: string, 
  learnedResponse: any, 
  queryTerms: string[]
): boolean {
  const response = learnedResponse.response?.toLowerCase() || '';
  const originalQuery = learnedResponse.query?.toLowerCase() || '';
  
  // RULE 1: Block only obviously bad responses (the ones we specifically cleaned up)
  const obviouslyBadPatterns = [
    /yes i know about sports/i,
    /purpose of this chat is to help only about.*staffluent/i,
    /i don't know about.*but.*staffluent/i
  ];
  
  for (const pattern of obviouslyBadPatterns) {
    if (pattern.test(response)) {
      this.logger.warn(`Blocking learned response for bad pattern: ${pattern.source}`);
      return false;
    }
  }
  
  // RULE 2: Block responses that mention completely unrelated topics (but be more lenient)
  const completelyUnrelatedTerms = ['sports', 'weather', 'cooking', 'politics'];
  const hasUnrelatedTerm = completelyUnrelatedTerms.some(term => 
    response.includes(term) && !query.includes(term) && !originalQuery.includes(term)
  );
  
  if (hasUnrelatedTerm) {
    this.logger.warn(`Blocking learned response for unrelated term in: "${response.substring(0, 50)}..."`);
    return false;
  }
  
  // RULE 3: Only block very low similarity scores (lowered threshold)
  if (learnedResponse.similarity && learnedResponse.similarity < 0.25) {
    this.logger.warn(`Blocking learned response for very low similarity: ${learnedResponse.similarity}`);
    return false;
  }
  
  // RULE 4: Block empty or very short responses
  if (!response || response.trim().length < 10) {
    this.logger.warn(`Blocking learned response for being too short: "${response}"`);
    return false;
  }
  
  // RULE 5: Allow responses that mention Staffluent or business features (be permissive)
  const businessTerms = ['staffluent', 'project', 'task', 'team', 'time', 'communication', 'chat', 'report', 'dashboard'];
  const mentionsBusinessTerms = businessTerms.some(term => 
    response.includes(term) || originalQuery.includes(term)
  );
  
  if (mentionsBusinessTerms) {
    this.logger.log(`Allowing learned response that mentions business terms`);
    return true;
  }
  
  // RULE 6: For general queries, be more permissive about term matching
  if (queryTerms.length <= 2) {
    // Short queries get more leniency
    return true;
  }
  
  // RULE 7: Check if there's at least some relevance between queries
  const originalQueryTerms = this.extractKeyTerms(originalQuery);
  const sharedTerms = queryTerms.filter(term => 
    originalQueryTerms.includes(term) && term.length > 2
  );
  
  // Allow if there's any shared term or if it's a common conversational response
  const isConversationalResponse = response.includes('help') || 
                                  response.includes('assist') || 
                                  response.includes('can') ||
                                  response.includes('staffluent');
  
  if (sharedTerms.length > 0 || isConversationalResponse) {
    return true;
  }
  
  // Log rejected responses for debugging
  this.logger.log(`Learned response validation details for query "${query}":`, {
    originalQuery,
    response: response.substring(0, 100),
    similarity: learnedResponse.similarity,
    sharedTerms,
    queryTerms,
    originalQueryTerms
  });
  
  // Default to allowing (be permissive rather than restrictive)
  return true;
}

/**
 * NEW: Generate suggestions from learned responses
 */
private getSuggestionsFromLearnedResponse(learnedResponse: any): { id: string; text: string }[] {
  const suggestions = [];
  const response = learnedResponse.response?.toLowerCase() || '';
  const category = learnedResponse.category || 'general';
  
  // Generate suggestions based on the response content
  if (response.includes('project')) {
    suggestions.push({ id: 'projects', text: 'More about projects' });
  }
  
  if (response.includes('task')) {
    suggestions.push({ id: 'tasks', text: 'Task management' });
  }
  
  if (response.includes('team')) {
    suggestions.push({ id: 'teams', text: 'Team features' });
  }
  
  if (response.includes('time') || response.includes('track')) {
    suggestions.push({ id: 'time', text: 'Time tracking' });
  }
  
  if (response.includes('chat') || response.includes('communication') || response.includes('message')) {
    suggestions.push({ id: 'communication', text: 'Communication features' });
  }
  
  if (response.includes('report') || response.includes('analytics')) {
    suggestions.push({ id: 'reports', text: 'Reports & analytics' });
  }
  
  // Add category-based suggestions
  const categoryMap = {
    'projects': 'Project help',
    'tasks': 'Task help', 
    'teams': 'Team management',
    'time': 'Time tracking',
    'communication': 'Communication features',
    'reports': 'Reports & analytics'
  };
  
  if (categoryMap[category] && !suggestions.some(s => s.text === categoryMap[category])) {
    suggestions.push({ id: category, text: categoryMap[category] });
  }
  
  // Always add a help option if we don't have enough suggestions
  if (suggestions.length < 3) {
    suggestions.push({ id: 'help', text: 'Need more help?' });
  }
  
  return suggestions.slice(0, 4); // Limit to 4 suggestions
}


  /**
   * NEW: Determine if question should use knowledge base first
   */
  private shouldUseKnowledgeFirst(message: string, keyTerms: string[]): boolean {
    // Questions about Staffluent features should always check knowledge first
    const featureQuestions = [
      'do you offer', 'does staffluent have', 'what features', 'can staffluent',
      'is there a', 'how does staffluent', 'what is staffluent', 'tell me about staffluent',
      'explain staffluent', 'describe staffluent', 'show me staffluent', 'what are the',
      'do you have', 'does it have', 'can i', 'how do i', 'where can i'
    ];
    
    const staffluentFeatures = [
      'chat', 'communication', 'messaging', 'project', 'task', 'time',
      'team', 'report', 'dashboard', 'client', 'field', 'mobile',
      'analytics', 'schedule', 'calendar', 'invoice', 'equipment',
      'quality', 'inspection', 'attendance', 'timesheet', 'overtime'
    ];
    
    // Check for feature inquiry patterns
    for (const pattern of featureQuestions) {
      if (message.includes(pattern)) {
        // And if it mentions Staffluent features
        for (const feature of staffluentFeatures) {
          if (message.includes(feature) || keyTerms.includes(feature)) {
            return true;
          }
        }
      }
    }
    
    // Also prioritize knowledge for direct feature questions
    if (staffluentFeatures.some(feature => message.includes(feature))) {
      return true;
    }
    
    return false;
  }

  /**
   * NEW: Validate if a learned response makes sense for the query
   */
  private validateLearnedResponse(
    query: string, 
    learnedResponse: any, 
    queryTerms: string[]
  ): boolean {
    const response = learnedResponse.response?.toLowerCase() || '';
    const originalQuery = learnedResponse.query?.toLowerCase() || '';
    
    // Rule 1: Response shouldn't mention unrelated topics
    const unrelatedTerms = ['sports', 'weather', 'cooking', 'politics', 'entertainment', 'music', 'movies'];
    for (const term of unrelatedTerms) {
      if (response.includes(term) && !query.includes(term)) {
        this.logger.warn(`Rejecting learned response for unrelated term: ${term}`);
        return false;
      }
    }
    
    // Rule 2: If query asks about specific features, response should be relevant
    const featureTerms = ['chat', 'project', 'task', 'time', 'team', 'report', 'dashboard', 'communication'];
    const queryHasFeature = queryTerms.some(term => featureTerms.includes(term));
    const responseHasFeature = featureTerms.some(term => response.includes(term));
    
    if (queryHasFeature && !responseHasFeature && !response.includes('staffluent')) {
      this.logger.warn(`Rejecting learned response for feature mismatch. Query has feature: ${queryHasFeature}, Response has feature: ${responseHasFeature}`);
      return false;
    }
    
    // Rule 3: Minimum similarity check (if available)
    if (learnedResponse.similarity && learnedResponse.similarity < 0.6) {
      this.logger.warn(`Rejecting learned response for low similarity: ${learnedResponse.similarity}`);
      return false;
    }
    
    // Rule 4: Query and learned query should share at least one meaningful term
    const originalQueryTerms = this.extractKeyTerms(originalQuery);
    const sharedTerms = queryTerms.filter(term => 
      originalQueryTerms.includes(term) && term.length > 3
    );
    
    if (sharedTerms.length === 0 && queryTerms.length > 1) {
      this.logger.warn(`Rejecting learned response for no shared meaningful terms`);
      return false;
    }
    
    // Rule 5: Response shouldn't be a generic rejection if query is specific
    if (response.includes('purpose of this chat') && queryTerms.some(term => featureTerms.includes(term))) {
      this.logger.warn(`Rejecting generic rejection response for specific feature query`);
      return false;
    }
    
    return true;
  }

  /**
 * ENHANCED: Better logging for response quality with learned responses
 */
private async logResponseQuality(
  query: string,
  response: string,
  source: string,
  confidence: number
): Promise<void> {
  // Log suspicious responses
  const suspiciousTerms = ['sports', 'weather', 'cooking', 'politics', 'entertainment'];
  const hasSuspiciousTerm = suspiciousTerms.some(term => response.toLowerCase().includes(term));
  
  if (source === 'learned' && hasSuspiciousTerm) {
    this.logger.warn(`Suspicious learned response detected:`, {
      query,
      response: response.substring(0, 100),
      source,
      confidence,
      suspicious: true
    });
  }
  
  // Log successful learned responses
  if (source === 'learned' && !hasSuspiciousTerm) {
    this.logger.log(`Successful learned response used:`, {
      query,
      response: response.substring(0, 100),
      source,
      confidence
    });
  }
}
  /**
   * ENHANCED: Get response using the NLP system with better chat handling
   */
  private async getNlpResponse(
    normalizedMessage: string,
    keyTerms: string[],
    isFollowup: boolean,
    context: Record<string, any>,
    business: any,
    businessName: string,
    userName: string,
    platformName: string
  ): Promise<{ 
    text: string; 
    suggestions?: { id: string; text: string }[];
    confidence: number;
  }> {
    // PRIORITY: Handle chat/communication questions first
    if (normalizedMessage.includes('chat') || normalizedMessage.includes('communication') || 
        normalizedMessage.includes('messaging') || normalizedMessage.includes('talk') ||
        normalizedMessage.includes('message') || normalizedMessage.includes('communicate')) {
      
      return {
        text: `Yes! ${platformName} includes a comprehensive Communication Hub that allows ${businessName} teams to chat, share files, and collaborate. You can have team chats, project-specific channels, and even communicate with clients directly through the platform.`,
        suggestions: [
          { id: 'team_chat', text: 'Team chat features' },
          { id: 'client_communication', text: 'Client communication' },
          { id: 'project_channels', text: 'Project-specific channels' },
          { id: 'file_sharing', text: 'File sharing capabilities' }
        ],
        confidence: 0.9
      };
    }

    // Enhanced response templates with better categorization and variations
    const responseCategories = {
      // Greeting responses
      greeting: [
        {
          keywords: ['hello', 'hi', 'hey', 'greetings', 'howdy'],
          response: {
            text: `Hello ${userName}! I'm the ${platformName} assistant for ${businessName}. How can I help you today?`,
            suggestions: [
              { id: 'projects', text: 'Tell me about projects' },
              { id: 'tasks', text: 'Task management' },
              { id: 'timeTracking', text: 'Time tracking help' },
              { id: 'teams', text: 'Team management' }
            ]
          }
        }
      ],
      
      // Project management responses
      projects: [
        {
          keywords: ['project', 'projects', 'project management'],
          response: {
            text: `${platformName} provides ${businessName} with comprehensive project management tools. You can create projects, assign teams, track progress, and manage tasks.`,
            suggestions: [
              { id: 'create_project', text: 'Create a new project' },
              { id: 'view_projects', text: 'View my projects' },
              { id: 'project_reports', text: 'Project reports' }
            ]
          }
        },
        {
          keywords: ['create project', 'new project', 'add project', 'start project'],
          response: {
            text: `Creating a new project in ${platformName} is easy. Just go to the Projects section, click "Create Project", and fill in the details like name, description, start/end dates, and team members.`,
            suggestions: [
              { id: 'project_template', text: 'Use a project template' },
              { id: 'project_settings', text: 'Project settings' },
              { id: 'project_team', text: 'Assign team members' }
            ]
          }
        }
      ],
      
      // Task management responses
      tasks: [
        {
          keywords: ['task', 'tasks', 'todo', 'assignment', 'assign'],
          response: {
            text: `With ${platformName}, tasks for ${businessName} can be created, assigned, prioritized, and tracked to completion.`,
            suggestions: [
              { id: 'create_task', text: 'Create a task' },
              { id: 'assign_task', text: 'Assign tasks' },
              { id: 'track_tasks', text: 'Track task completion' }
            ]
          }
        },
        {
          keywords: ['create task', 'new task', 'add task', 'assign task'],
          response: {
            text: `To create a new task in ${platformName}, navigate to the Tasks section or a specific project, click "New Task", and enter details like name, description, due date, priority, and assignee.`,
            suggestions: [
              { id: 'task_priority', text: 'Set task priority' },
              { id: 'recurring_tasks', text: 'Create recurring tasks' },
              { id: 'task_dependencies', text: 'Set task dependencies' }
            ]
          }
        }
      ],
      
      // Time tracking responses
      timeTracking: [
        {
          keywords: ['time', 'clock', 'hours', 'timesheet', 'tracking', 'attendance'],
          response: {
            text: `${platformName}'s time tracking system lets ${businessName} employees clock in/out, manage breaks, and review timesheets.`,
            suggestions: [
              { id: 'time_clock', text: 'Clock in/out' },
              { id: 'breaks', text: 'Manage breaks' },
              { id: 'timesheets', text: 'View timesheets' }
            ]
          }
        },
        {
          keywords: ['clock in', 'clock out', 'time entry', 'log hours', 'record time'],
          response: {
            text: `With ${platformName}, you can easily clock in and out using the web app or mobile app. Your time entries are automatically logged and can be associated with specific projects or tasks.`,
            suggestions: [
              { id: 'timesheet_approval', text: 'Timesheet approval' },
              { id: 'time_reports', text: 'Time reports' },
              { id: 'overtime_tracking', text: 'Overtime tracking' }
            ]
          }
        }
      ],
      
      // Team management responses
      teams: [
        {
          keywords: ['team', 'staff', 'employee', 'member', 'personnel'],
          response: {
            text: `Using ${platformName}, ${businessName} can organize staff into departments and teams, assign leaders, and monitor performance.`,
            suggestions: [
              { id: 'view_team', text: 'View my team' },
              { id: 'add_member', text: 'Add team member' },
              { id: 'team_schedule', text: 'Team scheduling' }
            ]
          }
        },
        {
          keywords: ['add employee', 'new member', 'hire', 'add to team', 'invite team'],
          response: {
            text: `To add a new team member in ${platformName}, go to the Team Management section, click "Add Member", and enter their information. You can assign them to specific departments, teams, and roles.`,
            suggestions: [
              { id: 'team_roles', text: 'Define team roles' },
              { id: 'team_permissions', text: 'Set permissions' },
              { id: 'team_onboarding', text: 'Team onboarding' }
            ]
          }
        }
      ],
      
      // Communication Hub responses (ENHANCED)
      communication: [
        {
          keywords: ['chat', 'message', 'communicate', 'talk', 'messaging', 'communication'],
          response: {
            text: `${platformName}'s Communication Hub provides ${businessName} with comprehensive messaging capabilities including team chat, project-specific channels, client communication, file sharing, and mobile notifications.`,
            suggestions: [
              { id: 'team_chat', text: 'Team chat features' },
              { id: 'client_chat', text: 'Client communication' },
              { id: 'project_channels', text: 'Project channels' },
              { id: 'file_sharing', text: 'File sharing' }
            ]
          }
        }
      ],
      
      // Features responses (ENHANCED)
      features: [
        {
          keywords: ['features', 'capabilities', 'what can it do', 'functionality', 'tools', 'modules'],
          response: {
            text: `Staffluent offers comprehensive features for ${businessName}: project management, task tracking, time & attendance, team management, communication hub, field service operations, client management, reporting & analytics, quality control, and equipment management. Which feature interests you most?`,
            suggestions: [
              { id: 'projects', text: 'Project management' },
              { id: 'communication', text: 'Communication features' },
              { id: 'time', text: 'Time tracking' },
              { id: 'teams', text: 'Team management' }
            ]
          }
        }
      ],
      
      // Help and support responses
      help: [
        {
          keywords: ['help', 'support', 'assistance', 'guide', 'tutorial', 'how to', 'how do i'],
          response: {
            text: `I can help with how ${businessName} can use ${platformName} for managing projects, tracking time, organizing teams, communication, and more. What do you need help with?`,
            suggestions: [
              { id: 'projects_help', text: 'Projects help' },
              { id: 'communication_help', text: 'Communication help' },
              { id: 'time_help', text: 'Time tracking help' },
              { id: 'teams_help', text: 'Team management help' }
            ]
          }
        }
      ],
      
      // About Staffluent responses
      about: [
        {
          keywords: ['what is staffluent', 'what does staffluent do', 'what\'s staffluent', 'explain staffluent', 'about staffluent'],
          response: {
            text: `Staffluent is a comprehensive workforce management platform that helps ${businessName} manage projects, tasks, teams, time tracking, field service operations, client relationships, and more. It includes communication tools, analytics, and mobile capabilities to streamline operations and improve productivity.`,
            suggestions: [
              { id: 'core_features', text: 'Core features' },
              { id: 'communication_features', text: 'Communication features' },
              { id: 'benefits', text: 'Key benefits' },
              { id: 'tour', text: 'Take a tour' }
            ]
          }
        }
      ],
      
      // Conversational responses
      conversation: [
        {
          keywords: ['how are you', 'how\'s it going', 'how are things', 'how do you do', 'what\'s up', 'how you doing'],
          response: {
            text: `I'm doing well, thanks for asking! I'm here to help with any questions you have about ${platformName} for ${businessName}. How can I assist you today?`,
            suggestions: [
              { id: 'help', text: 'What can you help with?' },
              { id: 'features', text: 'Show me key features' },
              { id: 'get_started', text: 'How do I get started?' }
            ]
          }
        },
        {
          keywords: ['who are you', 'what are you', 'what is this', 'what can you do', 'what do you do'],
          response: {
            text: `I'm your ${platformName} assistant for ${businessName}. I can help with questions about projects, tasks, time tracking, team management, communication features, and more. What would you like to know about?`,
            suggestions: [
              { id: 'features', text: 'What features do you offer?' },
              { id: 'communication', text: 'Communication capabilities' },
              { id: 'start', text: 'Help me get started' },
              { id: 'support', text: 'I need support' }
            ]
          }
        }
      ],
      
      // Thank you responses
      gratitude: [
        {
          keywords: ['thank you', 'thanks', 'appreciate it', 'awesome', 'great', 'thank', 'thx'],
          response: {
            text: `You're welcome! I'm happy to help. Is there anything else you'd like to know about ${platformName}?`,
            suggestions: [
              { id: 'more_help', text: 'I need more help' },
              { id: 'features', text: 'Show me features' },
              { id: 'no_thanks', text: 'That\'s all for now' }
            ]
          }
        }
      ]
    };
    
    // Flatten all response rules from categories for processing
    const allResponseRules = Object.values(responseCategories).flat();
    
    // Check if we're in a specific view context
  if (context?.currentView) {
    const viewResponses = this.getViewSpecificResponses(
      context.currentView, 
      business?.operationType, 
      userName,
      businessName
    );
    
    // Only return view response for basic greetings, NOT help requests
    if (viewResponses && (normalizedMessage.includes('hello') || normalizedMessage.includes('hi') || 
        normalizedMessage.length < 5)) {
      return {
        ...viewResponses,
        confidence: 0.9
      };
    }
  }
    // Find best matching responses based on keyword relevance
    const scoredResponses = allResponseRules.map(rule => ({
      rule,
      score: this.calculateRelevanceScore(keyTerms, rule.keywords)
    }))
    .filter(item => item.score > 0.2) // Filter out low-scoring matches
    .sort((a, b) => b.score - a.score); // Sort by score descending
    
    // Get top matches (up to 3)
    const topMatches = scoredResponses.slice(0, 3);
    
    // If we found a reasonable match, use it
    if (topMatches.length > 0 && topMatches[0].score > 0.3) {
      const bestMatch = topMatches[0].rule;
      
      // If this appears to be a follow-up question, adapt the response style
      if (isFollowup) {
        const response = { ...bestMatch.response };
        // Remove greeting prefixes for follow-up questions
        response.text = response.text.replace(`Hello ${userName}! `, '').replace(`Hi there! `, '');
        
        // If we have multiple good matches, include information from second best match
        if (topMatches.length > 1 && topMatches[1].score > 0.5) {
          const secondBestSuggestions = topMatches[1].rule.response.suggestions || [];
          response.suggestions = [...(response.suggestions || []), ...secondBestSuggestions].slice(0, 4);
        }
        
        return {
          ...response,
          confidence: topMatches[0].score
        };
      }
      
      // Regular (non-followup) response
      return {
        ...bestMatch.response,
        confidence: topMatches[0].score
      };
    }
    
    // See if this is asking about something specific like "how to create a project"
    const specificResponses = this.checkForSpecificQuestions(normalizedMessage, businessName);
    
    if (specificResponses) {
      return {
        ...specificResponses,
        confidence: 0.8
      };
    }
    
    // Default response if no good match
    return {
      text: `I'm not sure I understand your question about "${normalizedMessage}". Could you try rephrasing or select one of these options?`,
      suggestions: [
        { id: 'help', text: 'Show all help topics' },
        { id: 'features', text: 'What features do you offer?' },
        { id: 'communication', text: 'Communication capabilities' },
        { id: 'projects', text: 'Projects' },
        { id: 'tasks', text: 'Tasks' },
        { id: 'time', text: 'Time tracking' }
      ],
      confidence: 0.1 // Low confidence
    };
  }
  
  /**
   * Determine if this is a casual conversational query
   */
  private isConversationalQuery(message: string): boolean {
    const conversationalPatterns = [
      /^how are you/i,
      /^how('s| is) it going/i,
      /^how('s| is your) day/i,
      /^what('s| is) up/i,
      /^how have you been/i,
      /^how do you do/i,
      /^how('s| is) life/i,
      /^good (morning|afternoon|evening)/i,
      /^(hi|hey|hello)/i,
      /^nice to (meet|see) you/i,
      /^(how are things|are you good)/i,
      /^(yo|greetings|howdy)/i
    ];
    
    return conversationalPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Enhanced method: Check if this is a closure or goodbye message
   */
  private isClosureMessage(message: string): boolean {
    const closurePatterns = [
      /^(that('s| is) all( for now)?)/i,
      /^(no( thanks)?)/i,
      /^(nothing( else)?( for now)?)/i,
      /^(i('m| am) good( for now)?)/i,
      /^(no more( questions)?)/i,
      /^(bye|goodbye|see you( later)?)/i,
      /^(thanks?,? that('s| is| will be) (all|it|everything|helpful))/i,
      /^(ok|okay|got it)$/i
    ];
    
    return closurePatterns.some(pattern => pattern.test(message));
  }

  /**
   * Get response for a closure message
   */
  private getClosureResponse(
    userName: string,
    businessName: string,
    platformName: string
  ): { text: string; suggestions: { id: string; text: string }[] } {
    return {
      text: `I'm glad I could help, ${userName}! Feel free to reach out anytime you have questions about ${platformName}. Have a great day!`,
      suggestions: [
        { id: 'new_question', text: 'I have another question' },
        { id: 'feedback', text: 'Provide feedback' }
      ]
    };
  }

  /**
   * Get response for casual conversation
   */
  private getConversationalResponse(
    message: string,
    userName: string,
    businessName: string,
    platformName: string
  ): { text: string; suggestions: { id: string; text: string }[] } | null {
    
    // Greeting patterns
    if (/^(hi|hey|hello|greetings|howdy)/i.test(message)) {
      return {
        text: `Hello ${userName}! I'm the ${platformName} assistant for ${businessName}. How can I help you today?`,
        suggestions: [
          { id: 'features', text: 'What can you help with?' },
          { id: 'get_started', text: 'Getting started with Staffluent' },
          { id: 'communication', text: 'Communication features' },
          { id: 'learn_more', text: 'Tell me about Staffluent' }
        ]
      };
    }
    
    // How are you patterns
    if (/how are you|how's it going|how have you been|how's your day|how do you do/i.test(message)) {
      return {
        text: `I'm doing well, thanks for asking, ${userName}! I'm here to help you with anything related to ${platformName}. What would you like assistance with today?`,
        suggestions: [
          { id: 'features', text: 'Show me key features' },
          { id: 'communication', text: 'Communication capabilities' },
          { id: 'help', text: 'I need help with something' },
          { id: 'learn', text: 'Learn about Staffluent' }
        ]
      };
    }
    
    // What's up patterns
    if (/what('s| is) up|what's happening/i.test(message)) {
      return {
        text: `Not much, just here to help you with ${platformName}! I can assist with projects, time tracking, team management, communication features, and more. What are you working on today?`,
        suggestions: [
          { id: 'projects', text: 'Project management' },
          { id: 'communication', text: 'Communication features' },
          { id: 'time', text: 'Time tracking' },
          { id: 'teams', text: 'Team management' }
        ]
      };
    }
    
    // Good morning/afternoon/evening
    if (/good (morning|afternoon|evening)/i.test(message)) {
      const timeOfDay = message.match(/good (morning|afternoon|evening)/i)[1];
      return {
        text: `Good ${timeOfDay}, ${userName}! I hope you're having a great day. I'm ready to help you with ${platformName} for ${businessName}. What can I assist you with?`,
        suggestions: [
          { id: 'dashboardHelp', text: 'Dashboard overview' },
          { id: 'quickStart', text: 'Quick start guide' },
          { id: 'communication', text: 'Communication features' },
          { id: 'projectsHelp', text: 'Help with projects' }
        ]
      };
    }
    
    // If no specific conversational pattern matched
    return null;
  }

  /**
   * Enhanced method: Check if this is a follow-up question based on conversation history
   */
  private isFollowupQuestion(context: Record<string, any>): boolean {
    if (!context?.conversationHistory || context.conversationHistory.length < 2) {
      return false;
    }

    // Get the most recent messages (last 3)
    const recentMessages = context.conversationHistory.slice(-3);
    const hasRecentBotMessage = recentMessages.some(msg => msg.sender === 'bot');
    const hasRecentUserMessage = recentMessages.some(msg => msg.sender === 'user');
    
    // Check for basic exchange pattern
    const hasRecentExchange = hasRecentBotMessage && hasRecentUserMessage;
    
    // Enhanced check for the most recent user message
    const latestUserMessage = [...recentMessages].reverse().find(msg => msg.sender === 'user');
    
    if (latestUserMessage) {
      const message = latestUserMessage.content.toLowerCase().trim();
      
      // 1. Check for very short queries (likely follow-ups)
      if (message.split(' ').length <= 3) {
        return true;
      }
      
      // 2. Check for queries that start with follow-up indicators
      const followupPrefixes = [
        'why', 'how', 'what about', 'and', 'but', 'then', 'so',
        'can you', 'could you', 'would', 'is it', 'are they', 
        'does it', 'do they', 'explain', 'elaborate'
      ];
      
      for (const prefix of followupPrefixes) {
        if (message.startsWith(prefix)) {
          return true;
        }
      }
      
      // 3. Check for queries containing follow-up phrases
      const followupPhrases = [
        ' instead', ' as well', ' also', ' too', ' more',
        ' again', ' besides', ' additionally', ' further',
        ' else', ' other than', ' apart from'
      ];
      
      for (const phrase of followupPhrases) {
        if (message.includes(phrase)) {
          return true;
        }
      }
      
      // 4. Check for pronouns without clear subjects
      const standalonePronouns = [
        'it', 'they', 'them', 'those', 'these', 'that', 'this',
        'he', 'she', 'his', 'her', 'its', 'their', 'which'
      ];
      
      for (const pronoun of standalonePronouns) {
        const pronounPattern = new RegExp(`(^${pronoun}\\b|\\s${pronoun}\\s)`, 'i');
        if (pronounPattern.test(message)) {
          const hasSubject = message.includes('project') || 
                             message.includes('task') || 
                             message.includes('team') || 
                             message.includes('feature') ||
                             message.includes('staffluent');
          
          if (!hasSubject) {
            return true;
          }
        }
      }
    }

    return hasRecentExchange;
  }

  /**
   * Format knowledge document content into a conversational response
   */
  private formatKnowledgeResponse(
    content: string,
    businessName: string,
    userName: string,
    platformName: string
  ): string {
    // Replace placeholders
    let response = content
      .replace(/{businessName}/g, businessName)
      .replace(/{userName}/g, userName)
      .replace(/{platformName}/g, platformName);
    
    // If content is too long, summarize it
    if (response.length > 500) {
      const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      if (sentences.length > 5) {
        // Use first 2-3 sentences for a brief summary
        response = sentences.slice(0, 3).join('. ') + '.';
        
        // Add a concluding sentence
        response += " I hope this helps! Let me know if you'd like more details.";
      }
    }
    
    // Add a personal touch for better engagement
    if (!response.includes(userName) && !response.includes('you')) {
      response = `${userName}, ${response.charAt(0).toLowerCase() + response.slice(1)}`;
    }
    
    // Improve readability for technical content
    if (response.includes('API') || response.includes('config') || response.includes('settings')) {
      response += " Would you like me to explain any specific part in more detail?";
    }
    
    return response;
  }

  /**
   * Extract suggestions from a knowledge document
   */
  private getSuggestionsFromDocument(doc: any): { id: string; text: string }[] {
    const suggestions = [];
    const content = doc.content || '';
    
    // Look for specific actions in the content
    if (content.includes('create') || content.includes('add') || content.includes('set up')) {
      suggestions.push({
        id: 'action_create',
        text: content.includes('project') ? 'Create a project' : 
              content.includes('task') ? 'Create a task' :
              content.includes('team') ? 'Add team member' : 'Create new'
      });
    }
    
    if (content.includes('view') || content.includes('see') || content.includes('check')) {
      suggestions.push({
        id: 'action_view',
        text: content.includes('project') ? 'View projects' : 
              content.includes('task') ? 'View tasks' :
              content.includes('team') ? 'View team' : 
              content.includes('report') ? 'View reports' : 'View dashboard'
      });
    }
    
    if (content.includes('export') || content.includes('download') || content.includes('share')) {
      suggestions.push({
        id: 'action_export',
        text: content.includes('report') ? 'Export report' : 
              content.includes('data') ? 'Export data' : 'Share'
      });
    }
    
    // Add communication-specific suggestions
    if (content.includes('chat') || content.includes('communication') || content.includes('message')) {
      suggestions.push({
        id: 'communication_features',
        text: 'Communication features'
      });
    }
    
    // Add a "Tell me more" suggestion if we don't have any action suggestions yet
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'more_info',
        text: 'Tell me more about this'
      });
    }
    
    return suggestions.slice(0, 4); // Limit to max 4 suggestions
  }

  /**
   * Check for specific how-to questions
   */
  private checkForSpecificQuestions(message: string, businessName: string = 'your business'): { text: string; suggestions?: { id: string; text: string }[] } | null {
    const howToCreate = /how\s+(?:do\s+i|to|can\s+i)\s+create\s+(?:a|an)?\s+(\w+)/i;
    const howToManage = /how\s+(?:do\s+i|to|can\s+i)\s+manage\s+(?:a|an)?\s+(\w+)/i;
    const howToTrack = /how\s+(?:do\s+i|to|can\s+i)\s+track\s+(?:a|an)?\s+(\w+)/i;
    
    let match;
    
    if ((match = howToCreate.exec(message)) !== null) {
      const item = match[1].toLowerCase();
      if (item === 'project' || item === 'projects') {
        return {
          text: `To create a new project for ${businessName}, go to the Projects section in Staffluent and click the 'Create Project' button. You'll need to fill in project details such as name, description, start and end dates, and assign team members.`,
          suggestions: [
            { id: 'project_template', text: 'Use project template' },
            { id: 'project_settings', text: 'Project settings' }
          ]
        };
      } else if (item === 'task' || item === 'tasks') {
        return {
          text: `To create a task for ${businessName}, navigate to the Tasks section in Staffluent and click 'New Task'. You can set a name, description, due date, priority level, and assign it to team members.`,
          suggestions: [
            { id: 'task_priority', text: 'Set task priority' },
            { id: 'task_assignment', text: 'Task assignment' }
          ]
        };
      } else if (item === 'team' || item === 'teams') {
        return {
          text: `To create a new team for ${businessName}, go to the Team Management section in Staffluent and select 'Create Team'. You'll need to provide a team name, select a department, and add team members.`,
          suggestions: [
            { id: 'team_structure', text: 'Team structure' },
            { id: 'team_roles', text: 'Define team roles' }
          ]
        };
      }
    }
    
    return null;
  }

  /**
   * Enhanced method: Extract key terms from message for better matching
   */
  private extractKeyTerms(message: string): string[] {
    // Business domain specific terms to prioritize
    const businessTerms = new Set([
      'project', 'task', 'team', 'time', 'track', 'management', 'client',
      'report', 'schedule', 'staff', 'equipment', 'field', 'service',
      'quality', 'inspection', 'analytics', 'dashboard', 'feature',
      'assign', 'create', 'update', 'delete', 'view', 'employee',
      'invoice', 'attendance', 'timesheet', 'break', 'overtime',
      'compliance', 'billing', 'maintenance', 'workflow', 'chat',
      'communication', 'message', 'messaging', 'talk', 'communicate'
    ]);

    // Enhanced stopwords list
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where',  
      'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 
      'can', 'will', 'just', 'should', 'now', 'about', 'which',
      'i', 'me', 'my', 'mine', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'it', 'its', 'itself',
      'for', 'of', 'with', 'by', 'at', 'from', 'to', 'in', 'on', 'up', 'down',
      'this', 'that', 'these', 'those', 'there', 'here', 'get', 'got', 'have',
      'has', 'had', 'did', 'does', 'do', 'am', 'having', 'being', 'doing',
      'could', 'would', 'should', 'may', 'might', 'must', 'shall'
    ]);
    
    // Preserve important conversational keywords
    const preserveWords = new Set([
      'how', 'what', 'who', 'why', 'when', 'where', 'which', 'help', 'thanks', 
      'thank', 'hi', 'hello', 'hey', 'create', 'add', 'new', 'set', 'update', 
      'track', 'view', 'show', 'find', 'manage', 'offer', 'have', 'does'
    ]);
    
    // Improved tokenization
    const tokenized = message.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/); // Split by whitespace
    
    // Filter individual tokens using improved criteria
    const filteredTokens = tokenized.filter(word => {
      return preserveWords.has(word) || 
             businessTerms.has(word) || 
             (word.length > 3 && !stopWords.has(word));
    });
    
    // Check for common action phrases
    const actionPhrases = [
      'how to', 'show me', 'help with', 'need to',
      'want to', 'looking for', 'trying to',
      'create new', 'set up', 'tell me about',
      'do you offer', 'does staffluent have'
    ];
    
    const normalizedMessage = message.toLowerCase();
    for (const phrase of actionPhrases) {
      if (normalizedMessage.includes(phrase)) {
        filteredTokens.push(phrase);
      }
    }
    
    return [...new Set(filteredTokens)];
  }

  /**
   * Enhanced method: Calculate relevance score between message terms and rule keywords
   */
  private calculateRelevanceScore(terms: string[], keywords: string[]): number {
    if (!terms.length || !keywords.length) return 0;
    
    const fullMessage = terms.join(' ');
    let exactWordMatches = 0;
    let partialWordMatches = 0;
    let phraseMatches = 0;
    
    // 1. Check for exact phrase matches first
    for (const keyword of keywords) {
      if (fullMessage === keyword) {
        return 1.0; // Perfect match
      }
      
      if (keyword.includes(' ') && fullMessage.includes(keyword)) {
        phraseMatches += 1.5;
      }
    }
    
    // 2. Handle very short queries specially
    if (terms.length === 1) {
      for (const keyword of keywords) {
        if (terms[0] === keyword) {
          return 0.9;
        }
      }
    }
    
    // 3. Process individual term matches
    const keywordSet = new Set(keywords);
    const keywordParts = new Set();
    
    keywords.forEach(keyword => {
      if (keyword.includes(' ')) {
        keyword.split(' ').forEach(part => {
          if (part.length > 2) keywordParts.add(part);
        });
      }
    });
    
    for (const term of terms) {
      if (term.length < 3) continue;
      
      if (keywordSet.has(term)) {
        exactWordMatches += 1.0;
        continue;
      }
      
      if (keywordParts.has(term)) {
        exactWordMatches += 0.8;
        continue;
      }
      
      let foundPartial = false;
      for (const keyword of keywords) {
        if (keyword.startsWith(term) || term.startsWith(keyword)) {
          partialWordMatches += 0.7;
          foundPartial = true;
          break;
        }
        
        if (keyword.includes(term) || term.includes(keyword)) {
          partialWordMatches += 0.4;
          foundPartial = true;
          break;
        }
      }
      
      if (!foundPartial) {
        for (const keyword of keywords) {
          if (this.isFuzzyMatch(term, keyword)) {
            partialWordMatches += 0.3;
            break;
          }
        }
      }
    }
    
    const totalMatches = exactWordMatches + (partialWordMatches * 0.6) + phraseMatches;
    const baseScore = totalMatches / (terms.length + (keywords.length * 0.5) - phraseMatches * 0.2);
    
    const adjustments = 
      (terms.length <= 3 ? 0.15 : 0) + 
      (phraseMatches > 0 ? 0.2 : 0) + 
      (exactWordMatches > terms.length * 0.5 ? 0.1 : 0);
    
    return Math.min(1.0, Math.max(0, baseScore + adjustments));
  }

  /**
   * Check if two terms are fuzzy matches
   */
  private isFuzzyMatch(term1: string, term2: string): boolean {
    if (term1 + 's' === term2 || term1 === term2 + 's') return true;
    if (term1 + 'ing' === term2 || term1 === term2 + 'ing') return true;
    if (term1 + 'ed' === term2 || term1 === term2 + 'ed') return true;
    if (term1.endsWith('y') && term2 === term1.slice(0, -1) + 'ies') return true;
    if (term2.endsWith('y') && term1 === term2.slice(0, -1) + 'ies') return true;
    
    return false;
  }

  /**
   * Get responses specific to the current view
   */
  private getViewSpecificResponses(
    currentView: string, 
    businessType: string = 'hybrid',
    userName: string = 'there',
    businessName: string = 'your business'
  ): { text: string; suggestions?: { id: string; text: string }[] } | null {
    const viewResponses = {
      'dashboard': {
        text: `Hello ${userName}! You're currently on the Staffluent Dashboard for ${businessName}. Here you can see key metrics and an overview of your business activities.`,
        suggestions: [
          { id: 'dashboard_metrics', text: 'Explain dashboard metrics' },
          { id: 'performance_overview', text: 'Performance overview' }
        ]
      },
      'projects': {
        text: `You're in the Projects section of Staffluent. Here you can manage all ${businessName} projects and their details.`,
        suggestions: [
          { id: 'create_project', text: 'Create a new project' },
          { id: 'project_status', text: 'Update project status' }
        ]
      },
      'tasks': {
        text: `You're in the Tasks section of Staffluent. Here you can create, assign, and track tasks across your ${businessName} team.`,
        suggestions: [
          { id: 'create_task', text: 'Create a new task' },
          { id: 'assign_task', text: 'Assign a task' }
        ]
      },
      'team': {
        text: `You're in the Team section of Staffluent. Here you can manage ${businessName} team members and their assignments.`,
        suggestions: [
          { id: 'add_member', text: 'Add team member' },
          { id: 'team_schedule', text: 'Team scheduling' }
        ]
      },
      'time': {
        text: `You're in the Time Tracking section of Staffluent. Here you can manage ${businessName} attendance and timesheets.`,
        suggestions: [
          { id: 'time_entry', text: 'Enter time' },
          { id: 'view_timesheets', text: 'View timesheets' }
        ]
      }
    };

    return viewResponses[currentView] || null;
  }

  /**
   * Record feedback for a chatbot message
   */
  async recordMessageFeedback(
    businessId: string,
    clientId: string,
    messageId: string,
    wasHelpful: boolean,
    feedbackText: string | null = null
  ): Promise<void> {
    try {
      const message = await this.chatbotMessageModel.findOne({
        _id: messageId,
        businessId,
        clientId,
        sender: 'bot'
      });
      
      if (!message) {
        this.logger.warn(`Message with ID ${messageId} not found when recording feedback`);
        return;
      }
      
      const metadata = message.metadata || {};
      metadata.feedback = {
        wasHelpful,
        feedbackText,
        timestamp: new Date()
      };
      
      await this.chatbotMessageModel.updateOne(
        { _id: messageId },
        { $set: { metadata } }
      );
      
      if (metadata.sourceId && (metadata.responseSource === 'knowledge' || metadata.responseSource === 'learned')) {
        try {
          await this.knowledgeBaseService.updateResponseSuccess(metadata.sourceId, wasHelpful);
        } catch (error) {
          if (error instanceof NotFoundException) {
            this.logger.warn(`Source with ID ${metadata.sourceId} not found when recording feedback`);
          } else {
            throw error;
          }
        }
      }
      
      this.logger.log(`Feedback received for message ${messageId}: ${wasHelpful ? 'Helpful' : 'Not helpful'}`);
    } catch (error) {
      this.logger.error(`Error recording message feedback: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Reset cleanup flag (for testing/maintenance purposes)
   */
  static resetCleanupFlag(): void {
    BusinessChatbotService.cleanedOnce = false;
  }

  /**
   * Get cleanup status
   */
  static getCleanupStatus(): boolean {
    return BusinessChatbotService.cleanedOnce;
  }
}