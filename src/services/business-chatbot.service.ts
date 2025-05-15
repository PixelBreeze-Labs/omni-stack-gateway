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

  constructor(
    @InjectModel(ChatbotMessage.name) private chatbotMessageModel: Model<ChatbotMessage>,
    @InjectModel(Business.name) private businessModel: Model<Business>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly businessService: BusinessService,  
    private readonly knowledgeBaseService: KnowledgeBaseService
  ) {}

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
          timestamp: new Date()
        }
      });
      await botMessage.save();

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
 * Generate response using knowledge base and NLP
 * Complete enhanced version
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
    [key: string]: any;
  };
}> {
  const normalizedMessage = message.toLowerCase().trim();
  const platformName = 'Staffluent';
  
  // Personalization variables
  const businessName = business?.name || 'your business';
  const userName = user ? `${user.name || 'there'}` : 'there';
  
  // Extract key terms for better matching
  const keyTerms = this.extractKeyTerms(normalizedMessage);
  
  // Check if this is a follow-up question
  const isFollowup = this.isFollowupQuestion(context);
  
  // Determine if we should show feedback for this message
  // Simple approach: show feedback every X messages
  const FEEDBACK_FREQUENCY = 5; // Show feedback every 5 messages
  
  // Get message count from context
  const messageCount = context?.sessionData?.messageCount || 0;
  
  // Determine if we should show feedback for this response
  // Show if it's every Xth message, or if it's knowledge-based
  let shouldShowFeedback = (messageCount % FEEDBACK_FREQUENCY === 0);
  
  // 1. Try to find a matching query-response pair from our learning database
  const matchingPairs = await this.knowledgeBaseService.searchQueryResponses(
    normalizedMessage,
    { 
      category: context.currentView || 'general',
      limit: 1
    }
  );
  
  if (matchingPairs.length > 0) {
    const pair = matchingPairs[0];
    // Always show feedback for knowledge-based responses
    shouldShowFeedback = true;
    
    // Replace placeholders in the response
    let response = pair.response
      .replace(/{businessName}/g, businessName)
      .replace(/{userName}/g, userName)
      .replace(/{platformName}/g, platformName);
    
    return {
      text: response,
      responseSource: 'learned',
      knowledgeUsed: true,
      metadata: {
        sourceId: pair._id.toString(),
        knowledgeUsed: true,
        responseSource: 'learned',
        shouldShowFeedback
      }
    };
  }
  
  // 2. Try to find relevant knowledge documents
  const relevantDocs = await this.knowledgeBaseService.searchDocuments(
    normalizedMessage,
    {
      businessType: business?.operationType || 'default',
      features: business?.enabledFeatures || [],
      currentView: context.currentView,
      limit: 2
    }
  );
  
  if (relevantDocs.length > 0) {
    // Always show feedback for knowledge-based responses
    shouldShowFeedback = true;
    
    // Use the most relevant document
    const doc = relevantDocs[0];
    
    // Process content to create a conversational response
    let response = this.formatKnowledgeResponse(
      doc.content, 
      businessName,
      userName,
      platformName
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
    normalizedMessage,
    keyTerms, 
    isFollowup,
    context, 
    business, 
    businessName,
    userName,
    platformName
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
        businessType: business?.operationType || 'default',
        userId: user?._id?.toString(),
        sessionId: context.sessionId,
        context
      }
    );
    
    // Always show feedback for unrecognized queries to help improve
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
   * Get response using the NLP system
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
    // Define response templates with context awareness
  const responseRules = [
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
    },
    {
      keywords: ['project', 'projects'],
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
      keywords: ['report', 'analytics', 'metrics', 'performance', 'statistics', 'stats', 'dashboard'],
      response: {
        text: `${platformName} provides ${businessName} with detailed analytics on productivity, project progress, task completion, and more.`,
        suggestions: [
          { id: 'performance_reports', text: 'Performance reports' },
          { id: 'time_reports', text: 'Time & attendance reports' },
          { id: 'export_data', text: 'Export data' }
        ]
      }
    },
    {
      keywords: ['field', 'service', 'field service', 'location', 'site', 'remote'],
      response: {
        text: `${platformName}'s field service features help ${businessName} manage operations outside the office, including location tracking and service scheduling.`,
        suggestions: [
          { id: 'field_locations', text: 'Field locations' },
          { id: 'service_schedule', text: 'Service scheduling' },
          { id: 'field_reporting', text: 'Field reporting' }
        ]
      }
    },
    {
      keywords: ['client', 'customer', 'account', 'portal'],
      response: {
        text: `${platformName} helps ${businessName} manage client relationships, track communications, and handle client requests.`,
        suggestions: [
          { id: 'add_client', text: 'Add a client' },
          { id: 'client_portal', text: 'Client portal features' },
          { id: 'client_invoices', text: 'Client invoicing' }
        ]
      }
    },
    {
      keywords: ['help', 'support', 'assistance', 'guide', 'tutorial', 'how to', 'how do i'],
      response: {
        text: `I can help with how ${businessName} can use ${platformName} for managing projects, tracking time, organizing teams, and more. What do you need help with?`,
        suggestions: [
          { id: 'projects_help', text: 'Projects help' },
          { id: 'tasks_help', text: 'Tasks help' },
          { id: 'time_help', text: 'Time tracking help' },
          { id: 'teams_help', text: 'Team management help' }
        ]
      }
    },
    {
      keywords: ['auto', 'assign', 'automatic', 'assignment', 'auto-assign'],
      response: {
        text: `${platformName} provides ${businessName} with auto-assignment capabilities that can automatically assign tasks to the most suitable team members based on skills, workload, and availability.`,
        suggestions: [
          { id: 'auto_assign_setup', text: 'Set up auto-assignment' },
          { id: 'auto_assign_trigger', text: 'Trigger auto-assignment' },
          { id: 'pending_approvals', text: 'Pending approvals' }
        ]
      }
    },
    {
      keywords: ['quality', 'inspection', 'compliance', 'safety', 'audit'],
      response: {
        text: `${platformName}'s quality control features help ${businessName} conduct inspections, ensure compliance with standards, and maintain safety protocols.`,
        suggestions: [
          { id: 'create_inspection', text: 'Create inspection' },
          { id: 'compliance_report', text: 'Compliance report' },
          { id: 'safety_checklist', text: 'Safety checklists' }
        ]
      }
    },
    {
      keywords: ['equipment', 'asset', 'tool', 'inventory', 'maintenance'],
      response: {
        text: `${platformName} includes equipment management tools for ${businessName} to track assets, schedule maintenance, and monitor usage.`,
        suggestions: [
          { id: 'track_equipment', text: 'Track equipment' },
          { id: 'maintenance_schedule', text: 'Maintenance schedule' },
          { id: 'equipment_assignment', text: 'Equipment assignment' }
        ]
      }
    },
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
        text: `I'm your ${platformName} assistant for ${businessName}. I can help with questions about projects, tasks, time tracking, team management, and more. What would you like to know about?`,
        suggestions: [
          { id: 'features', text: 'What features do you offer?' },
          { id: 'start', text: 'Help me get started' },
          { id: 'support', text: 'I need support' }
        ]
      }
    },
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
    },
    {
      keywords: ['what is staffluent', 'what does staffluent do', 'what\'s staffluent', 'explain staffluent', 'about staffluent'],
      response: {
        text: `Staffluent is a comprehensive workforce management platform that helps ${businessName} manage projects, tasks, teams, time tracking, field service operations, client relationships, and more. It's designed to streamline operations and improve productivity across your entire organization.`,
        suggestions: [
          { id: 'core_features', text: 'Core features' },
          { id: 'benefits', text: 'Key benefits' },
          { id: 'tour', text: 'Take a tour' }
        ]
      }
    },
    {
      keywords: ['features', 'capabilities', 'what can it do', 'functionality', 'tools', 'modules'],
      response: {
        text: `Staffluent offers a wide range of features for ${businessName}, including: project management, task tracking, time & attendance, team management, field service operations, client management, reporting & analytics, quality control, and equipment management. Which feature would you like to learn more about?`,
        suggestions: [
          { id: 'projects', text: 'Project management' },
          { id: 'time', text: 'Time tracking' },
          { id: 'teams', text: 'Team management' },
          { id: 'field', text: 'Field service' }
        ]
      }
    },
    {
      keywords: ['benefits', 'advantages', 'why use', 'value', 'roi', 'return on investment'],
      response: {
        text: `Staffluent helps ${businessName} boost productivity, reduce administrative overhead, improve resource allocation, enhance client satisfaction, and gain better visibility into operations. Our customers typically see significant time savings and operational improvements within weeks of implementation.`,
        suggestions: [
          { id: 'case_studies', text: 'Success stories' },
          { id: 'pricing', text: 'Pricing info' },
          { id: 'demo', text: 'Request a demo' }
        ]
      }
    },
    {
      keywords: ['get started', 'setup', 'begin', 'start', 'onboarding', 'first steps'],
      response: {
        text: `Getting started with Staffluent is easy for ${businessName}. You can begin by setting up your team members, creating your first project, and configuring your dashboard. Our step-by-step guides will walk you through the process, or our support team can help with onboarding.`,
        suggestions: [
          { id: 'setup_team', text: 'Set up my team' },
          { id: 'first_project', text: 'Create first project' },
          { id: 'dashboard', text: 'Configure dashboard' }
        ]
      }
    },
    {
      keywords: ['price', 'pricing', 'cost', 'subscription', 'plan', 'payment', 'fee'],
      response: {
        text: `Staffluent offers flexible pricing plans tailored to organizations of different sizes. ${businessName} can choose from our Basic, Professional, or Enterprise plans with monthly or annual billing options. Would you like me to provide more details about our pricing structure?`,
        suggestions: [
          { id: 'basic_plan', text: 'Basic plan details' },
          { id: 'professional_plan', text: 'Professional plan details' },
          { id: 'enterprise_plan', text: 'Enterprise plan details' }
        ]
      }
    },
    {
      keywords: ['support', 'help desk', 'contact', 'assistance', 'technical help'],
      response: {
        text: `Staffluent provides ${businessName} with comprehensive support through our help center, email support, and dedicated account managers for Enterprise customers. Our support team is available Monday through Friday, 9am-6pm ET, with extended hours for premium support customers.`,
        suggestions: [
          { id: 'help_center', text: 'Visit help center' },
          { id: 'contact_support', text: 'Contact support' },
          { id: 'premium_support', text: 'Premium support options' }
        ]
      }
    },
    {
      keywords: ['training', 'learn', 'tutorial', 'guide', 'documentation', 'how to use'],
      response: {
        text: `Staffluent offers comprehensive training resources for ${businessName} including interactive tutorials, video guides, documentation, and live webinars. Our goal is to help your team become proficient with the platform as quickly as possible.`,
        suggestions: [
          { id: 'tutorials', text: 'Interactive tutorials' },
          { id: 'videos', text: 'Video guides' },
          { id: 'webinars', text: 'Upcoming webinars' }
        ]
      }
    },
    {
      keywords: ['mobile', 'app', 'phone', 'tablet', 'ios', 'android', 'smartphone'],
      response: {
        text: `Yes, Staffluent offers mobile apps for both iOS and Android devices. ${businessName} team members can manage projects, track time, update tasks, and access reports on the go. The mobile app includes offline capabilities for field workers with limited connectivity.`,
        suggestions: [
          { id: 'ios_app', text: 'iOS app features' },
          { id: 'android_app', text: 'Android app features' },
          { id: 'offline_mode', text: 'Offline capabilities' }
        ]
      }
    },
    {
      keywords: ['integration', 'connect', 'sync', 'api', 'third party', 'other software'],
      response: {
        text: `Staffluent integrates with many popular business tools that ${businessName} might be using, including Slack, Microsoft 365, Google Workspace, QuickBooks, and more. We also offer an API for custom integrations with your existing systems.`,
        suggestions: [
          { id: 'integration_list', text: 'View all integrations' },
          { id: 'api_docs', text: 'API documentation' },
          { id: 'custom_integration', text: 'Request custom integration' }
        ]
      }
    },
    {
      keywords: ['security', 'privacy', 'data protection', 'encryption', 'compliance', 'gdpr', 'hipaa'],
      response: {
        text: `Staffluent takes security seriously. ${businessName}'s data is protected with enterprise-grade encryption, regular security audits, and strict access controls. We're compliant with industry standards including GDPR and offer specialized compliance features for regulated industries.`,
        suggestions: [
          { id: 'security_features', text: 'Security features' },
          { id: 'compliance', text: 'Compliance certifications' },
          { id: 'privacy_policy', text: 'Privacy policy' }
        ]
      }
    },
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
    },
    {
      keywords: ['project', 'projects'],
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
      keywords: ['report', 'analytics', 'metrics', 'performance', 'statistics', 'stats', 'dashboard'],
      response: {
        text: `${platformName} provides ${businessName} with detailed analytics on productivity, project progress, task completion, and more.`,
        suggestions: [
          { id: 'performance_reports', text: 'Performance reports' },
          { id: 'time_reports', text: 'Time & attendance reports' },
          { id: 'export_data', text: 'Export data' }
        ]
      }
    },
    {
      keywords: ['field', 'service', 'field service', 'location', 'site', 'remote'],
      response: {
        text: `${platformName}'s field service features help ${businessName} manage operations outside the office, including location tracking and service scheduling.`,
        suggestions: [
          { id: 'field_locations', text: 'Field locations' },
          { id: 'service_schedule', text: 'Service scheduling' },
          { id: 'field_reporting', text: 'Field reporting' }
        ]
      }
    },
    {
      keywords: ['client', 'customer', 'account', 'portal'],
      response: {
        text: `${platformName} helps ${businessName} manage client relationships, track communications, and handle client requests.`,
        suggestions: [
          { id: 'add_client', text: 'Add a client' },
          { id: 'client_portal', text: 'Client portal features' },
          { id: 'client_invoices', text: 'Client invoicing' }
        ]
      }
    },
    {
      keywords: ['help', 'support', 'assistance', 'guide', 'tutorial', 'how to', 'how do i'],
      response: {
        text: `I can help with how ${businessName} can use ${platformName} for managing projects, tracking time, organizing teams, and more. What do you need help with?`,
        suggestions: [
          { id: 'projects_help', text: 'Projects help' },
          { id: 'tasks_help', text: 'Tasks help' },
          { id: 'time_help', text: 'Time tracking help' },
          { id: 'teams_help', text: 'Team management help' }
        ]
      }
    },
    {
      keywords: ['auto', 'assign', 'automatic', 'assignment', 'auto-assign'],
      response: {
        text: `${platformName} provides ${businessName} with auto-assignment capabilities that can automatically assign tasks to the most suitable team members based on skills, workload, and availability.`,
        suggestions: [
          { id: 'auto_assign_setup', text: 'Set up auto-assignment' },
          { id: 'auto_assign_trigger', text: 'Trigger auto-assignment' },
          { id: 'pending_approvals', text: 'Pending approvals' }
        ]
      }
    },
    {
      keywords: ['quality', 'inspection', 'compliance', 'safety', 'audit'],
      response: {
        text: `${platformName}'s quality control features help ${businessName} conduct inspections, ensure compliance with standards, and maintain safety protocols.`,
        suggestions: [
          { id: 'create_inspection', text: 'Create inspection' },
          { id: 'compliance_report', text: 'Compliance report' },
          { id: 'safety_checklist', text: 'Safety checklists' }
        ]
      }
    },
    {
      keywords: ['equipment', 'asset', 'tool', 'inventory', 'maintenance'],
      response: {
        text: `${platformName} includes equipment management tools for ${businessName} to track assets, schedule maintenance, and monitor usage.`,
        suggestions: [
          { id: 'track_equipment', text: 'Track equipment' },
          { id: 'maintenance_schedule', text: 'Maintenance schedule' },
          { id: 'equipment_assignment', text: 'Equipment assignment' }
        ]
      }
    }
    ];

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
    
    // Find best matching response based on keyword relevance
    let bestMatch = null;
    let highestScore = 0;
    
    for (const rule of responseRules) {
      const score = this.calculateRelevanceScore(keyTerms, rule.keywords);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = rule;
      }
    }
    
    // If we found a reasonable match, use it
    if (bestMatch && highestScore > 0.3) {
      // If this appears to be a follow-up question, adapt the response style
      if (isFollowup) {
        const response = { ...bestMatch.response };
        // Remove greeting prefixes for follow-up questions
        response.text = response.text.replace(`Hello ${userName}! `, '').replace(`Hi there! `, '');
        return {
          ...response,
          confidence: highestScore
        };
      }
      return {
        ...bestMatch.response,
        confidence: highestScore
      };
    }
    
    // See if this is asking about something specific like "how to create a project"
    const specificResponses = this.checkForSpecificQuestions(
      normalizedMessage, 
      businessName
    );
    
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
        { id: 'projects', text: 'Projects' },
        { id: 'tasks', text: 'Tasks' },
        { id: 'time', text: 'Time tracking' }
      ],
      confidence: 0.1 // Low confidence
    };
  }

  
