import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { logger } from "./utils/logger";
import { performanceLogger } from "./utils/performance-logger";
import { anthropicService, generateClarificationOptions } from "./services/anthropic";
import { viatorService } from "./services/viator";
import { enhancedViatorService } from "./services/enhanced-viator";
import { cleanRelevanceEngine } from "./services/clean-relevance-engine";
import { ultimateViatorEngine } from "./services/ultimate-viator-engine";
import { assemblyAIService } from "./services/assemblyai";
import { csvTagManager } from './services/csv-tag-manager';
import { ConflictDetector } from "./services/conflict-detector";
import { messageSchema, travelPreferencesSchema, TimeSlot, InsertTimeSlot, InsertSavedActivity, type Message, type TravelPreferences, type Conversation } from "@shared/schema";
import { setupAuth, requireAuth, optionalAuth } from "./auth";
import { z } from "zod";
import { nanoid } from "nanoid";
import multer from "multer";
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { fallbackSystem } from './fallback-recommendations';
import { destinationCacheV2 } from "./services/destination-cache-v2"; // Import destinationCacheV2
import { aiInformedSearchEngine } from "./services/ai-informed-search-engine";
import { googlePlacesService } from "./services/google-places-service";

// 🚩 FEATURE FLAG: Control which search engine version to use
// searchV2() is an unimplemented stub (always returns zero activities) — see
// clean-relevance-engine.ts. Keep this false until V2 actually has a body.
const USE_V2_SEARCH = false;

const sendMessageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })),
  sessionId: z.string().optional(),
  explicitDestination: z.string().optional(),
}).or(z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  explicitDestination: z.string().optional(),
}));

// Helper functions for extracting user preferences from messages
function extractDurationPreferences(message: string): { min?: number; max?: number; preferred?: number } | undefined {
  const msg = message.toLowerCase();

  if (/quick|short|brief|1\s*hour|one hour/.test(msg)) {
    return { max: 180 }; // Max 3 hours
  }
  if (/half.?day|morning|afternoon|4\s*hours?|five hours?/.test(msg)) {
    return { min: 120, max: 360 }; // 2-6 hours
  }
  if (/full.?day|all.?day|8\s*hours?|entire day/.test(msg)) {
    return { min: 360, max: 600 }; // 6-10 hours
  }
  if (/multi.?day|several days|week/.test(msg)) {
    return { min: 1440 }; // Multiple days
  }

  return undefined;
}

function extractBudgetPreferences(message: string, currency: string): { min?: number; max?: number; currency?: string } | undefined {
  const msg = message.toLowerCase();

  if (/budget|cheap|affordable|inexpensive/.test(msg)) {
    return { max: 50, currency };
  }
  if (/luxury|premium|expensive|high.?end/.test(msg)) {
    return { min: 100, currency };
  }
  if (/mid.?range|moderate/.test(msg)) {
    return { min: 30, max: 100, currency };
  }

  return undefined;
}

