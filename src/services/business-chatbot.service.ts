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
        .sort({ createdAt: 1 }) // Chronological order
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

  /**
   * IMPROVED: Enhanced generateResponse function with better logic flow and cleanup
   */
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
    metadata?: {
      sourceId?: string;
      knowledgeUsed?: boolean;
      responseSource?: string;
      shouldShowFeedback?: boolean;
      conversationalResponse?: boolean;
      confidence?: number;
      [key: string]: any;
    };
  }> {
    // Perform one-time cleanup of bad responses if not done yet
    await this.cleanupBadResponses();
    const normalizedMessage = message.toLowerCase().trim();
    const platformName = 'Staffluent';
    
    // Personalization variables
    const businessName = business?.name || 'your business';
    const userName = user ? `${user.name || 'there'}` : 'there';
    
    // Extract key terms for better matching
    const keyTerms = this.extractKeyTerms(normalizedMessage);
    
    // Check if this is a follow-up question
    const isFollowup = this.isFollowupQuestion(context);
    
    // Determine if this is a casual conversational query
    const isConversational = this.isConversationalQuery(normalizedMessage);
    
    // Determine if we should show feedback for this message
    const FEEDBACK_FREQUENCY = 5; // Show feedback every 5 messages
    const messageCount = context?.sessionData?.messageCount || 0;
    let shouldShowFeedback = (messageCount % FEEDBACK_FREQUENCY === 0);
    
    // IMPORTANT: Get the clientId from the business object
    const clientId = business?.clientId;

    // NEW: Check if this is a closure message ("That's all for now", etc.)
    if (this.isClosureMessage(normalizedMessage)) {
      const closureResponse = this.getClosureResponse(userName, businessName, platformName);
      
      return {
        text: closureResponse.text,
        suggestions: closureResponse.suggestions,
        responseSource: 'closure',
        knowledgeUsed: false,
        metadata: {
          responseSource: 'closure',
          knowledgeUsed: false,
          shouldShowFeedback: false
        }
      };
    }
    
    // Handle casual conversation first
    if (isConversational) {
      const conversationResponse = this.getConversationalResponse(
        normalizedMessage, userName, businessName, platformName
      );
      
      if (conversationResponse) {
        return {
          text: conversationResponse.text,
          suggestions: conversationResponse.suggestions,
          responseSource: 'conversation',
          knowledgeUsed: false,
          metadata: {
            conversationalResponse: true,
            responseSource: 'conversation',
            knowledgeUsed: false,
            shouldShowFeedback: false
          }
        };
      }
    }

    // NEW: Check if this question should go to knowledge base first
    if (this.shouldUseKnowledgeFirst(normalizedMessage, keyTerms)) {
      // Skip learned responses and go straight to knowledge base for feature questions
      const relevantDocs = await this.knowledgeBaseService.searchDocuments(
        normalizedMessage,
        {
          clientId,
          businessType: business?.operationType || 'default',
          features: business?.includedFeatures || [],
          currentView: context.currentView,
          limit: 2
        }
      );
      
      if (relevantDocs.length > 0) {
        shouldShowFeedback = true;
        const doc = relevantDocs[0];
        
        let response = this.formatKnowledgeResponse(
          doc.content, businessName, userName, platformName
        );
        
        return {
          text: response,
          suggestions: this.getSuggestionsFromDocument(doc),
          responseSource: 'knowledge',
          knowledgeUsed: true,
          metadata: {
            sourceId: doc._id.toString(),
            knowledgeUsed: true,
            responseSource: 'knowledge',
            shouldShowFeedback,
            documentTitle: doc.title || null,
            documentCategories: doc.categories || []
          }
        };
      }
    }
    
    // 1. Try to find a matching query-response pair with STRICTER validation
    const matchingPairs = await this.knowledgeBaseService.searchQueryResponses(
      normalizedMessage,
      { 
        category: context.currentView || 'general',
        limit: 3, // Get top 3 instead of 1 for better validation
        clientId
        // Note: minSimilarity removed as it's not supported by the interface
      }
    );
    
    // IMPROVED: Validate the match quality before using learned response
    if (matchingPairs.length > 0) {
      const bestMatch = matchingPairs[0];
      
      // Additional validation for learned responses
      if (this.validateLearnedResponse(normalizedMessage, bestMatch, keyTerms)) {
        shouldShowFeedback = true;
        
        let response = bestMatch.response
          .replace(/{businessName}/g, businessName)
          .replace(/{userName}/g, userName)
          .replace(/{platformName}/g, platformName);
        
        return {
          text: response,
          responseSource: 'learned',
          knowledgeUsed: true,
          metadata: {
            sourceId: bestMatch._id.toString(),
            knowledgeUsed: true,
            responseSource: 'learned',
            shouldShowFeedback,
            matchScore: bestMatch.similarity || 0,
            validatedMatch: true
          }
        };
      } else {
        // Log failed validation for monitoring
        this.logger.warn(`Learned response validation failed for query: "${normalizedMessage}". Response: "${bestMatch.response}"`);
      }
    }
    
    // 2. Try to find relevant knowledge documents
    const relevantDocs = await this.knowledgeBaseService.searchDocuments(
      normalizedMessage,
      {
        clientId,
        businessType: business?.operationType || 'default',
        features: business?.includedFeatures || [],
        currentView: context.currentView,
        limit: 2
      }
    );
    
    if (relevantDocs.length > 0) {
      shouldShowFeedback = true;
      const doc = relevantDocs[0];
      
      let response = this.formatKnowledgeResponse(
        doc.content, businessName, userName, platformName
      );
      
      return {
        text: response,
        suggestions: this.getSuggestionsFromDocument(doc),
        responseSource: 'knowledge',
        knowledgeUsed: true,
        metadata: {
          sourceId: doc._id.toString(),
          knowledgeUsed: true,
          responseSource: 'knowledge',
          shouldShowFeedback,
          documentTitle: doc.title || null,
          documentCategories: doc.categories || []
        }
      };
    }
    
    // 3. Fall back to predefined NLP responses
    const nlpResponse = await this.getNlpResponse(
      normalizedMessage, keyTerms, isFollowup, context, 
      business, businessName, userName, platformName
    );
    
    // For conversational or high-confidence responses, show feedback more often
    if (nlpResponse.confidence > 0.7 || normalizedMessage.length < 20) {
      shouldShowFeedback = true;
    }
    
    // 4. If no good NLP response, log this as an unrecognized query
    if (nlpResponse.confidence < 0.3) {
      const unrecognizedQuery = await this.knowledgeBaseService.logUnrecognizedQuery(
        message,
        {
          clientId,
          businessId: business?._id?.toString(),
          businessType: business?.operationType || 'default',
          userId: user?._id?.toString(),
          sessionId: context.sessionId,
          context
        }
      );
      
      shouldShowFeedback = true;
      
      return {
        ...nlpResponse,
        responseSource: 'nlp',
        knowledgeUsed: false,
        metadata: {
          sourceId: unrecognizedQuery._id.toString(),
          responseSource: 'nlp',
          knowledgeUsed: false,
          confidence: nlpResponse.confidence,
          unrecognized: true,
          shouldShowFeedback
        }
      };
    }
    
    return {
      ...nlpResponse,
      responseSource: 'nlp',
      knowledgeUsed: false,
      metadata: {
        responseSource: 'nlp',
        knowledgeUsed: false,
        confidence: nlpResponse.confidence,
        shouldShowFeedback
      }
    };
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
   * NEW: Log response quality for monitoring
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
    
    if (source === 'learned' && (hasSuspiciousTerm || confidence < 0.5)) {
      this.logger.warn(`Suspicious learned response detected:`, {
        query,
        response: response.substring(0, 100),
        source,
        confidence,
        suspicious: hasSuspiciousTerm
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
      
      // Only return view response for greeting or help requests
      if (viewResponses && (normalizedMessage.includes('hello') || normalizedMessage.includes('hi') || 
          normalizedMessage.includes('help') || normalizedMessage.length < 5)) {
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