/**
 * Check if this is a follow-up question based on conversation history
 * Enhanced to detect questions without explicit context
 */
private isFollowupQuestion(context: Record<string, any>): boolean {
  if (!context?.conversationHistory || context.conversationHistory.length < 2) {
    return false;
  }

  // Check if there's a recent exchange in the last few messages
  const recentMessages = context.conversationHistory.slice(-3);
  const hasRecentBotMessage = recentMessages.some(msg => msg.sender === 'bot');
  const hasRecentUserMessage = recentMessages.some(msg => msg.sender === 'user');

  // Basic check for recent exchanges
  const hasRecentExchange = hasRecentBotMessage && hasRecentUserMessage;
  
  // Enhanced check for contextual/short queries that likely depend on previous context
  const latestUserMessage = recentMessages.find(msg => msg.sender === 'user');
  
  if (latestUserMessage) {
    const message = latestUserMessage.content.toLowerCase().trim();
    
    // Check for very short messages that are typically follow-ups
    if (message.split(' ').length <= 3) {
      return true;
    }
    
    // Check for queries that typically reference previous context
    const followupIndicators = [
      'why', 'how', 'what about', 'and', 'but', 'then', 'so',
      'can you', 'could you', 'would', 'that', 'those', 'it', 'they',
      'this one', 'these', 'the same', 'instead'
    ];
    
    for (const indicator of followupIndicators) {
      if (message.startsWith(indicator) || message.includes(` ${indicator} `)) {
        return true;
      }
    }
    
    // Check for messages without a clear subject that likely refer to previous messages
    if (!message.includes('staffluent') && 
        !message.includes('project') && 
        !message.includes('task') && 
        !message.includes('team') && 
        !message.includes('time') && 
        !message.includes('track')) {
      // The message doesn't mention specific features or the product name
      // It's likely referring to something from previous messages
      return true;
    }
  }

  return hasRecentExchange;
}