function extractPartySize(message: string): number | undefined {
  const msg = message.toLowerCase();

  const numberMatches = msg.match(/\b(\d+)\s*(?:people|person|pax|traveler|guest)/);
  if (numberMatches) {
    return parseInt(numberMatches[1], 10);
  }

  if (/\balone|solo|myself|just me\b/.test(msg)) return 1;
  if (/\bcouple|two of us|me and my partner/.test(msg)) return 2;
  if (/\bfamily of (\d+)/.test(msg)) {
    const match = msg.match(/\bfamily of (\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  return undefined;
}

function extractActivityKeywords(message: string, preferences: any): string {
  const msg = message.toLowerCase();

  const activityTerms: string[] = [];

  if (/museum|art|gallery|exhibition|culture|history/.test(msg)) {
    activityTerms.push('museum', 'cultural', 'art');
  }
  if (/food|restaurant|culinary|dining|eat|taste/.test(msg)) {
    activityTerms.push('food', 'culinary', 'dining');
  }
  if (/adventure|outdoor|hiking|kayak|bike|climb/.test(msg)) {
    activityTerms.push('adventure', 'outdoor');
  }
  if (/beach|water|swim|surf|dive|snorkel/.test(msg)) {
    activityTerms.push('beach', 'water sports');
  }
  if (/fish|fishing|charter/.test(msg)) {
    activityTerms.push('fishing', 'charter', 'boat');
  }
  if (/tour|sightseeing|visit|see|explore/.test(msg)) {
    activityTerms.push('tours', 'sightseeing');
  }

  return activityTerms.length > 0 ? activityTerms.join(' ') : message;
}

function cleanSearchQuery(query: string): string {
  return query.replace(/[^\w\s-]/g, '').trim();
}

function extractDestinationFromContext(message: string, preferences: any, fallback: any): string | null {
  const msg = message.toLowerCase();

  // Look for destination patterns
  const destinationPatterns = [
    /\b(?:in|to|visit|going|traveling)\s+([A-Z][a-zA-Z\s,]+)/i,
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:trip|vacation|activities|tours)/i
  ];

  for (const pattern of destinationPatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Check preferences
  if (preferences?.destination?.name) {
    return preferences.destination.name;
  }

  return null;
}

// Hardcoded destinations for quick search and autocomplete
const HARDCODED_DESTINATIONS = [
  { id: 278, name: "Hawaii", country: "USA" },
  { id: 999980, name: "Hawaii, USA", country: "USA" },
  { id: 999981, name: "Honolulu, Hawaii", country: "USA" },
  { id: 479, name: "Paris", country: "France" },
  { id: 680, name: "Paris, France", country: "France" },
  { id: 294, name: "Tokyo", country: "Japan" },
  { id: 295, name: "Tokyo, Japan", country: "Japan" },
  { id: 186, name: "London", country: "England" },
  { id: 187, name: "London, England", country: "England" },
  { id: 425, name: "Rome", country: "Italy" },
  { id: 426, name: "Rome, Italy", country: "Italy" },
  { id: 303, name: "New York", country: "USA" },
  { id: 304, name: "New York, USA", country: "USA" },
  { id: 156, name: "Barcelona", country: "Spain" },
  { id: 157, name: "Barcelona, Spain", country: "Spain" },
  { id: 290, name: "Kona", country: "Hawaii, USA" },
  { id: 291, name: "Kona, Hawaii", country: "Hawaii, USA" }
];

export function registerRoutes(app: Express): Server {
  // Set up authentication
  setupAuth(app);

  // Initialize uploads middleware
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  // Looks up a conversation by session, creating (and persisting) it if this
  // is a brand-new session. Previously callers built a local placeholder
  // object here and only ever called storage.updateConversation later, which
  // silently no-ops for a session that was never actually created — chat
  // history was never saved for any first-time visitor.
  // Conversation.messages/travelPreferences are jsonb columns, so Drizzle
  // infers them as `unknown` — cast here to the real shape once, rather than
  // at every call site.
  type TypedConversation = Omit<Conversation, 'messages' | 'travelPreferences'> & {
    messages: Message[];
    travelPreferences: TravelPreferences | null;
  };

  async function getOrCreateConversation(sessionId: string): Promise<TypedConversation> {
    const existing = await storage.getConversation(sessionId);
    if (existing) return existing as unknown as TypedConversation;
    const created = await storage.createConversation({
      sessionId,
      messages: [],
      travelPreferences: {},
      lastRecommendations: null,
    });
    return created as unknown as TypedConversation;
  }

  // Send message with streaming AI response
  app.post('/api/chat', async (req, res) => {
    try {
      const result = sendMessageSchema.safeParse(req.body);
      if (!result.success) {
        console.error('❌ Chat validation failed:', result.error.errors);
        return res.status(400).json({ error: 'Invalid request body', details: result.error.errors });
      }

      const data = result.data;

      // Handle both AI SDK format (messages array) and legacy format (single message)
      let message: string;
      let sessionId: string | undefined;
      let explicitDestination: string | undefined;

      if ('messages' in data) {
        // AI SDK format - get the last user message
        const lastUserMessage = data.messages.filter(m => m.role === 'user').pop();
        message = lastUserMessage?.content || '';
        sessionId = data.sessionId;
        explicitDestination = data.explicitDestination;
      } else {
        // Legacy format
        message = data.message;
        sessionId = data.sessionId;
        explicitDestination = data.explicitDestination;
      }

      console.log('💬 Chat request received:', { message, sessionId, explicitDestination });

      const conversation = await getOrCreateConversation(sessionId || nanoid());

      res.setHeader('x-vercel-ai-data-stream', 'v1');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Build messages array - handle both formats
      let messages;
      if ('messages' in data) {
        // AI SDK format - use provided messages
        messages = [
          {
            role: 'system' as const,
            content: `You are WonderVoya, an AI travel assistant that helps users plan personalized trips.

Key Guidelines:
- Be conversational and enthusiastic about travel
- Ask clarifying questions about destinations, dates, interests
- Help users discover activities and create itineraries
- If users mention specific destinations or activities, show enthusiasm
- Keep responses focused and helpful

Current conversation context: ${conversation.messages.length} previous messages
User preferences: ${JSON.stringify(conversation.travelPreferences || {})}`
          },
          ...data.messages
        ];
      } else {
        // Legacy format - build from conversation history
        messages = [
          {
            role: 'system' as const,
            content: `You are WonderVoya, an AI travel assistant that helps users plan personalized trips.

Key Guidelines:
- Be conversational and enthusiastic about travel
- Ask clarifying questions about destinations, dates, interests
- Help users discover activities and create itineraries
- If users mention specific destinations or activities, show enthusiasm
- Keep responses focused and helpful

Current conversation context: ${conversation.messages.length} previous messages
User preferences: ${JSON.stringify(conversation.travelPreferences || {})}`
          },
          ...conversation.messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.text
          })),
          {
            role: 'user' as const,
            content: message
          }
        ];
      }

      console.log('🤖 Calling Anthropic with', messages.length, 'messages');

      const stream = await streamText({
        model: anthropic('claude-3-5-sonnet-20241022'),
        messages,
        temperature: 0.7,
        maxTokens: 1000,
      });

      const userMessage = {
        id: nanoid(),
        text: message,
        sender: 'user' as const,
        timestamp: new Date().toISOString(),
      };

      let fullResponse = '';

      for await (const chunk of stream.textStream) {
        fullResponse += chunk;
        const escapedChunk = chunk.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        res.write(`0:"${escapedChunk}"\n`);
      }

      const aiMessage = {
        id: nanoid(),
        text: fullResponse,
        sender: 'ai' as const,
        timestamp: new Date().toISOString(),
      };

      await storage.updateConversation(conversation.sessionId, {
        messages: [...(conversation.messages || []), userMessage, aiMessage],
        travelPreferences: conversation.travelPreferences || {},
        lastRecommendations: null,
      });

      res.write(`e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":${fullResponse.split(' ').length}},"isContinued":false}\n`);
      res.end();

    } catch (error) {
      console.error('Error in streaming chat:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // Get recommendations after AI response (with multi-destination support)
  app.post("/api/conversation/recommendations", async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      console.log('🔍 Recommendations request:', { sessionId, messageLength: message?.length });

      const conversation = await getOrCreateConversation(sessionId || nanoid());

      let recommendations = null;
      let shouldShowRecommendations = false;

      // Extract message for search
      let messageText = '';
      let conversationHistory = conversation.messages;
      const lastMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] : null;

      if (lastMessage && lastMessage.sender === 'user') {
        messageText = lastMessage.text;
      } else if (message) {
        messageText = message;
      }

      const updatedPreferences = (conversation.travelPreferences || {}) as any;

      const hasDestination = /\b(in|to|visit|going|traveling|trip|vacation|holiday)\s+([A-Z][a-zA-Z\s,]+)/i.test(messageText);

      // Comprehensive activity intent detection
      const hasActivityIntent = /\b(activities|tours|things to do|attractions|experiences|food|restaurant|museum|fishing|snorkeling|diving|swimming|kayaking|charter|boat|adventure|outdoor)/i.test(messageText);
      const isFishingRequest = /\b(fishing|fish|charter|angling|catch|rod|reel|bait|tackle|deep sea|sport fish)/i.test(messageText);
      const isWaterActivity = /\b(water|ocean|sea|boat|sail|cruise|marine|aquatic)/i.test(messageText);
      const hasGenericActivityWords = /\b(want|need|looking|book|find|plan|do|go|trip|visit)/i.test(messageText);

      // Enhanced trigger conditions - comprehensive activity detection
      const isNinjaSamuraiRequest = /\b(ninja|samurai|warrior|martial arts|sword|katana|bushido|feudal|shogun|dojo)/i.test(messageText);
      const isRoyalHistoryRequest = /\b(royal|king|queen|knight|castle|palace|crown|throne|medieval|monarchy|nobility)/i.test(messageText);
      const isCulturalRequest = /\b(culture|heritage|tradition|history|museum|temple|shrine|monument)/i.test(messageText);

      const shouldSearchNow = hasDestination || hasActivityIntent ||
                             isFishingRequest ||  // Any fishing request triggers search
                             isNinjaSamuraiRequest || // Ninja/samurai theme search
                             isRoyalHistoryRequest || // Royal history theme search
                             isCulturalRequest || // Cultural heritage search
                             (isWaterActivity && (hasDestination || hasGenericActivityWords)) ||
                             messageText.toLowerCase().includes('museum') ||
                             messageText.toLowerCase().includes('fishing') ||
                             messageText.toLowerCase().includes('charter') ||
                             (hasGenericActivityWords && isFishingRequest); // "I want to go fishing" pattern

      // Phase 3: Ambiguity Detection
      // This is a simplified check: if a destination is identified but no specific activity keywords are present.
      // A more robust implementation would involve intent parsing that explicitly returns `destinationId` and `tagIds`.
      const parsedIntent: { destination: { id: number | null; name: string | null }; tags: string[] } = { // Mocking an intent parser result
        destination: { id: null, name: null },
        tags: []
      };

      // Attempt to parse destination from message text
      const potentialDestinationMatch = messageText.match(/\b(?:in|to|visit|going|traveling)\s+([A-Z][a-zA-Z\s,]+)/i) ||
                                        messageText.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:trip|vacation|activities|tours)/i);

      if (potentialDestinationMatch && potentialDestinationMatch[1]) {
        const matchedName = potentialDestinationMatch[1].trim();
        parsedIntent.destination.name = matchedName;
        // In a real scenario, you'd fetch the destination ID here
        const foundDestination = HARDCODED_DESTINATIONS.find(d => d.name.toLowerCase() === matchedName.toLowerCase());
        if (foundDestination) {
          parsedIntent.destination.id = foundDestination.id;
        }
      } else if (updatedPreferences?.destination?.name) {
        parsedIntent.destination.name = updatedPreferences.destination.name;
        parsedIntent.destination.id = updatedPreferences.destination.id;
      }

      // Check for specific activity keywords to determine if the query is ambiguous
      const specificActivityKeywords = ['museum', 'art', 'gallery', 'exhibition', 'culture', 'history', 'food', 'restaurant', 'culinary', 'dining', 'eat', 'taste', 'adventure', 'outdoor', 'hiking', 'kayak', 'bike', 'climb', 'beach', 'water', 'swim', 'surf', 'dive', 'snorkel', 'fish', 'fishing', 'charter', 'tour', 'sightseeing', 'visit', 'see', 'explore'];
      const hasSpecificActivity = specificActivityKeywords.some(keyword => messageText.toLowerCase().includes(keyword));

      const isAmbiguousQuery = parsedIntent.destination.id !== null && !hasSpecificActivity && (hasDestination || hasGenericActivityWords);

      // 🎯 CLARIFICATION DIALOGUE LOGIC
      // If query is ambiguous, generate clarification options instead of calling searchV2
      if (isAmbiguousQuery && parsedIntent.destination.id) {
        console.log(`🎯 AMBIGUOUS QUERY DETECTED: Generating clarification options for destination ID ${parsedIntent.destination.id}`);

        try {
          const { generateClarificationOptions } = await import('./services/anthropic');
          const clarificationResult = await generateClarificationOptions(parsedIntent.destination.id);

          if (clarificationResult.clarificationNeeded && clarificationResult.options.length > 0) {
            console.log(`✨ Generated ${clarificationResult.options.length} dynamic clarification options from top-rated products`);

            // Log the generated options for debugging
            clarificationResult.options.forEach((option, index) => {
              console.log(`  ${index + 1}. ${option.label}: ${option.tags?.length || 0} tags, ${option.searchTerms?.length || 0} search terms`);
            });

            return res.json({
              recommendations: [],
              shouldShowRecommendations: false,
              sessionId: conversation.sessionId,
              destination: clarificationResult.destination,
              searchQuery: null,
              clarificationNeeded: true,
              clarificationOptions: clarificationResult.options,
              ambiguousQuery: true
            });
          }
        } catch (error) {
          console.error('❌ Error generating clarification options:', error);
          // Fall through to normal search behavior on error
        }
      }


      if (shouldSearchNow) {
        try {
          // Import multi-destination matcher
          const { multiDestinationMatcher } = await import('./services/multi-destination-matcher');
          const { smartDestinationMatcher } = await import('./services/smart-destination-matcher');

          const destinations = await enhancedViatorService.getDestinations();
          smartDestinationMatcher.setDestinations(destinations);

          // Extract search query and destination
          const searchQuery = extractActivityKeywords(messageText, updatedPreferences);
          const cleanQuery = cleanSearchQuery(searchQuery);

          // Extract search query from the message content - check both user and assistant messages
          let searchContent = lastMessage ? lastMessage.text : messageText;

          // If last message is from assistant, look for destination mentions in recent conversation
          if (lastMessage && lastMessage.sender === 'ai') {
            console.log(`🤖 Last message from assistant, checking conversation history for destination...`);

            // Look for destination in the conversation history
            for (let i = conversationHistory.length - 1; i >= Math.max(0, conversationHistory.length - 5); i--) {
              const message = conversationHistory[i];
              if (message.sender === 'user') {
                const userExtraction = smartDestinationMatcher.extractDestinationFromSearch(message.text, destinations);
                if (userExtraction) {
                  searchContent = message.text;
                  console.log(`🔍 Found destination in user message: "${message.text}"`);
                  break;
                }
              }
            }

            // Also check assistant message for destination mentions
            const assistantExtraction = smartDestinationMatcher.extractDestinationFromSearch(lastMessage.text, destinations);
            if (assistantExtraction && !searchContent.includes(assistantExtraction.name)) {
              searchContent = lastMessage.text;
            }
          }

          const extractedDestination = smartDestinationMatcher.extractDestinationFromSearch(searchContent, destinations);
          console.log(`🔍 Analyzing search term: "${searchContent}"`);

          if (extractedDestination) {
            console.log(`🎯 Extracted destination: ${extractedDestination.name} (ID: ${extractedDestination.id})`);
          } else {
            console.log(`❌ No destination extracted from: "${searchContent}"`);
            console.log(`🚨 BUG ALERT: This explains why we're not finding Lisbon - destination extraction failing!`);
          }


          if (extractedDestination) {
            // Get related destination IDs - but be more conservative for major cities
            let relatedDestinationIds = multiDestinationMatcher.findDestinationIdsForLocation(
              extractedDestination.name,
              extractedDestination.name,
              extractedDestination.id
            );

            // ENHANCED: For major cities, be much more restrictive to prevent cross-contamination
            const primaryCities = ['tokyo', 'paris', 'london', 'rome', 'barcelona', 'new york'];
            const isPrimaryCity = primaryCities.some(city => extractedDestination.name.toLowerCase().includes(city));

            if (isPrimaryCity) {
              console.log(`🎯 PRIMARY CITY DETECTED: ${extractedDestination.name} - using STRICT single-destination filtering`);
              // For primary cities, ONLY use the main destination ID to prevent contamination
              relatedDestinationIds = [extractedDestination.id];
              console.log(`🔒 STRICT SINGLE-DESTINATION: Only using ${extractedDestination.id} for maximum accuracy`);
            } else {
              console.log(`🔍 Found ${relatedDestinationIds.length} related destination IDs, limiting to 3 for accuracy`);
              relatedDestinationIds = relatedDestinationIds.slice(0, 3); // Limit non-primary cities too
            }

            // Special handling for Hawaii fishing searches
            if (multiDestinationMatcher.isHawaiiSearch(searchContent) &&
                (cleanQuery.includes('fish') || cleanQuery.includes('charter'))) {
              const hawaiiDestIds = multiDestinationMatcher.getHawaiiDestinationIds(cleanQuery);
              console.log(`🎣 FISHING IN HAWAII: Priority IDs: ${hawaiiDestIds.slice(0, 3).join(', ')}`);
              relatedDestinationIds.splice(0, 0, ...hawaiiDestIds.slice(0, 3));
            }

            let allRecommendations: any[] = [];
            let searchSuccessful = false;

            // Search destinations - limit based on city type
            const maxDestinations = isPrimaryCity ? Math.min(relatedDestinationIds.length, 2) : Math.min(relatedDestinationIds.length, 5);
            for (let i = 0; i < maxDestinations; i++) {
              const destId = relatedDestinationIds[i];

              try {
                // PHASE 1: NEW AI-INFORMED SEARCH for venues from AI messages
                let aiInformedResults: any[] = [];
                
                let searchMessage = null;
                console.log(`🔍 AI-INFORMED SEARCH TRIGGER: Checking for venue-specific content for ${extractedDestination.name}`);
                
                // Enhanced search message detection - check both assistant and user messages
                if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
                  const recentMessages = conversationHistory.slice(-4); // Check last 4 messages for better coverage
                  console.log(`🔍 Checking ${recentMessages.length} recent messages for venue content`);
                  
                  // First try: Look for assistant message mentioning destination
                  const currentAssistantMessage = recentMessages.reverse().find((msg: any) => {
                    const isAI = msg.sender === 'ai';
                    const hasText = msg.text && msg.text.trim().length > 0;
                    const mentionsDestination = msg.text?.toLowerCase().includes(extractedDestination.name.toLowerCase());
                    const hasVenueContent = msg.text && (
                      msg.text.toLowerCase().includes('museum') ||
                      msg.text.toLowerCase().includes('gallery') ||
                      msg.text.toLowerCase().includes('palace') ||
                      msg.text.toLowerCase().includes('cathedral') ||
                      msg.text.toLowerCase().includes('park') ||
                      msg.text.toLowerCase().includes('restaurant') ||
                      msg.text.toLowerCase().includes('market') ||
                      msg.text.toLowerCase().includes('bistro') ||
                      msg.text.toLowerCase().includes('cafe') ||
                      msg.text.toLowerCase().includes('culinary') ||
                      msg.text.toLowerCase().includes('food') ||
                      msg.text.toLowerCase().includes('dining') ||
                      msg.text.toLowerCase().includes('wine') ||
                      msg.text.toLowerCase().includes('cooking') ||
                      msg.text.toLowerCase().includes('tasting') ||
                      msg.text.toLowerCase().includes('visit') ||
                      msg.text.toLowerCase().includes('see') ||
                      msg.text.toLowerCase().includes('explore')
                    );
                    
                    console.log(`📝 Message check - AI: ${isAI}, hasText: ${hasText}, mentions dest: ${mentionsDestination}, venue content: ${hasVenueContent}`);
                    return isAI && hasText && mentionsDestination && hasVenueContent;
                  });
                  
                  if (currentAssistantMessage) {
                    searchMessage = currentAssistantMessage.text;
                    console.log(`✅ Found AI message with venue content for ${extractedDestination.name}`);
                  } else {
                    // Fallback: Check user messages for venue-specific requests
                    const currentUserMessage = recentMessages.find((msg: any) => {
                      const isUser = msg.sender === 'user';
                      const hasText = msg.text && msg.text.trim().length > 0;
                      const mentionsDestination = msg.text?.toLowerCase().includes(extractedDestination.name.toLowerCase());
                      const hasVenueRequest = msg.text && (
                        msg.text.toLowerCase().includes('museum') ||
                        msg.text.toLowerCase().includes('gallery') ||
                        msg.text.toLowerCase().includes('palace') ||
                        msg.text.toLowerCase().includes('cathedral') ||
                        msg.text.toLowerCase().includes('restaurant') ||
                        msg.text.toLowerCase().includes('market') ||
                        msg.text.toLowerCase().includes('bistro') ||
                        msg.text.toLowerCase().includes('cafe') ||
                        msg.text.toLowerCase().includes('culinary') ||
                        msg.text.toLowerCase().includes('food') ||
                        msg.text.toLowerCase().includes('dining') ||
                        msg.text.toLowerCase().includes('wine') ||
                        msg.text.toLowerCase().includes('cooking') ||
                        msg.text.toLowerCase().includes('cuisine') ||
                        msg.text.toLowerCase().includes('places') ||
                        msg.text.toLowerCase().includes('attractions') ||
                        msg.text.toLowerCase().includes('sights')
                      );
                      
                      console.log(`👤 User message check - hasText: ${hasText}, mentions dest: ${mentionsDestination}, venue request: ${hasVenueRequest}`);
                      return isUser && hasText && mentionsDestination && hasVenueRequest;
                    });
                    
                    if (currentUserMessage) {
                      searchMessage = currentUserMessage.text;
                      console.log(`✅ Found user message with venue request for ${extractedDestination.name}`);
                    }
                  }
                }
                
                if (searchMessage) {
                  console.log(`🧠 AI-INFORMED SEARCH: Extracting venue recommendations for ${extractedDestination.name}`);
                  console.log(`📄 Using message: "${searchMessage.substring(0, 150)}${searchMessage.length > 150 ? '...' : ''}"`);
                  
                  try {
                    const aiInformedSearch = await aiInformedSearchEngine.searchByAIRecommendations(
                      searchMessage,
                      destId,
                      extractedDestination.name,
                      'USD',
                      8
                    );
                    
                    if (aiInformedSearch.activities.length > 0) {
                      console.log(`✅ AI-INFORMED: Found ${aiInformedSearch.activities.length} venue-matched activities (confidence: ${aiInformedSearch.confidence}%)`);
                      aiInformedResults = aiInformedSearch.activities;
                    } else {
                      console.log(`ℹ️ AI-INFORMED: No venue-matched activities found for current destination`);
                    }
                  } catch (aiError) {
                    console.log(`⚠️ AI-informed search failed, continuing with standard search:`, aiError instanceof Error ? aiError.message : 'Unknown error');
                  }
                } else {
                  console.log(`ℹ️ No suitable message found for AI-informed search (need venue-related content mentioning ${extractedDestination.name})`);
                }

                // PHASE 2: ENHANCED THEMATIC SEARCH for better thematic accuracy
                const { thematicSearchEngine } = await import('./services/thematic-search-engine');

                let thematicResults = await thematicSearchEngine.executeThematicSearch(
                  cleanQuery,
                  destId,
                  extractedDestination.name,
                  'USD',
                  25
                );

                // PHASE 2.5: AUTOMATIC GOOGLE PLACES MUSEUM SEARCH for Museums & Arts theme
                let googleMuseumVenues: any[] = [];
                const isMuseumQuery = cleanQuery.toLowerCase().includes('museum') || 
                                    cleanQuery.toLowerCase().includes('gallery') || 
                                    cleanQuery.toLowerCase().includes('exhibit') ||
                                    cleanQuery.toLowerCase().includes('art');
                
                if (isMuseumQuery) {
                  console.log(`🏛️ MUSEUM QUERY DETECTED: Triggering Google Places museum search for ${extractedDestination.name}`);
                  
                  try {
                    const googlePlacesModule = await import('./services/google-places-service');
                    const placesResults = await googlePlacesModule.googlePlacesService.searchVenues(
                      'museum',
                      extractedDestination.name
                    );
                    
                    // Google Places service already returns properly formatted ActivityRecommendation[]
                    // Just add additional metadata for source identification
                    googleMuseumVenues = placesResults.map((venue: any) => ({
                      ...venue,
                      source: 'google-places',
                      isVenue: true,
                      _searchSource: 'google-places-museums'
                    }));
                    
                    console.log(`✅ GOOGLE PLACES MUSEUMS: Found ${googleMuseumVenues.length} museum venues`);
                  } catch (placesError) {
                    console.log(`⚠️ Google Places museum search failed:`, placesError instanceof Error ? placesError.message : 'Unknown error');
                  }
                }

                // PHASE 3: Combine AI-informed, thematic, and Google Places results with smart fusion
                let combinedResults: any[] = [];
                
                if (aiInformedResults.length > 0 && (thematicResults.length > 0 || googleMuseumVenues.length > 0)) {
                  console.log(`🎯 SMART FUSION: Combining ${aiInformedResults.length} AI-matched + ${thematicResults.length} thematic + ${googleMuseumVenues.length} Google Places activities`);
                  
                  // Prioritize AI-matched results with high matching scores
                  const highQualityAIResults = aiInformedResults.filter(a => (a._aiMatchingScore || 0) > 30);
                  const supplementaryThematic = thematicResults.filter(t => 
                    !aiInformedResults.some(ai => ai.productCode === t.productCode)
                  );
                  
                  combinedResults = [
                    ...googleMuseumVenues.slice(0, 4), // Top Google Places venues first for museums
                    ...highQualityAIResults.slice(0, 4), // Top AI matches
                    ...supplementaryThematic.slice(0, 7)  // Fill with thematic results
                  ];
                  
                  console.log(`🎭 FUSION RESULT: ${googleMuseumVenues.length} Google Places venues + ${highQualityAIResults.length} high-quality AI matches + ${supplementaryThematic.length} supplementary thematic`);
                } else if (aiInformedResults.length > 0) {
                  combinedResults = aiInformedResults;
                  console.log(`🧠 AI-ONLY: Using ${aiInformedResults.length} AI-informed results`);
                } else if (thematicResults.length > 0 || googleMuseumVenues.length > 0) {
                  combinedResults = [
                    ...googleMuseumVenues.slice(0, 5), // Prioritize Google Places museum venues
                    ...thematicResults.slice(0, 10) // Fill with thematic results
                  ];
                  console.log(`🎭 THEMATIC+VENUES: Using ${googleMuseumVenues.length} Google Places venues + ${thematicResults.length} thematic results`);
                }

                let cleanResult;
                if (combinedResults.length > 0) {
                  cleanResult = { activities: combinedResults };
                } else {
                  // Fall back to clean relevance engine
                  console.log(`🔄 Combined search returned no results, falling back to clean relevance engine for destination ${destId}`);
                  // Use Clean Relevance Engine for precise results with feature flag
                  const cleanResults = USE_V2_SEARCH ?
                    await cleanRelevanceEngine.searchV2({
                      query: cleanQuery,
                      destinationId: destId,
                      currency: 'USD',
                      limit: 15
                    }) :
                    await cleanRelevanceEngine.searchV1({
                      query: cleanQuery,
                      destinationId: destId,
                      currency: 'USD',
                      limit: 15
                    });
                  cleanResult = cleanResults
                }

                if (cleanResult.activities && cleanResult.activities.length > 0) {
                  console.log(`✅ Found ${cleanResult.activities.length} activities in destination ${destId}`);
                  allRecommendations.push(...cleanResult.activities);
                  searchSuccessful = true;

                  // For fishing in Hawaii, break early if we find good results
                  if (multiDestinationMatcher.isHawaiiSearch(searchContent) &&
                      cleanQuery.includes('fish') &&
                      cleanResult.activities.length >= 3) {
                    console.log(`🎣 Found sufficient fishing activities, stopping search`);
                    break;
                  }
                }
              } catch (searchError) {
                console.error(`Search failed for destination ${destId}:`, searchError);
              }

              // Small delay between requests
              if (i < relatedDestinationIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }

            // Process aggregated results
            if (searchSuccessful && allRecommendations.length > 0) {
              // Remove duplicates by productCode
              const uniqueRecommendations = allRecommendations.filter((activity, index, self) =>
                index === self.findIndex(a => a.productCode === activity.productCode)
              );

              // Enhanced location-specific scoring and filtering
              const locationFilteredRecommendations = uniqueRecommendations
                .map(activity => {
                  // Boost score for activities that explicitly mention the target location
                  const title = (activity.title || '').toLowerCase();
                  const description = (activity.description || '').toLowerCase();
                  const content = `${title} ${description}`;
                  const locationName = extractedDestination.name.toLowerCase();

                  let locationBoost = 0;
                  if (content.includes(locationName)) {
                    locationBoost = 0.5; // Major boost for explicit location mention
                    console.log(`🎯 LOCATION BOOST: "${activity.title}" mentions ${extractedDestination.name}`);
                  }

                  // Check for wrong location indicators
                  const wrongLocationTerms = ['kuala lumpur', 'malaysia', 'bangkok', 'singapore'];
                  const hasWrongLocation = wrongLocationTerms.some(term =>
                    content.includes(term) && !extractedDestination.name.toLowerCase().includes(term)
                  );

                  if (hasWrongLocation) {
                    console.log(`🚫 WRONG LOCATION: Filtering out "${activity.title}" for containing wrong location`);
                    return null; // Filter out wrong location activities
                  }

                  return {
                    ...activity,
                    finalScore: (activity.relevanceScore || activity.geoScore || 0) + locationBoost
                  };
                })
                .filter(activity => activity !== null); // Remove filtered activities

              // Sort by enhanced final score
              const sortedRecommendations = locationFilteredRecommendations
                .sort((a, b) => b.finalScore - a.finalScore);

              // CRITICAL FIX: Apply final geographic gate to prevent destination contamination
              console.log(`🚨 GEOGRAPHIC GATE: Filtering for destination ${extractedDestination.name} (ID: ${extractedDestination.id})`);
              const geoFilteredRecommendations = sortedRecommendations.filter(activity => {
                // Check destination ID match
                const activityDestId = activity.destination?.destinationId;
                const destMatches = activityDestId === extractedDestination.id;
                
                // Check destination name match
                const activityDestName = activity.destination?.name?.toLowerCase() || '';
                const targetDestName = extractedDestination.name.toLowerCase();
                const nameMatches = activityDestName.includes(targetDestName) || 
                                   targetDestName.includes(activityDestName);
                
                // Activity title check for destination
                const titleMentionsDestination = activity.title?.toLowerCase().includes(targetDestName);
                
                const isValid = destMatches || nameMatches || titleMentionsDestination;
                
                if (!isValid) {
                  console.log(`🚫 BLOCKED CONTAMINATION: "${activity.title}" (dest: ${activityDestName}, ID: ${activityDestId}) doesn't match ${targetDestName} (ID: ${extractedDestination.id})`);
                }
                
                return isValid;
              });

              const finalRecommendations = geoFilteredRecommendations.slice(0, 12);
              console.log(`🛡️ GEOGRAPHIC GATE: ${sortedRecommendations.length} → ${geoFilteredRecommendations.length} after destination filtering → ${finalRecommendations.length} final`);

              recommendations = finalRecommendations;

              console.log(`🎯 Multi-destination final selection: ${finalRecommendations.length} activities from ${uniqueRecommendations.length} unique results`);
              finalRecommendations.slice(0, 6).forEach((activity, index) => {
                console.log(`   ${index + 1}. "${activity.title}" (score: ${(activity.relevanceScore || activity.geoScore || 0).toFixed(3)})`);
              });
              shouldShowRecommendations = recommendations.length > 0;

              if (shouldShowRecommendations) {
                updatedPreferences.destination = {
                  id: extractedDestination.id,
                  name: extractedDestination.name,
                  country: (extractedDestination as any).country || 'Unknown'
                };
                updatedPreferences.lastSearchQuery = cleanQuery;

                console.log(`✅ Multi-destination search complete: ${recommendations.length} recommendations`);
                console.log(`📊 Top result: "${recommendations[0]?.title}"`);

                // Special handling for fishing in Hawaii - smart fallback strategy
                if (isFishingRequest) {
                  const fishingActivities = recommendations.filter(r =>
                    r.title.toLowerCase().includes('fish') ||
                    r.title.toLowerCase().includes('charter') ||
                    r.description?.toLowerCase().includes('fishing')
                  );

                  console.log(`🎣 FISHING RESULT: ${fishingActivities.length}/${recommendations.length} fishing activities`);

                  if (fishingActivities.length === 0) {
                    console.log(`🔄 FISHING FALLBACK: No fishing activities found, enhancing with alternatives`);

                    // Check if we need enhanced fallback
                    if (fallbackSystem.needsFishingFallback(recommendations, isFishingRequest)) {
                      const locationName = extractedDestination.name || 'unknown';
                      const enhancedRecommendations = fallbackSystem.enhanceWithFishingAlternatives(recommendations, locationName);

                      if (enhancedRecommendations.length > recommendations.length) {
                        console.log(`🎯 Enhanced with ${enhancedRecommendations.length - recommendations.length} fishing alternatives`);
                        recommendations = enhancedRecommendations;
                      }
                    }

                    // Log existing water activities
                    const waterActivities = recommendations.filter(r =>
                      r.title.toLowerCase().includes('boat') ||
                      r.title.toLowerCase().includes('cruise') ||
                      r.title.toLowerCase().includes('sail') ||
                      r.title.toLowerCase().includes('ocean') ||
                      r.title.toLowerCase().includes('sea') ||
                      r.title.toLowerCase().includes('marine')
                    );

                    console.log(`🚤 Found ${waterActivities.length} boat/water activities as alternatives`);
                    waterActivities.forEach((activity, index) => {
                      console.log(`   ${index + 1}. ${activity.title} (${activity.productCode})`);
                    });
                  }
                }
              } else if (isFishingRequest) {
                // Enhanced fishing fallback using the dedicated fallback system
                console.log(`🔄 ENHANCED FISHING FALLBACK: No results for fishing search, using fallback system...`);

                const locationName = extractedDestination.name || 'unknown';
                const fallbackRecommendations = fallbackSystem.getFishingAlternatives(locationName);

                if (fallbackRecommendations.length > 0) {
                  console.log(`🎣 Fallback system generated ${fallbackRecommendations.length} fishing alternatives`);
                  recommendations = fallbackRecommendations;
                  shouldShowRecommendations = true;

                  updatedPreferences.destination = {
                    id: extractedDestination.id,
                    name: extractedDestination.name,
                    country: (extractedDestination as any).country || 'Unknown'
                  };
                  updatedPreferences.lastSearchQuery = `fishing alternatives for ${locationName}`;

                  console.log(`✅ Enhanced fishing fallback complete: ${recommendations.length} curated alternatives`);
                } else {
                  // Backup fallback: try water activities search
                  try {
                    console.log(`🔄 Falling back to Clean Relevance Engine for "${cleanQuery}"`);
                    const fallbackResults = USE_V2_SEARCH ?
                      await cleanRelevanceEngine.searchV2({
                        query: cleanQuery,
                        destinationId: extractedDestination.id,
                        currency: 'USD',
                        limit: 8
                      }) :
                      await cleanRelevanceEngine.searchV1({
                        query: cleanQuery,
                        destinationId: extractedDestination.id,
                        currency: 'USD',
                        limit: 8
                      });

                    if (fallbackResults.activities && fallbackResults.activities.length > 0) {
                      console.log(`🚤 Backup fallback found ${fallbackResults.activities.length} water activities`);
                      recommendations = fallbackResults.activities.slice(0, 6);
                      shouldShowRecommendations = true;

                      updatedPreferences.destination = {
                        id: extractedDestination.id,
                        name: extractedDestination.name,
                        country: (extractedDestination as any).country || 'Unknown'
                      };
                      updatedPreferences.lastSearchQuery = 'water activities (fishing alternative)';
                    }
                  } catch (fallbackError) {
                    console.error(`❌ Backup fishing fallback failed:`, fallbackError);
                  }
                }
              }

              // PHASE 3: Ambiguity-aware search strategy
              if (isAmbiguousQuery) {
                console.log('🎯 AMBIGUOUS QUERY DETECTED: Using enhanced discovery mode');
                console.log(`📍 Destination: ${extractedDestination.name} (ID: ${extractedDestination.id})`);
                console.log('🔍 No specific activities detected - will provide diverse recommendations');
              }
            }
          }
        } catch (error) {
          console.error('Multi-destination search error:', error);
        }
      }

      res.json({
        recommendations: recommendations || [],
        shouldShowRecommendations,
        sessionId: conversation.sessionId,
        destination: updatedPreferences?.destination || null,
        searchQuery: updatedPreferences?.lastSearchQuery || null,
      });
    } catch (error) {
      console.error('Error processing recommendations:', error);
      res.status(500).json({ error: 'Failed to process recommendations' });
    }
  });

  // Handle clarification option selection
  app.post("/api/conversation/clarification-selection", async (req, res) => {
    try {
      const { sessionId, selectedOption, destinationId, originalQuery } = req.body;
      console.log('🎯 Clarification selection:', { selectedOption: selectedOption?.category, destinationId });

      if (!selectedOption || !destinationId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const conversation = await getOrCreateConversation(sessionId || nanoid());

      // Construct enhanced search query based on selected option
      const enhancedQuery = `${originalQuery || ''} ${selectedOption.searchTerms?.join(' ') || selectedOption.label}`.trim();
      console.log(`🔍 Enhanced query from clarification: "${enhancedQuery}"`);

      try {
        // Import multi-destination matcher
        const { multiDestinationMatcher } = await import('./services/multi-destination-matcher');
        const { smartDestinationMatcher } = await import('./services/smart-destination-matcher');

        const destinations = await enhancedViatorService.getDestinations();
        smartDestinationMatcher.setDestinations(destinations);

        // Find destination details
        const targetDestination = destinations.find(d => d.id === destinationId);

        if (!targetDestination) {
          console.error(`❌ Destination not found for ID: ${destinationId}`);
          return res.status(404).json({ error: 'Destination not found' });
        }

        console.log(`🎯 CLARIFICATION SEARCH: "${enhancedQuery}" in ${targetDestination.name} (ID: ${targetDestination.id})`);

        // Perform targeted search using the enhanced query and selected tags
        const cleanQuery = cleanSearchQuery(enhancedQuery);

        let searchResults;
        if (USE_V2_SEARCH) {
          searchResults = await cleanRelevanceEngine.searchV2({
            query: cleanQuery,
            destinationId: targetDestination.id,
            currency: 'USD',
            limit: 15,
            tags: selectedOption.tags || [],
            isAmbiguous: false // No longer ambiguous after clarification
          });
        } else {
          searchResults = await cleanRelevanceEngine.searchV1({
            query: cleanQuery,
            destinationId: targetDestination.id,
            currency: 'USD',
            limit: 15
          });
        }

        const recommendations = searchResults?.activities || [];
        console.log(`✅ Clarification search found ${recommendations.length} activities`);

        if (recommendations.length > 0) {
          // Update conversation preferences
          const updatedPreferences = {
            ...(conversation.travelPreferences || {}),
            destination: {
              id: targetDestination.id,
              name: targetDestination.name,
              country: (targetDestination as any).country || 'Unknown'
            },
            lastSearchQuery: enhancedQuery,
            selectedCategory: selectedOption.category
          };

          // Store the search in conversation
          await storage.updateConversation(conversation.sessionId, {
            messages: conversation.messages || [],
            travelPreferences: updatedPreferences,
            lastRecommendations: recommendations.slice(0, 12),
          });

          return res.json({
            recommendations: recommendations.slice(0, 12),
            shouldShowRecommendations: true,
            sessionId: conversation.sessionId,
            destination: updatedPreferences.destination,
            searchQuery: enhancedQuery,
            clarificationNeeded: false,
            selectedOption
          });
        } else {
          console.log(`❌ No results found for clarified search`);
          return res.json({
            recommendations: [],
            shouldShowRecommendations: false,
            sessionId: conversation.sessionId,
            destination: { id: destinationId, name: targetDestination.name },
            searchQuery: enhancedQuery,
            clarificationNeeded: false,
            error: 'No activities found for the selected category'
          });
        }

      } catch (searchError) {
        console.error('❌ Error in clarification search:', searchError);
        return res.status(500).json({ error: 'Search failed after clarification' });
      }

    } catch (error) {
      console.error('❌ Error handling clarification selection:', error);
      return res.status(500).json({ error: 'Failed to process clarification selection' });
    }
  });


  // Enhanced destination search endpoint for autocomplete (POST)
  app.post("/api/destinations/find", async (req, res) => {
    try {
      const { searchTerm } = req.body;

      // Handle empty query by returning popular suggestions
      if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
        const { enhancedLocationService } = await import('./services/enhanced-location-service');
        const popularResults = await enhancedLocationService.getPopularSuggestions(10);

        const formattedResults = popularResults.map(dest => ({
          destinationId: dest.id,
          destinationName: dest.displayName || dest.name,
          category: dest.category,
          isPopular: true
        }));

        return res.json({
          results: formattedResults,
          isPopularSuggestions: true
        });
      }

      const query = searchTerm.trim().toLowerCase();
      console.log(`🌍 Enhanced destination search for: "${query}"`);

      const { enhancedLocationService } = await import('./services/enhanced-location-service');
      const searchResults = await enhancedLocationService.searchDestinations(query, 15);

      // Format results for frontend
      const formattedResults = searchResults.destinations.map(dest => ({
        destinationId: dest.id,
        destinationName: dest.displayName || dest.name,
        category: dest.category,
        region: dest.region,
        isPopular: dest.category === 'popular'
      }));

      console.log(`✅ Enhanced search found ${formattedResults.length} matches for "${query}"`);
      if (formattedResults.length > 0) {
        const topMatches = formattedResults.slice(0, 3);
        console.log(`🎯 Top matches:`, topMatches.map(d => `${d.destinationName} (${d.category})`));
      }

      res.json({
        results: formattedResults,
        categorizedResults: searchResults.categorizedResults,
        isPopularSuggestions: false
      });
    } catch (error) {
      console.error('❌ Enhanced destination search error:', error);
      res.status(500).json({ results: [] });
    }
  });

  // Activity details endpoint
  app.get("/api/activities/:productCode/details", async (req, res) => {
    try {
      const { productCode } = req.params;
      console.log(`🔍 Fetching details for product: ${productCode}`);

      const productDetails = await viatorService.getProductDetails(productCode);

      if (productDetails) {
        console.log(`✅ Retrieved details for ${productCode}`);
        res.json(productDetails);
      } else {
        console.log(`❌ No details found for ${productCode}`);
        res.status(404).json({ error: 'Product not found' });
      }
    } catch (error) {
      console.error(`❌ Error fetching details for ${req.params.productCode}:`, error);
      res.status(500).json({ error: 'Failed to fetch activity details' });
    }
  });

  // Destination search endpoint for GET requests (used by other components)
  app.get("/api/destinations/search", async (req, res) => {
    try {
      const { query, limit = 10 } = req.query;

      if (!query || typeof query !== 'string') {
        return res.json({ results: [] });
      }

      // Import auxiliaryDataManager to get full destination database
      const { auxiliaryDataManager } = await import('./services/auxiliary-data-manager');
      const allDestinations = await auxiliaryDataManager.getDestinations();

      console.log(`🔍 Searching ${allDestinations.length} destinations for "${query}"`);

      const queryLower = query.toLowerCase();
      let matches = allDestinations
        .filter(dest => {
          const name = (dest.name || '').toLowerCase();
          return name.includes(queryLower) || name.startsWith(queryLower);
        });

      // Enhanced deduplication - remove similar destinations
      const deduplicatedMatches = matches.reduce((acc: typeof allDestinations, current) => {
        const currentName = (current.name || '').toLowerCase().trim();

        const exists = acc.find(existing => {
          const existingName = (existing.name || '').toLowerCase().trim();

          // Check for exact matches or subset relationships
          if (existingName === currentName) return true;

          // If one name contains the other, prefer the more specific one
          if (existingName.includes(currentName) || currentName.includes(existingName)) {
            // Replace with more descriptive version (usually includes country)
            if (current.name.includes(',') && !existing.name.includes(',')) {
              const index = acc.indexOf(existing);
              if (index > -1) acc[index] = current;
            } else if (!current.name.includes(',') && existing.name.includes(',')) {
              // Keep existing (more descriptive)
            } else if (currentName.length > existingName.length) {
              const index = acc.indexOf(existing);
              if (index > -1) acc[index] = current;
            }
            return true;
          }

          return false;
        });

        if (!exists) {
          acc.push(current);
        }

        return acc;
      }, []);

      // Sort results by relevance
      deduplicatedMatches.sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();

        // Exact matches first
        if (aName === queryLower && bName !== queryLower) return -1;
        if (aName !== queryLower && bName === queryLower) return 1;

        // Starts with query
        const aStarts = aName.startsWith(queryLower);
        const bStarts = bName.startsWith(queryLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Shorter names first (usually city names vs "City, Country")
        return aName.length - bName.length;
      });

      const finalResults = deduplicatedMatches.slice(0, parseInt(limit as string));

      console.log(`✅ Found ${finalResults.length} matching destinations (deduplicated from ${matches.length})`);

      res.json({
        results: finalResults,
        total: finalResults.length,
        matches: finalResults.map(dest => ({
          name: dest.name,
          region: dest.name.includes(',') ? dest.name.split(',')[1]?.trim() : null,
          id: dest.id
        }))
      });
    } catch (error) {
      console.error('Error searching destinations:', error);
      res.status(500).json({ results: [] });
    }
  });

  // Get conversation history
  app.get("/api/conversation/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const conversation = await storage.getConversation(sessionId);

      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json({
        messages: conversation.messages || [],
        preferences: conversation.travelPreferences,
        recommendations: conversation.lastRecommendations || [],
      });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // 🎯 CLEAN RELEVANCE ENGINE - Fresh focused approach with shadowing
  app.post('/api/search/clean', async (req, res) => {
    try {
      const {
        query,
        destinationId,
        currency = 'USD',
        limit = 12
      } = req.body;

      console.log(`🎯 CLEAN search request:`, { query, destinationId, currency });
      console.log(`🚩 Using search version: ${USE_V2_SEARCH ? 'V2' : 'V1'}`);

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          error: 'Query is required for search'
        });
      }

      if (!destinationId) {
        return res.status(400).json({
          error: 'Destination ID is required for search'
        });
      }

      const searchParams = {
        query: query.trim(),
        destinationId: parseInt(destinationId),
        currency,
        limit
      };

      if (USE_V2_SEARCH) {
        // V2 is active - use V2 for production
        console.log(`🎯 PRODUCTION: Using searchV2`);
        const result = await cleanRelevanceEngine.searchV2(searchParams);

        console.log(`✅ CLEAN search V2 completed: ${result.activities.length} activities found`);

        return res.json({
          success: true,
          activities: result.activities,
          confidence: result.confidence,
          totalFound: result.totalFound,
          strategy: result.strategy,
          metadata: {
            searchTimestamp: new Date().toISOString(),
            clean_engine: true,
            search_version: 'V2'
          }
        });
      } else {
        // V1 is active - use V1 for production, shadow with V2
        console.log(`🎯 PRODUCTION: Using searchV1 with V2 shadowing`);

        // Get V1 results for production response
        const v1Result = await cleanRelevanceEngine.searchV1(searchParams);

        console.log(`✅ CLEAN search V1 completed: ${v1Result.activities.length} activities found`);

        // Shadow with V2 in background (non-blocking)
        setImmediate(async () => {
          try {
            console.log(`🔍 SHADOW: Starting searchV2 comparison for query: "${query}"`);
            const shadowStartTime = Date.now();

            const v2Result = await cleanRelevanceEngine.searchV2(searchParams);

            const shadowDuration = Date.now() - shadowStartTime;
            console.log(`🔍 SHADOW: searchV2 completed in ${shadowDuration}ms`);

            // Compare results
            const comparison = {
              query: query.trim(),
              destinationId: parseInt(destinationId),
              timestamp: new Date().toISOString(),
              v1_results: {
                count: v1Result.activities.length,
                confidence: v1Result.confidence,
                totalFound: v1Result.totalFound,
                strategy: v1Result.strategy,
                top_3_titles: v1Result.activities.slice(0, 3).map(a => a.title)
              },
              v2_results: {
                count: v2Result.activities.length,
                confidence: v2Result.confidence,
                totalFound: v2Result.totalFound,
                strategy: v2Result.strategy,
                top_3_titles: v2Result.activities.slice(0, 3).map(a => a.title)
              },
              performance: {
                shadow_duration_ms: shadowDuration
              },
              differences: {
                count_diff: v2Result.activities.length - v1Result.activities.length,
                confidence_diff: v2Result.confidence - v1Result.confidence,
                strategy_match: v1Result.strategy === v2Result.strategy
              }
            };

            console.log(`📊 SHADOW COMPARISON:`, JSON.stringify(comparison, null, 2));

            // Log summary for easy monitoring
            console.log(`🔍 SHADOW SUMMARY: V1(${v1Result.activities.length}) vs V2(${v2Result.activities.length}) | Confidence: ${v1Result.confidence} vs ${v2Result.confidence} | Query: "${query}"`);

          } catch (shadowError) {
            console.error(`❌ SHADOW ERROR: searchV2 failed for query "${query}":`, shadowError);
          }
        });

        // Return V1 results immediately
        return res.json({
          success: true,
          activities: v1Result.activities,
          confidence: v1Result.confidence,
          totalFound: v1Result.totalFound,
          strategy: v1Result.strategy,
          metadata: {
            searchTimestamp: new Date().toISOString(),
            clean_engine: true,
            search_version: 'V1',
            shadowing_enabled: true
          }
        });
      }

    } catch (error) {
      console.error('❌ Clean search endpoint error:', error);
      return res.status(500).json({
        error: 'Clean search failed',
        activities: [],
        confidence: 0,
        totalFound: 0,
        strategy: 'error'
      });
    }
  });

  // 🧪 Destination cache testing endpoint
  app.get('/api/test/destination-cache', async (req, res) => {
    try {
      const { strategy = 'hybrid' } = req.query;

      console.log(`🧪 Testing destination cache comparison...`);

      // Import auxiliaryDataManager to get full destination database
      const { auxiliaryDataManager } = await import('./services/auxiliary-data-manager');

      // Test V1 (current)
      const v1Start = Date.now();
      const v1Results = await auxiliaryDataManager.getDestinations();
      const v1Time = Date.now() - v1Start;

      // Test V2
      const v2TestResult = await auxiliaryDataManager.testV2Cache(strategy as any);

      // Get cache statistics
      const v1Stats = auxiliaryDataManager.getCacheStats();
      const { destinationCacheV2 } = await import('./services/destination-cache-v2');
      const v2Stats = destinationCacheV2.getCacheStats();

      res.json({
        success: true,
        comparison: {
          v1: {
            count: v1Results.length,
            timeMs: v1Time,
            sample: v1Results.slice(0, 5).map(d => ({ id: d.id, name: d.name })),
            stats: v1Stats
          },
          v2: v2TestResult,
          v2Stats
        },
        recommendation: v2TestResult.success && (v2TestResult.count ?? 0) >= v1Results.length ?
          'V2 cache is ready for production' :
          'V1 cache remains recommended'
      });

    } catch (error) {
      console.error('❌ Cache test error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 🚀 Audio processing route
  app.post('/api/chat/audio', upload.single('audio'), async (req, res) => {
    try {
      const { sessionId } = req.body;
      const audioFile = req.file;

      if (!audioFile) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      console.log(`👂 Received audio for session: ${sessionId}`);

      const transcriptionText = await assemblyAIService.transcribeAudio(audioFile.buffer);

      if (!transcriptionText) {
        console.error('❌ Transcription failed or returned no text');
        return res.status(500).json({ error: 'Failed to transcribe audio' });
      }

      console.log(`🎤 Transcription: "${transcriptionText}"`);

      // Forward the transcribed text to the chat endpoint
      const chatResponse = await fetch(`http://localhost:${process.env.PORT || 5000}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: transcriptionText,
          sessionId: sessionId,
        }),
      });

      if (!chatResponse.ok) {
        console.error(`❌ Chat API returned error: ${chatResponse.status} ${chatResponse.statusText}`);
        return res.status(chatResponse.status).json({ error: 'Failed to get chat response' });
      }

      // Stream the chat response back to the client
      res.setHeader('x-vercel-ai-data-stream', 'v1');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = chatResponse.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: 'Failed to read chat response stream' });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();

    } catch (error) {
      console.error('Error processing audio chat:', error);
      res.status(500).json({ error: 'Failed to process audio chat' });
    }
  });


  // Get tag cache status
  app.get("/api/tags/status", async (req, res) => {
    try {
      const status = csvTagManager.getCacheStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting tag status:', error);
      res.status(500).json({ message: "Failed to get tag status" });
    }
  });

  // Get tags by category for exploration
  app.get("/api/tags/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const tags = csvTagManager.getTagsByCategory(category);
      res.json({ category, tags, count: tags.length });
    } catch (error) {
      console.error('Error getting tags by category:', error);
      res.status(500).json({ message: "Failed to get tags by category" });
    }
  });

  // Secure Google Places photo proxy endpoint
  app.get("/api/google-places/photo/:photoName", async (req, res) => {
    try {
      const { photoName } = req.params;
      const { maxWidthPx = '300', maxHeightPx = '200' } = req.query;

      // Validate parameters
      if (!photoName || typeof photoName !== 'string') {
        return res.status(400).json({ error: 'Invalid photo name' });
      }

      // Sanitize photo name to prevent path traversal
      if (!/^places\/[a-zA-Z0-9_-]+\/photos\/[a-zA-Z0-9_-]+$/.test(photoName)) {
        return res.status(400).json({ error: 'Invalid photo name format' });
      }

      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        console.error('❌ Google Places API key not configured');
        return res.status(503).json({ error: 'Service unavailable' });
      }

      // Validate dimensions
      const width = parseInt(maxWidthPx as string);
      const height = parseInt(maxHeightPx as string);
      if (isNaN(width) || isNaN(height) || width > 1600 || height > 1600) {
        return res.status(400).json({ error: 'Invalid dimensions' });
      }

      console.log(`🖼️ SECURE PROXY: Fetching photo ${photoName} (${width}x${height})`);

      // Fetch image from Google Places API
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&maxHeightPx=${height}&key=${apiKey}`;
      
      const response = await fetch(photoUrl);
      
      if (!response.ok) {
        console.error(`❌ Google Places photo fetch failed: ${response.status}`);
        return res.status(response.status === 404 ? 404 : 502).json({ 
          error: response.status === 404 ? 'Photo not found' : 'Failed to fetch photo' 
        });
      }

      // Set appropriate headers
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const contentLength = response.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('X-Content-Source', 'google-places-proxy');
      
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream the image data
      const imageBuffer = await response.arrayBuffer();
      res.send(Buffer.from(imageBuffer));

    } catch (error) {
      console.error('❌ Error in Google Places photo proxy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===================================================================
  // Itinerary routes
  //
  // Resolves the caller's identity the same way for every itinerary
  // endpoint (authenticated user id, else session id, else a
  // client-supplied guest id) and enforces ownership consistently,
  // instead of each handler re-implementing (or omitting) the check.
  // ===================================================================

  function resolveUserIdentifier(req: any): string | undefined {
    if (req.user) return (req.user as any).id;
    if (req.sessionID) return req.sessionID;
    const clientUserId = req.body?.clientUserId || req.query?.clientUserId;
    return typeof clientUserId === 'string' ? clientUserId : undefined;
  }

  function hasItineraryAccess(itinerary: { userId?: string }, userIdentifier: string | undefined): boolean {
    // Legacy itineraries with no owner remain accessible to anyone (matches
    // pre-existing data created before ownership tracking existed).
    return !itinerary.userId || itinerary.userId === userIdentifier;
  }

  async function loadOwnedItinerary(req: any, res: any, id: string) {
    const itinerary = await storage.getItinerary(id);
    if (!itinerary) {
      res.status(404).json({ error: 'Itinerary not found' });
      return null;
    }
    const userIdentifier = resolveUserIdentifier(req);
    if (!hasItineraryAccess(itinerary, userIdentifier)) {
      res.status(403).json({ error: 'Access denied' });
      return null;
    }
    return itinerary;
  }

  app.post('/api/itineraries', optionalAuth, async (req, res) => {
    try {
      const data = req.body;
      let userIdentifier = resolveUserIdentifier(req);
      if (!userIdentifier) {
        userIdentifier = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      if (!data.title || data.title.trim().length === 0) {
        return res.status(400).json({ error: 'Itinerary title is required' });
      }

      const itinerary = await storage.createItinerary({
        title: data.title.trim(),
        destination: data.destination || 'Travel Destination',
        startDate: data.startDate,
        endDate: data.endDate,
        userId: userIdentifier,
        conversationId: data.sessionId || data.conversationId,
        groupSize: data.groupSize || 1,
        budgetLimit: data.budgetLimit,
        travelStyle: data.travelStyle || 'mid-range',
      });

      res.json(itinerary);
    } catch (error) {
      console.error('❌ Error creating itinerary:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create itinerary' });
    }
  });

  app.get('/api/itineraries', optionalAuth, async (req, res) => {
    try {
      const userIdentifier = resolveUserIdentifier(req);
      const itineraries = await storage.getUserItineraries(userIdentifier);
      res.json(itineraries);
    } catch (error) {
      console.error('❌ Error fetching itineraries:', error);
      res.status(500).json({ error: 'Failed to fetch itineraries' });
    }
  });

  app.get('/api/itineraries/:id', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      res.json(itinerary);
    } catch (error) {
      console.error('❌ Error fetching itinerary:', error);
      res.status(500).json({ error: 'Failed to fetch itinerary' });
    }
  });

  app.delete('/api/itineraries/:id', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      await storage.deleteItinerary(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Error deleting itinerary:', error);
      res.status(500).json({ error: 'Failed to delete itinerary' });
    }
  });

  app.post('/api/itineraries/:id/days', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const day = await storage.addDayToItinerary(req.params.id, req.body);
      res.json(day);
    } catch (error) {
      console.error('❌ Error adding day to itinerary:', error);
      res.status(500).json({ error: 'Failed to add day to itinerary' });
    }
  });

  app.put('/api/itineraries/:id/days/:dayId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const day = await storage.updateItineraryDay(req.params.id, req.params.dayId, req.body);
      if (!day) return res.status(404).json({ error: 'Day not found' });
      res.json(day);
    } catch (error) {
      console.error('❌ Error updating day:', error);
      res.status(500).json({ error: 'Failed to update day' });
    }
  });

  app.delete('/api/itineraries/:id/days/:dayId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const success = await storage.removeDayFromItinerary(req.params.id, req.params.dayId);
      if (!success) return res.status(404).json({ error: 'Day not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Error removing day:', error);
      res.status(500).json({ error: 'Failed to remove day' });
    }
  });

  app.post('/api/itineraries/:id/days/:dayId/time-slots', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const timeSlot = await storage.addTimeSlotToDay(req.params.id, req.params.dayId, req.body);
      res.json(timeSlot);
    } catch (error) {
      console.error('❌ Error adding time slot:', error);
      res.status(500).json({ error: 'Failed to add time slot' });
    }
  });

  app.patch('/api/itineraries/:id/days/:dayId/time-slots/:slotId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const timeSlot = await storage.updateTimeSlot(req.params.id, req.params.dayId, req.params.slotId, req.body);
      if (!timeSlot) return res.status(404).json({ error: 'Time slot not found' });
      res.json(timeSlot);
    } catch (error) {
      console.error('❌ Error updating time slot:', error);
      res.status(500).json({ error: 'Failed to update time slot' });
    }
  });

  app.delete('/api/itineraries/:id/days/:dayId/time-slots/:slotId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const success = await storage.removeTimeSlot(req.params.id, req.params.dayId, req.params.slotId);
      if (!success) return res.status(404).json({ error: 'Time slot not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Error removing time slot:', error);
      res.status(500).json({ error: 'Failed to remove time slot' });
    }
  });

  app.post('/api/itineraries/:id/activities', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;

      const activity = req.body;
      let enhancedActivityData = activity.activityData;

      if (activity.activityData?.productCode) {
        try {
          const productDetails = await enhancedViatorService.getProductDetails(activity.activityData.productCode);
          if (productDetails) {
            enhancedActivityData = {
              ...activity.activityData,
              ...productDetails,
              title: productDetails.title || activity.activityData.title,
              description: productDetails.description || activity.activityData.description,
              imageUrl: productDetails.imageUrl || activity.activityData.imageUrl,
              images: productDetails.images || activity.activityData.images || [],
              price: productDetails.price || activity.activityData.price,
              duration: productDetails.duration || activity.activityData.duration,
              location: productDetails.location || activity.activityData.location,
              bookingUrl: productDetails.bookingUrl || activity.activityData.bookingUrl,
              inclusions: productDetails.inclusions || [],
              exclusions: productDetails.exclusions || [],
              whatToExpect: productDetails.whatToExpect || [],
              additionalInfo: productDetails.additionalInfo || [],
              cancellationPolicy: productDetails.cancellationPolicy || {},
              languages: productDetails.languages || [],
              accessibility: productDetails.accessibility || {},
              groupSize: productDetails.groupSize || {},
              meetingAndPickup: productDetails.meetingAndPickup || {},
              tags: productDetails.tags || activity.activityData.tags || [],
            };
          }

          if (itinerary.startDate && itinerary.endDate) {
            try {
              const availability = await enhancedViatorService.getProductAvailabilityAndPricing(
                activity.activityData.productCode,
                itinerary.startDate,
                itinerary.endDate
              );
              if (availability) {
                enhancedActivityData.availability = availability;
                enhancedActivityData.extractedStartTimes = availability.extractedStartTimes || [];
                enhancedActivityData.pricing = availability.pricing || enhancedActivityData.price;
              }
            } catch (availError) {
              console.log(`⚠️ Could not fetch availability for ${activity.activityData.productCode}`);
            }
          }
        } catch (detailError) {
          console.log(`⚠️ Could not fetch enhanced details for ${activity.activityData.productCode}`);
        }
      }

      const savedActivity = await storage.addActivityToItinerary(req.params.id, {
        ...activity,
        activityData: enhancedActivityData,
      });
      res.json(savedActivity);
    } catch (error) {
      console.error('❌ Error adding activity to itinerary:', error);
      res.status(500).json({ error: 'Failed to add activity to itinerary' });
    }
  });

  app.delete('/api/itineraries/:id/activities/:activityId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const removed = await storage.removeActivityFromItinerary(req.params.id, req.params.activityId);
      if (!removed) return res.status(404).json({ error: 'Activity not found in itinerary' });
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Error removing activity from itinerary:', error);
      res.status(500).json({ error: 'Failed to remove activity from itinerary' });
    }
  });

  app.patch('/api/itineraries/:id/activities/:activityId', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const updated = await storage.updateActivityInItinerary(req.params.id, req.params.activityId, req.body);
      if (!updated) return res.status(404).json({ error: 'Activity not found in itinerary' });
      res.json(updated);
    } catch (error) {
      console.error('❌ Error updating activity in itinerary:', error);
      res.status(500).json({ error: 'Failed to update activity in itinerary' });
    }
  });

  app.post('/api/itineraries/:id/share', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;

      const { shareType = 'link', expiresAt } = req.body;
      const shareToken = nanoid(16);
      const createdBy = resolveUserIdentifier(req);

      const share = await storage.createItineraryShare({
        id: nanoid(),
        itineraryId: req.params.id,
        shareToken,
        shareType,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: createdBy ?? 'anonymous',
        isActive: true,
        accessCount: 0,
      });

      const shareUrl = `${req.protocol}://${req.get('host')}/shared/${shareToken}`;
      res.json({ success: true, shareUrl, shareToken, expiresAt: share.expiresAt });
    } catch (error) {
      console.error('❌ Error creating share link:', error);
      res.status(500).json({ error: 'Failed to create share link' });
    }
  });

  app.get('/api/shared/:shareToken', async (req, res) => {
    try {
      const itinerary = await storage.getItineraryByShareToken(req.params.shareToken);
      if (!itinerary) return res.status(404).json({ error: 'Shared itinerary not found or expired' });
      res.json(itinerary);
    } catch (error) {
      console.error('❌ Error fetching shared itinerary:', error);
      res.status(500).json({ error: 'Failed to fetch shared itinerary' });
    }
  });

  app.post('/api/itineraries/:id/collaborators', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;

      const { email, role = 'viewer' } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const collaborator = await storage.addCollaborator({
        id: nanoid(),
        itineraryId: req.params.id,
        email,
        role,
        invitedBy: resolveUserIdentifier(req) ?? 'anonymous',
        status: 'pending',
        permissions: {},
        userId: null,
      });

      res.json({ success: true, collaborator, message: `Invitation sent to ${email}` });
    } catch (error) {
      console.error('❌ Error adding collaborator:', error);
      res.status(500).json({ error: 'Failed to add collaborator' });
    }
  });

  app.get('/api/itineraries/:id/collaborators', optionalAuth, async (req, res) => {
    try {
      const itinerary = await loadOwnedItinerary(req, res, req.params.id);
      if (!itinerary) return;
      const collaborators = await storage.getItineraryCollaborators(req.params.id);
      res.json(collaborators);
    } catch (error) {
      console.error('❌ Error fetching collaborators:', error);
      res.status(500).json({ error: 'Failed to fetch collaborators' });
    }
  });

  return createServer(app);
}