/**
* Format knowledge document content into a conversational response
* Enhanced for readability and engagement
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
 
 // Add contextual suggestions based on content
 if (response.includes('project') && !response.includes('create a project')) {
   response += " You can easily create a new project or view existing ones from your dashboard.";
 } else if (response.includes('task') && !response.includes('assign tasks')) {
   response += " Tasks can be assigned to team members with just a few clicks.";
 } else if (response.includes('report') && !response.includes('generate reports')) {
   response += " Reports can be generated and exported in various formats.";
 }
 
 return response;
}

/**
 * Extract suggestions from a knowledge document
 * Enhanced to provide more relevant and contextual suggestions
 */
private getSuggestionsFromDocument(doc: any): { id: string; text: string }[] {
  // Generate suggestions based on document content and keywords
  const suggestions = [];
  
  // Analyze document content to identify action-oriented suggestions
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
  
  // Add a "Tell me more" suggestion if we don't have any action suggestions yet
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'more_info',
      text: 'Tell me more about this'
    });
  }
  
  // Add category-based suggestions
  if (doc.categories && doc.categories.length > 0) {
    const categoryMap = {
      'project_management': 'About project management',
      'task_management': 'About task management',
      'time_tracking': 'About time tracking',
      'team_management': 'About team management',
      'client_management': 'About client management',
      'reporting': 'About reporting features',
      'field_service': 'About field service',
      'equipment': 'About equipment management',
      'quality_control': 'About quality control'
    };
    
    for (const category of doc.categories) {
      if (categoryMap[category] && suggestions.length < 3) {
        suggestions.push({
          id: `category_${category}`,
          text: categoryMap[category]
        });
      }
    }
  }
  
  // Add help/tutorial suggestion
  if (suggestions.length < 4) {
    suggestions.push({
      id: 'help_tutorial',
      text: content.includes('project') ? 'Project tutorials' : 
            content.includes('task') ? 'Task tutorials' :
            content.includes('team') ? 'Team tutorials' : 
            content.includes('time') ? 'Time tracking help' : 'View tutorials'
    });
  }
  
  // Add keyword-based suggestions if needed
  if (suggestions.length < 3 && doc.keywords && doc.keywords.length > 0) {
    // Limit to 3 total suggestions
    const limit = 3 - suggestions.length;
    
    for (let i = 0; i < Math.min(limit, doc.keywords.length); i++) {
      const keyword = doc.keywords[i];
      
      if (keyword.length > 3) {
        suggestions.push({
          id: `keyword_${keyword}`,
          text: `More about ${keyword}`
        });
      }
    }
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
  } else if ((match = howToManage.exec(message)) !== null) {
    const item = match[1].toLowerCase();
    if (item === 'project' || item === 'projects') {
      return {
        text: `To manage ${businessName} projects in Staffluent, use the Projects dashboard where you can track progress, update status, manage tasks, assign team members, and monitor timelines.`,
        suggestions: [
          { id: 'project_progress', text: 'Update project progress' },
          { id: 'project_team', text: 'Manage project team' }
        ]
      };
    } else if (item === 'team' || item === 'teams') {
      return {
        text: `Team management for ${businessName} is done through the Teams section in Staffluent. Here you can organize team members, assign roles, monitor performance, and handle scheduling.`,
        suggestions: [
          { id: 'team_schedule', text: 'Team scheduling' },
          { id: 'team_performance', text: 'Performance tracking' }
        ]
      };
    }
  } else if ((match = howToTrack.exec(message)) !== null) {
    const item = match[1].toLowerCase();
    if (item === 'time' || item === 'hours') {
      return {
        text: `Time tracking for ${businessName} can be done using the Staffluent Time & Attendance module. You can clock in/out, log breaks, and record time spent on specific tasks or projects.`,
        suggestions: [
          { id: 'time_reports', text: 'Time reports' },
          { id: 'timesheet', text: 'View timesheets' }
        ]
      };
    } else if (item === 'progress' || item === 'status') {
      return {
        text: `You can track ${businessName} progress in the Staffluent Projects section by updating completion percentages, milestone achievements, and task statuses. Reports provide visual representations of progress.`,
        suggestions: [
          { id: 'progress_report', text: 'Progress reports' },
          { id: 'milestone_tracking', text: 'Milestone tracking' }
        ]
      };
    }
  }
  
  return null;
}

  /**
 * Extract key terms from message for better matching
 * Enhanced for conversational queries
 */
private extractKeyTerms(message: string): string[] {
  // Remove common words and punctuation, but keep important conversational terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why',  
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 
    'can', 'will', 'just', 'should', 'now', 'about', 'which',
    'i', 'me', 'my', 'mine', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves', 'it', 'its', 'itself',
    'for', 'of', 'with', 'by', 'at', 'from', 'to', 'in', 'on'
  ]);
  
  // Preserve important conversational keywords
  const preserveWords = new Set([
    'how', 'what', 'who', 'help', 'thanks', 'thank', 'hi', 'hello', 'hey'
  ]);
  
  // Modified stopwords filtering to keep conversational terms
  const words = message.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/) // Split by whitespace
    .filter(word => {
      // Keep the word if:
      // 1. It's in our preserveWords list, OR
      // 2. It's longer than 2 characters AND not in stopWords
      return preserveWords.has(word) || (word.length > 2 && !stopWords.has(word));
    }); 

  // Also check for common conversational phrases and add them as terms
  const phrases = [
    'how are you', 'what is', 'what are', 'who is', 'who are',
    'can you', 'do you', 'tell me about', 'help me',
    'what can', 'what does', 'how do', 'how can'
  ];

  const normalizedMessage = message.toLowerCase();
  const phraseMatches = phrases.filter(phrase => normalizedMessage.includes(phrase));
  
  // Add any matched phrases to our terms
  const allTerms = [...words, ...phraseMatches];
  
  // Return unique terms
  return [...new Set(allTerms)];
}

 /**
 * Calculate relevance score between message terms and rule keywords
 * Enhanced version for better conversational matching
 */
private calculateRelevanceScore(terms: string[], keywords: string[]): number {
  if (!terms.length || !keywords.length) return 0;
  
  // Join terms to handle multi-word conversational phrases
  const fullMessage = terms.join(' ');
  
  // Check for direct phrase matches first (high priority)
  for (const keyword of keywords) {
    // Exact phrase match gives very high score
    if (fullMessage === keyword) {
      return 1.0; // Perfect match
    }
    
    // Check if the keyword is a phrase that is contained entirely in the message
    if (keyword.includes(' ') && fullMessage.includes(keyword)) {
      return 0.9; // Very good match
    }
  }
  
  // Handle very short queries better (like "hi", "help")
  if (terms.length === 1) {
    for (const keyword of keywords) {
      if (terms[0] === keyword) {
        return 1.0; // Perfect match for single term
      }
    }
  }
  
  // Expand keywords to include both phrases and individual words
  const expandedKeywords = keywords.flatMap(keyword => 
    keyword.includes(' ') ? [keyword, ...keyword.split(' ')] : [keyword]
  );
  
  let matches = 0;
  
  // Count matching terms with proper weighting
  for (const term of terms) {
    for (const keyword of expandedKeywords) {
      // Exact word match
      if (term === keyword) {
        matches += 1.0;
        break;
      }
      // Partial word match - beginning of word
      else if (keyword.startsWith(term) || term.startsWith(keyword)) {
        matches += 0.8;
        break;
      }
      // Contains match
      else if (keyword.includes(term) || term.includes(keyword)) {
        matches += 0.5;
        break;
      }
    }
  }
  
  // Additional boost for short conversational queries (they tend to need more help matching)
  const shortQueryBoost = terms.length <= 3 ? 0.2 : 0;
  
  // Special case for conversational queries
  const conversationalQueries = [
    'how are you', 'how is it going', 'whats up', 'what is staffluent', 
    'what do you do', 'who are you', 'what can you do', 'what is this',
    'help me', 'i need help', 'can you help', 'tell me about'
  ];
  
  let conversationalBoost = 0;
  for (const query of conversationalQueries) {
    if (fullMessage.includes(query)) {
      conversationalBoost = 0.3;
      break;
    }
  }
  
  // Calculate weighted score
  const baseScore = matches / (terms.length + expandedKeywords.length / 3);
  return Math.min(1.0, baseScore + shortQueryBoost + conversationalBoost);
}

  /**
   /**
 * Get responses specific to the current view
 */
private getViewSpecificResponses(
  currentView: string, 
  businessType: string = 'hybrid',
  userName: string = 'there',
  businessName: string = 'your business'
): { text: string; suggestions?: { id: string; text: string }[] } | null {
  // Response suggestions based on current view, clarifying Staffluent platform vs client business
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
    },
    'field': {
      text: `You're in the Field Operations section of Staffluent. Here you can manage ${businessName} field services and remote teams.`,
      suggestions: [
        { id: 'field_map', text: 'View field map' },
        { id: 'field_staff', text: 'Field staff' }
      ]
    },
    'clients': {
      text: `You're in the Client Management section of Staffluent. Here you can manage ${businessName} client accounts and relationships.`,
      suggestions: [
        { id: 'add_client', text: 'Add new client' },
        { id: 'client_invoices', text: 'Client invoices' }
      ]
    },
    'autoAssignment': {
      text: `You're in the Auto Assignment section of Staffluent. Here you can configure how tasks are automatically assigned to ${businessName} team members.`,
      suggestions: [
        { id: 'configure_weights', text: 'Configure assignment weights' },
        { id: 'pending_approvals', text: 'View pending approvals' },
        { id: 'assignment_history', text: 'View assignment history' }
      ]
    },
    'equipment': {
      text: `You're in the Equipment Management section of Staffluent. Here you can track ${businessName} assets, schedule maintenance, and manage equipment assignments.`,
      suggestions: [
        { id: 'add_equipment', text: 'Add equipment' },
        { id: 'maintenance', text: 'Schedule maintenance' },
        { id: 'equipment_logs', text: 'Equipment logs' }
      ]
    },
    'quality': {
      text: `You're in the Quality Control section of Staffluent. Here you can manage ${businessName} inspections, compliance, and safety protocols.`,
      suggestions: [
        { id: 'create_inspection', text: 'Create inspection' },
        { id: 'compliance_report', text: 'Compliance report' },
        { id: 'safety_checklist', text: 'Safety checklists' }
      ]
    },
    'reports': {
      text: `You're in the Reports section of Staffluent. Here you can generate and view analytics on various aspects of ${businessName}.`,
      suggestions: [
        { id: 'performance_report', text: 'Performance reports' },
        { id: 'time_report', text: 'Time reports' },
        { id: 'export_data', text: 'Export data' }
      ]
    }
  };

  // Add or filter suggestions based on business type
  if (businessType === 'field_service' && viewResponses[currentView]) {
    // Add field service specific suggestions
    if (currentView === 'dashboard') {
      viewResponses[currentView].suggestions.push({ id: 'field_metrics', text: 'Field service metrics' });
    }
  }

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
    // Find the message to update
    const message = await this.chatbotMessageModel.findOne({
      _id: messageId,
      businessId,
      clientId,
      sender: 'bot' // Only allow feedback for bot messages
    });
    
    if (!message) {
      this.logger.warn(`Message with ID ${messageId} not found when recording feedback`);
      return; // Don't throw - just log and return
    }
    
    // Add feedback to the message metadata
    const metadata = message.metadata || {};
    metadata.feedback = {
      wasHelpful,
      feedbackText,
      timestamp: new Date()
    };
    
    // Update the message
    await this.chatbotMessageModel.updateOne(
      { _id: messageId },
      { 
        $set: { 
          metadata 
        }
      }
    );
    
    // If this message used knowledge content, update the response success rate
    if (metadata.sourceId && (metadata.responseSource === 'knowledge' || metadata.responseSource === 'learned')) {
      try {
        await this.knowledgeBaseService.updateResponseSuccess(metadata.sourceId, wasHelpful);
      } catch (error) {
        // If the knowledge source is not found, just log it but don't fail the request
        if (error instanceof NotFoundException) {
          this.logger.warn(`Source with ID ${metadata.sourceId} not found when recording feedback`);
        } else {
          throw error;
        }
      }
    }
    
    // Log feedback for analytics
    this.logger.log(`Feedback received for message ${messageId}: ${wasHelpful ? 'Helpful' : 'Not helpful'}`);
  } catch (error) {
    this.logger.error(`Error recording message feedback: ${error.message}`, error.stack);
    throw error;
  }
}
}