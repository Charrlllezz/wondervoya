import Anthropic from '@anthropic-ai/sdk';
import type { Message, TravelPreferences, MultiDayTrip, ActivityRecommendation } from '@shared/schema';
import { cleanRelevanceEngine } from './clean-relevance-engine';
import { enhancedViatorService } from './enhanced-viator';
import { multiProviderSearchEngine } from './multi-provider-search';

// the newest Anthropic model is "claude-sonnet-4-20250514" which was released May 14, 2025. Use this by default unless user has already selected claude-3-7-sonnet-20250219
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
});

export interface ConversationContext {
  messages: Message[];
  preferences?: TravelPreferences;
  multiDayTrip?: MultiDayTrip;
}

export interface AIResponse {
  message: string;
  preferences?: Partial<TravelPreferences>;
  shouldShowRecommendations: boolean;
  searchQuery?: string;
  isMultiDayTrip?: boolean;
  multiDayTrip?: Partial<MultiDayTrip>;
  currentDayRecommendations?: {
    day: number;
    timeSlot?: 'morning' | 'afternoon' | 'evening';
    searchQuery: string;
  };
  suggestedCategories?: Array<{
    label: string;
    query: string;
  }>;
  extractedDates?: {
    startDate?: string;
    endDate?: string;
    specificDates?: string[];
    duration?: number;
  };
}

export class AnthropicService {
  // Format AI messages for better readability
  private formatMessage(message: string): string {
    if (!message) return message;

    let formatted = message;

    // Add line breaks before numbered lists (comprehensive approach)
    // Handle lists after punctuation or colons
    formatted = formatted.replace(/([.!?:]\s+)(\d+\.\s)/g, '$1\n$2');

    // Handle lists that appear inline without proper spacing
    formatted = formatted.replace(/([a-z)]\s+)(\d+\.\s)/g, '$1\n$2');

    // Add line breaks before bullet points (but not in the middle of sentences)
    formatted = formatted.replace(/([.!?]\s*)([•\-\*]\s)/g, '$1\n$2');

    // Add spacing around questions that start new thoughts
    formatted = formatted.replace(/(\?\s*)([A-Z][^a-z]*[a-z])/g, '$1\n\n$2');

    // Add spacing around key transition phrases (only at sentence boundaries)
    formatted = formatted.replace(/([.!?]\s*)(However|Additionally|Also|Furthermore|Meanwhile|For example),\s/g, '$1\n\n$2, ');

    // Add breaks before "Here are" or "I recommend" style phrases (only at sentence boundaries)
    formatted = formatted.replace(/([.!?]\s*)(Here are|I recommend|I suggest|Consider|You might also|Perfect for)/g, '$1\n\n$2');

    // Preserve date ranges and hyphenated terms
    formatted = formatted.replace(/(\w+)\s*\n\s*(-\s*\w+)/g, '$1$2');

    // Clean up excessive line breaks
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace
    formatted = formatted.trim();

    return formatted;
  }

  // Enhanced helper methods for better conversation understanding
  private extractBasicPreferences(userMessage: string, context: ConversationContext): Partial<TravelPreferences> {
    const message = userMessage.toLowerCase();
    const preferences: Partial<TravelPreferences> = {};

    // Extract destination more intelligently
    const destinationPatterns = [
      /(?:going to|visiting|traveling to|trip to|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:trip|vacation|travel|visit)/gi
    ];

    for (const pattern of destinationPatterns) {
      const match = pattern.exec(userMessage);
      if (match) {
        preferences.destination = match[1];
        break;
      }
    }

    // Extract interests with more nuance
    const interests = [];
    if (message.includes('water') || message.includes('ocean') || message.includes('kayak') || message.includes('snorkel')) {
      interests.push('water_activities');
    }
    if (message.includes('culture') || message.includes('museum') || message.includes('history')) {
      interests.push('cultural');
    }
    if (message.includes('food') || message.includes('dining') || message.includes('restaurant')) {
      interests.push('culinary');
    }
    if (message.includes('adventure') || message.includes('hiking') || message.includes('outdoor')) {
      interests.push('adventure');
    }
    if (message.includes('romantic') || message.includes('couples') || message.includes('honeymoon')) {
      interests.push('romantic');
    }

    if (interests.length > 0) {
      preferences.interests = interests;
    }

    // Extract group size - handle solo travel and explicit numbers
    if (message.includes('solo') || message.includes('by myself') || message.includes('alone') || message.includes('just me')) {
      preferences.groupSize = 1;
    } else {
      const groupSizeMatch = message.match(/(\d+)\s+(?:people|person|traveler|adult|guest)/);
      if (groupSizeMatch) {
        preferences.groupSize = parseInt(groupSizeMatch[1]);
      }
    }

    return preferences;
  }

  private extractDatesFromText(userMessage: string): any {
    const message = userMessage.toLowerCase();
    const currentYear = new Date().getFullYear();
    const extractedDates: any = {};

    // Month names mapping
    const months: { [key: string]: string } = {
      'january': '01', 'february': '02', 'march': '03', 'april': '04',
      'may': '05', 'june': '06', 'july': '07', 'august': '08',
      'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };

    // Enhanced date patterns to handle range formats like "July 18-20, 2025" - EXACT PRESERVATION
    const datePatterns = [
      // Range patterns like "July 18-20, 2025" - EXACT MATCH - HIGHEST PRIORITY
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/gi,
      // Range patterns like "July 18-20 2025" 
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/gi,
      // Direct ISO patterns - PRESERVE AS-IS
      /(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\d{4})-(\d{1,2})-(\d{1,2})/g, // "2025-07-18 - 2025-07-20"
    ];

    // Duration patterns - but DON'T use for modification if exact dates found
    const durationMatch = message.match(/(\d+)\s+day[s]?/);
    let extractedDuration = null;
    if (durationMatch) {
      extractedDuration = parseInt(durationMatch[1]);
    }

    // Try to extract specific DATE RANGES FIRST
    for (const pattern of datePatterns) {
      const matches = Array.from(userMessage.matchAll(pattern));
      if (matches.length > 0) {
        const match = matches[0];

        // Handle range patterns like "July 18-20, 2025" - PRESERVE EXACT RANGE
        if (match.length >= 5 && match[3] && match[4]) {
          const monthName = match[1].toLowerCase();
          const startDay = match[2].padStart(2, '0');
          const endDay = match[3].padStart(2, '0');
          const year = match[4];

          if (months[monthName]) {
            extractedDates.startDate = `${year}-${months[monthName]}-${startDay}`;
            extractedDates.endDate = `${year}-${months[monthName]}-${endDay}`;

            // Calculate duration based on actual date range
            const start = new Date(extractedDates.startDate);
            const end = new Date(extractedDates.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
            extractedDates.duration = diffDays;

            console.log(`✅ Extracted EXACT date range: ${extractedDates.startDate} to ${extractedDates.endDate} (${diffDays} days)`);
            return extractedDates;
          }
        }
        // Handle ISO date ranges - PRESERVE AS-IS
        else if (match.length >= 7) {
          extractedDates.startDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
          extractedDates.endDate = `${match[4]}-${match[5].padStart(2, '0')}-${match[6].padStart(2, '0')}`;

          // Calculate duration based on actual date range
          const start = new Date(extractedDates.startDate);
          const end = new Date(extractedDates.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          extractedDates.duration = diffDays;

          console.log(`✅ Extracted EXACT ISO date range: ${extractedDates.startDate} to ${extractedDates.endDate} (${diffDays} days)`);
          return extractedDates;
        }
      }
    }

    // Only set duration if no exact date range was found
    if (extractedDuration && !extractedDates.startDate) {
      extractedDates.duration = extractedDuration;
    }

    return extractedDates;
  }
  private async analyzeConversationContext(userMessage: string, previousMessages: Message[]): Promise<{
    categories: Array<{ label: string; query: string; }>;
    travelStyle: string;
    preferences: string[];
  }> {
    try {
      // Extract key information from conversation
      const fullConversation = [...previousMessages, { text: userMessage, sender: 'user' as const }];
      const conversationText = fullConversation.map(m => `${m.sender}: ${m.text}`).join('\n');

      // Use Anthropic AI for intelligent context analysis
      const contextPrompt = `Analyze this travel conversation and generate 3 highly specific, contextual activity suggestions.

Conversation:
${conversationText}

Instructions:
1. Identify the destination, travel style, interests, and group dynamics from the conversation
2. Generate 3 complementary activity suggestions that:
   - Are destination-specific and leverage local unique offerings
   - Complement what they've already searched for (don't repeat)
   - Match their evident travel style and preferences
   - Use engaging, specific language that sparks interest

3. Consider these destination-specific opportunities:
   - Hawaii: volcanoes, coffee farms, luaus, snorkeling spots, local culture
   - Paris: neighborhoods, food scenes, river activities
   - Japan: temples, traditional experiences, food culture, nature
   - Barcelona: architecture, flamenco, beach culture, tapas tours
   - Colorado: outdoor adventures, scenic drives, local breweries
   - And so on for other destinations...

4. Match travel styles:
   - Adventure seekers: thrilling, outdoor, active experiences
   - Cultural explorers: local traditions, historical sites, authentic experiences
   - Luxury travelers: premium, exclusive, high-end experiences
   - Families: kid-friendly, educational, safe activities
   - Couples: romantic, intimate, scenic experiences

Respond with JSON only:
{
  "categories": [
    {"label": "Specific Activity Category", "query": "destination specific-search-terms"},
    {"label": "Another Specific Category", "query": "destination other-specific-terms"},
    {"label": "Third Specific Category", "query": "destination third-specific-terms"}
  ],
  "travelStyle": "adventure|romantic|family|cultural|luxury|relaxation",
  "preferences": ["extracted_preference1", "extracted_preference2"]
}`;

      const response = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 500, // Reduced from 2000 to save costs
        messages: [{
          role: 'user',
          content: contextPrompt
        }],
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

      try {
        // Extract JSON from response that might be wrapped in markdown
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;

        const parsed = JSON.parse(jsonText);
        if (parsed.categories && parsed.categories.length > 0) {
          return parsed;
        }
      } catch (parseError) {
        console.error('JSON parsing error in context analysis:', parseError);
      }

      // Enhanced fallback with conversation analysis
      return this.generateEnhancedFallbackSuggestions(userMessage, previousMessages);
    } catch (error) {
      console.error('Context analysis error:', error);
      return this.generateEnhancedFallbackSuggestions(userMessage, previousMessages);
    }
  }

  private generateEnhancedFallbackSuggestions(userMessage: string, previousMessages: Message[]): {
    categories: Array<{ label: string; query: string; }>;
    travelStyle: string;
    preferences: string[];
  } {
    const allText = [...previousMessages.map(m => m.text), userMessage].join(' ').toLowerCase();

    // Extract destination from conversation
    let destination = '';
    if (allText.includes('hawaii') || allText.includes('kona') || allText.includes('maui')) {
      destination = 'Hawaii';
    } else if (allText.includes('paris') || allText.includes('france')) {
      destination = 'Paris';
    } else if (allText.includes('barcelona') || allText.includes('spain')) {
      destination = 'Barcelona';
    } else if (allText.includes('colorado') || allText.includes('boulder') || allText.includes('denver')) {
      destination = 'Colorado';
    } else if (allText.includes('tokyo') || allText.includes('kyoto') || allText.includes('japan')) {
      destination = 'Japan';
    }

    // Determine travel style from conversation patterns
    let travelStyle = 'cultural';
    if (allText.includes('adventure') || allText.includes('hiking') || allText.includes('kayak') || allText.includes('climbing')) {
      travelStyle = 'adventure';
    } else if (allText.includes('romantic') || allText.includes('couples') || allText.includes('honeymoon')) {
      travelStyle = 'romantic';
    } else if (allText.includes('family') || allText.includes('kids') || allText.includes('children')) {
      travelStyle = 'family';
    } else if (allText.includes('luxury') || allText.includes('premium') || allText.includes('exclusive')) {
      travelStyle = 'luxury';
    }

    // Generate destination-specific suggestions
    if (destination === 'Hawaii') {
      if (allText.includes('water') || allText.includes('kayak') || allText.includes('snorkel')) {
        return {
          categories: [
            { label: "Volcano National Park Tours", query: "Hawaii volcano national park Big Island tours" },
            { label: "Traditional Luau Experiences", query: "Hawaii authentic luau cultural experience" },
            { label: "Coffee Farm Adventures", query: "Kona coffee farm tours Hawaii plantation" }
          ],
          travelStyle,
          preferences: ["volcano", "cultural", "local_experiences"]
        };
      } else {
        return {
          categories: [
            { label: "Ocean Adventures", query: "Hawaii snorkeling diving water activities" },
            { label: "Scenic Helicopter Tours", query: "Hawaii helicopter tours scenic flights" },
            { label: "Beach Hopping Experiences", query: "Hawaii best beaches tours activities" }
          ],
          travelStyle,
          preferences: ["ocean", "scenic", "beaches"]
        };
      }
    }

    if (destination === 'Colorado') {
      return {
        categories: [
          { label: "Mountain Adventures", query: "Colorado hiking mountain tours scenic drives" },
          { label: "Local Brewery Tours", query: "Colorado brewery tours craft beer tasting" },
          { label: "Wildlife & Nature", query: "Colorado wildlife tours nature photography" }
        ],
        travelStyle,
        preferences: ["mountains", "outdoor", "local_culture"]
      };
    }

    if (destination === 'Barcelona') {
      return {
        categories: [
          { label: "Gaudi Architecture Tours", query: "Barcelona Gaudi architecture Sagrada Familia tours" },
          { label: "Flamenco & Local Culture", query: "Barcelona flamenco shows cultural experiences" },
          { label: "Tapas & Food Adventures", query: "Barcelona tapas tours food walking tours" }
        ],
        travelStyle,
        preferences: ["architecture", "culture", "food"]
      };
    }

    // Default intelligent suggestions based on activity patterns
    return this.generateFallbackSuggestions(userMessage);
  }

  private generateFallbackSuggestions(userMessage: string): {
    categories: Array<{ label: string; query: string; }>;
    travelStyle: string;
    preferences: string[];
  } {
    const message = userMessage.toLowerCase();

    if (message.includes('kayak') || message.includes('water') || message.includes('ocean')) {
      return {
        categories: [
          { label: "Water Adventures", query: "kayaking snorkeling water sports" },
          { label: "Boat Tours", query: "boat tour sailing cruise" },
          { label: "Marine Life", query: "dolphin whale watching marine" }
        ],
        travelStyle: "adventure",
        preferences: ["water_activities", "outdoor", "marine_life"]
      };
    }

    if (message.includes('romantic') || message.includes('couples') || message.includes('honeymoon')) {
      return {
        categories: [
          { label: "Romantic Experiences", query: "romantic couples sunset dinner" },
          { label: "Wine & Dining", query: "wine tasting gourmet dining" },
          { label: "Scenic Tours", query: "scenic private tour helicopter" }
        ],
        travelStyle: "romantic",
        preferences: ["romantic", "fine_dining", "scenic_views"]
      };
    }

    return {
      categories: [
        { label: "Popular Tours", query: "popular tours recommended" },
        { label: "Outdoor Activities", query: "outdoor adventure hiking" },
        { label: "Cultural Experiences", query: "cultural historical local" }
      ],
      travelStyle: "cultural",
      preferences: ["popular", "outdoor", "cultural"]
    };
  }

  async processConversation(context: ConversationContext, userMessage: string, templateInterests?: string): Promise<AIResponse> {
    const systemPrompt = `You are a helpful travel assistant that helps users plan their trips by understanding their preferences and recommending activities.

Your goals:
1. Extract travel information from user messages (destination, dates, budget, interests, group size)
2. Ask clarifying questions to better understand their needs
3. When you have enough information, indicate that recommendations should be shown

Current conversation context:
${context.preferences ? `Known preferences: ${JSON.stringify(context.preferences)}` : 'No preferences extracted yet'}
${templateInterests ? `Template interests provided: ${templateInterests}` : 'No template interests provided'}

Guidelines:
- Be conversational, friendly, and enthusiastic about travel planning
- Provide detailed, personalized responses that show expertise about destinations
- Ask 2-3 thoughtful clarifying questions to better understand their needs
- Share relevant insights about destinations, activities, and travel tips
- Focus on understanding: destination, activity interests, group details, trip specifics, and travel style
- When you recognize a destination, provide context about what makes it special for their interests
- Set shouldShowRecommendations to true when:
  * Initial search after gathering destination + interests + details
  * User explicitly asks for different types of activities (e.g., "show me cultural activities", "what about adventure tours")
  * User asks to "show me more" or requests specific activity categories
- ALWAYS perform fresh searches when users request different activity types - don't just provide text responses
- Create FOCUSED search queries for logical activity categories (e.g., "Kona Hawaii water activities" for snorkeling/kayaking, NOT "Kona Hawaii kayaking snorkeling volcano cultural")
- Group similar activities: water activities (snorkeling, kayaking), cultural experiences, adventure tours, food tours and cooking classes, etc.
- NEVER recommend restaurants, dining establishments, or individual meal reservations as we cannot book restaurant reservations
- Focus on bookable experiences like food tours, cooking classes, wine tastings, market visits instead of specific restaurants
- For multi-day trips, suggest planning one logical category at a time: "Let's start with water activities, then we can look at cultural experiences"
- Include exact location names and be specific to the category (e.g., "Kealakekua Bay Hawaii water activities")
- After showing recommendations and user saves some, proactively offer: "Great choices! Ready to explore [next category] for your trip?"
- Guide users through the workflow: search → save → move to next category → repeat

Respond with JSON in this format:
{
  "message": "Write a natural, conversational response to the user here - NOT JSON, but actual human-readable text that will be displayed in the chat",
  "preferences": {
    "destination": "extracted destination",
    "interests": ["extracted interests"],
    "budget": {"min": 0, "max": 500, "currency": "USD"},
    "dates": {"start": "2025-02-01", "end": "2025-02-07"},
    "groupSize": 2
  },
  "shouldShowRecommendations": false,
  "searchQuery": "destination activity-type",
  "suggestedCategories": [
    {"label": "Activity Category", "query": "destination specific-activity-type"},
    {"label": "Another Category", "query": "destination other-activity-type"}
  ],
  "extractedDates": {
    "startDate": "2025-06-10",
    "endDate": "2025-06-15",
    "specificDates": ["2025-06-10", "2025-06-12"],
    "duration": 5
  }
}

CRITICAL: The "message" field must contain natural conversational text that will be displayed directly to the user. NEVER put JSON, code, or structured data in the message field. Only the overall response structure should be JSON.

CRITICAL: Always extract date and destination information from user messages. Current date: June 4, 2025:
- Specific dates: "June 8th" → "2025-06-08", "July 15-20" → start: "2025-07-15", end: "2025-07-20"
- Month + day: "June 8" → "2025-06-08" (assume 2025 if no year specified)
- Relative dates: "tomorrow", "next week", "in 3 days" → calculate actual dates from June 4, 2025
- Duration: "5 day trip", "weekend", "week-long" → extract number of days
- Date ranges: "June 10-15" → extract both start and end dates
- Destinations: "Barcelona, Spain" → "Barcelona", "Paris, France" → "Paris", "Tokyo, Japan" → "Tokyo"
- ALWAYS include extractedDates in your response when ANY date is mentioned
- ALWAYS include destination in preferences when ANY location is mentioned
- ALWAYS use 2025 as the default year for any dates without a year specified

CRITICAL: When shouldShowRecommendations is true, you MUST ALWAYS include exactly 3 suggestedCategories that are:
1. CONTEXTUALLY RELEVANT to their specific destination and interests
2. COMPLEMENTARY to what they just searched for (not duplicative)
3. PERSONALIZED based on conversa

AMBIGUOUS QUERY HANDLING: If the user mentions a destination but no specific activities (e.g., "I'm going to Paris" or "What's there to do in Tokyo?"), acknowledge this and offer to show diverse popular options while asking for their interests to personalize further.tion patterns and travel style

Generate intelligent suggestions using this logic:
- Analyze their conversation for travel style indicators (luxury, budget, adventure, family, romantic, cultural, etc.)
- Consider their destination's unique offerings (Hawaii → volcanoes/beaches, Paris → museums/cafes, Tokyo → temples/food)
- Create follow-up categories that enhance their trip without repeating their current search
- Use specific, enticing language that reflects local experiences

Examples of GOOD contextual suggestions:
- Searched "kayaking Kona Hawaii" → suggest "Volcano National Park Tours", "Traditional Luau Experiences", "Coffee Farm Visits"
- Searched "museums Paris" → suggest "Seine River Cruises", "Montmartre Food Tours", "Palace Day Trips"
- Searched "temples Kyoto" → suggest "Sake Tasting Experiences", "Bamboo Forest Walks", "Traditional Ryokan Stays"
- Searched "food tours Barcelona" → suggest "Flamenco Shows", "Gaudi Architecture Tours", "Beach Club Experiences"

ALWAYS make suggestions destination-specific and experience-focused, not generic categories.

Only include preference fields that you can extract from the conversation. If no new preferences are found, omit the preferences field.`;

    try {
      const messages = [
        ...context.messages.map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.text
        })),
        {
          role: 'user' as const,
          content: userMessage
        }
      ];

      const response = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 3000, // Balanced: enough for quality responses, 63% reduction from original 8192
        system: systemPrompt,
        messages,
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

      try {
        const parsed = JSON.parse(responseText);

        // Use AI-generated suggestions when available, otherwise get intelligent context analysis
        let finalSuggestedCategories = parsed.suggestedCategories || [];

        if (!finalSuggestedCategories || finalSuggestedCategories.length === 0) {
          const contextAnalysis = await this.analyzeConversationContext(userMessage, context.messages);
          finalSuggestedCategories = contextAnalysis.categories;
        }

        // Prioritize template interests in the response
        let finalPreferences = parsed.preferences;
        if (templateInterests && templateInterests.trim()) {
          const templateInterestArray = templateInterests.split(/[,;|&+\n]/)
            .map(interest => interest.trim())
            .filter(interest => interest.length > 0);

          finalPreferences = {
            ...parsed.preferences,
            interests: templateInterestArray,
            templateInterests: templateInterests
          };
          console.log('🏷️ AI: Preserved template interests in preferences:', templateInterestArray);
        }

        return {
          message: this.formatMessage(parsed.message || "I'd be happy to help you plan your trip! Tell me about your destination and what activities interest you."),
          preferences: finalPreferences,
          shouldShowRecommendations: parsed.shouldShowRecommendations || false,
          searchQuery: templateInterests && templateInterests.trim() ? templateInterests : parsed.searchQuery,
          isMultiDayTrip: parsed.isMultiDayTrip || false,
          multiDayTrip: parsed.multiDayTrip,
          currentDayRecommendations: parsed.currentDayRecommendations,
          suggestedCategories: finalSuggestedCategories,
          extractedDates: parsed.extractedDates,
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          message: this.formatMessage(responseText || "I'd be happy to help you plan your trip! Tell me about your destination and what activities interest you."),
          shouldShowRecommendations: false,
        };
      }
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error('Failed to process conversation with AI assistant');
    }
  }

  async generateSearchQuery(preferences: TravelPreferences): Promise<string> {
    const destination = preferences.destination || '';
    const interests = preferences.interests?.join(' ') || 'activities';
    return `${destination} ${interests}`.trim();
  }

  async generateItineraryTitle(preferences: TravelPreferences, conversations: Message[]): Promise<string> {
    try {
      const conversationText = conversations.map(m => m.text).join(' ').toLowerCase();
      const year = new Date().getFullYear();

      // Extract location and activities from conversation
      let detectedLocation = '';
      let activities = [];

      // Location detection
      if (conversationText.includes('cancun') || conversationText.includes('mexico')) {
        detectedLocation = 'Cancun';
      } else if (conversationText.includes('hawaii') || conversationText.includes('kona')) {
        detectedLocation = 'Kona';
      } else if (conversationText.includes('dominican republic') || conversationText.includes('dominican')) {
        detectedLocation = 'Dominican Republic';
      } else if (conversationText.includes('paris') || conversationText.includes('france')) {
        detectedLocation = 'Paris';
      } else if (conversationText.includes('colorado') || conversationText.includes('boulder')) {
        detectedLocation = 'Colorado';
      } else if (conversationText.includes('tokyo') || conversationText.includes('japan')) {
        detectedLocation = 'Tokyo';
      }

      // Activity detection
      if (conversationText.includes('snorkel')) activities.push('Snorkeling');
      if (conversationText.includes('diving') || conversationText.includes('dive')) activities.push('Diving');
      if (conversationText.includes('kayak')) activities.push('Kayaking');
      if (conversationText.includes('zip') || conversationText.includes('zipline')) activities.push('Zipline');
      if (conversationText.includes('adventure')) activities.push('Adventure');
      if (conversationText.includes('culture') || conversationText.includes('historic')) activities.push('Cultural');
      if (conversationText.includes('food') || conversationText.includes('culinary')) activities.push('Food');

      // Use detected location or fall back to preferences
      const location = detectedLocation || preferences.destination || 'Travel';

      // Generate title based on activities
      if (activities.length > 0) {
        const mainActivity = activities[0];
        if (activities.length > 1) {
          return `${location} ${mainActivity} Adventure ${year}`;
        } else {
          return `${location} ${mainActivity} Trip ${year}`;
        }
      }

      // Fallback to simple location-based title
      return `${location} Trip ${year}`;

    } catch (error) {
      console.error('Error generating itinerary title:', error);
      const year = new Date().getFullYear();
      return `Travel Adventure ${year}`;
    }
  }

  private generateActivityResponse(
    query: string, 
    destination: string, 
    activities: ActivityRecommendation[], 
    confidence: number,
    breakdown?: { viator: number; tiqets: number }
  ): string {
    if (activities.length === 0) {
      return `I couldn't find specific activities for "${query}" in ${destination} at the moment. This might be due to limited availability or the search terms used. 

Try being more specific about the type of activity you're interested in, or ask about popular attractions in ${destination}.`;
    }

    const categoryInsight = this.generateCategoryInsight(activities);
    const providerInsight = breakdown ? this.generateProviderInsight(breakdown, query) : '';

    return `Perfect! I found ${activities.length} great ${query.toLowerCase()} options in ${destination}. ${categoryInsight}${providerInsight}

Here are my top recommendations:`;
  }

  private generateCategoryInsight(activities: ActivityRecommendation[]): string {
    if (activities.length === 0) return '';

    // Basic sentiment analysis based on activity names and descriptions
    const positiveKeywords = ['amazing', 'incredible', 'beautiful', 'stunning', 'must-see', 'top-rated', 'highly recommended'];
    const engagingKeywords = ['experience', 'adventure', 'discover', 'explore', 'immerse'];

    let positiveCount = 0;
    let engagingCount = 0;

    for (const activity of activities) {
      const text = `${activity.title} ${activity.description || ''}`.toLowerCase();
      if (positiveKeywords.some(keyword => text.includes(keyword))) {
        positiveCount++;
      }
      if (engagingKeywords.some(keyword => text.includes(keyword))) {
        engagingCount++;
      }
    }

    const totalActivities = activities.length;
    if (positiveCount / totalActivities > 0.5) {
      return 'Many of these are highly rated and offer a fantastic experience! ';
    } else if (engagingCount / totalActivities > 0.5) {
      return 'These look like great opportunities for adventure and discovery! ';
    }

    return '';
  }

  private generateProviderInsight(breakdown: { viator: number; tiqets: number }, query: string): string {
    const total = breakdown.viator + breakdown.tiqets;
    const hasViator = breakdown.viator > 0;
    const hasTiqets = breakdown.tiqets > 0;

    if (hasViator && hasTiqets) {
      return ` I've combined results from both tour experiences and cultural attractions to give you the best variety.`;
    } else if (hasTiqets && query.toLowerCase().includes('museum')) {
      return ` These are primarily museum and cultural site tickets with skip-the-line access.`;
    } else if (hasViator && (query.toLowerCase().includes('tour') || query.toLowerCase().includes('adventure'))) {
      return ` These are guided experiences and adventure activities.`;
    }

    return '';
  }
}

/**
 * 🎯 CLARIFICATION DIALOGUE LOGIC
 * Generates clarification options for ambiguous queries by fetching top-rated products and aggregating tags
 */
export async function generateClarificationOptions(destinationId: number): Promise<{
  clarificationNeeded: boolean;
  options: Array<{
    category: string;
    label: string;
    description: string;
    tags?: number[];
    searchTerms?: string[];
  }>;
  destination: {
    id: number;
    name: string;
  } | null;
}> {
  console.log(`🎯 Generating DYNAMIC clarification options for destination ID: ${destinationId}`);

  try {
    // Get destination name from our cache/database
    const { auxiliaryDataManager } = await import('./auxiliary-data-manager');
    const destinations = await auxiliaryDataManager.getDestinations();
    const destination = destinations.find(d => d.id === destinationId);

    if (!destination) {
      console.warn(`⚠️ No destination found for ID: ${destinationId}`);
      return {
        clarificationNeeded: true,
        options: [],
        destination: null
      };
    }

    const destinationName = destination.name;
    console.log(`🌍 Found destination: ${destinationName}`);

    // Fetch top-rated products and aggregate their tags
    const dynamicOptions = await fetchTopRatedProductsAndAggregateTags(destinationId, destinationName);

    // Fallback to static options if dynamic fetch fails
    if (dynamicOptions.length === 0) {
      console.log(`⚠️ No dynamic options found, using destination-specific fallback`);
      const fallbackOptions = await generateDestinationSpecificOptions(destinationName, destinationId);
      return {
        clarificationNeeded: true,
        options: fallbackOptions,
        destination: {
          id: destinationId,
          name: destinationName
        }
      };
    }

    return {
      clarificationNeeded: true,
      options: dynamicOptions,
      destination: {
        id: destinationId,
        name: destinationName
      }
    };

  } catch (error) {
    console.error('❌ Error generating clarification options:', error);
    return {
      clarificationNeeded: true,
      options: getGenericClarificationOptions(),
      destination: null
    };
  }
}

/**
 * 🚀 DYNAMIC OPTION GENERATION
 * Fetches top-rated products and aggregates their tags to generate relevant clarification options
 */
async function fetchTopRatedProductsAndAggregateTags(destinationId: number, destinationName: string): Promise<Array<{
  category: string;
  label: string;
  description: string;
  tags?: number[];
  searchTerms?: string[];
}>> {
  try {
    console.log(`🔍 Fetching top-rated products for ${destinationName} (ID: ${destinationId})`);

    // Import Viator service for API call
    const { viatorService } = await import('./viator');
    const { csvTagManager } = await import('./csv-tag-manager');

    // Make API call to get top-rated products for this destination
    const response = await viatorService.axiosInstance.post('/products/search', {
      filtering: {
        destination: destinationId.toString(),
        includeAutomaticTranslations: true
      },
      sorting: {
        sort: "TRAVELER_RATING",
        order: "DESCENDING"
      },
      pagination: {
        start: 1,
        count: 50 // Get more products to have better tag diversity
      },
      currency: "USD"
    });

    const products = response.data?.products || [];
    console.log(`📊 Retrieved ${products.length} top-rated products for analysis`);

    if (products.length === 0) {
      return [];
    }

    // Aggregate tags from all products
    const tagFrequency = new Map<number, { count: number; names: Set<string> }>();

    for (const product of products) {
      if (product.tags && Array.isArray(product.tags)) {
        for (const tag of product.tags) {
          if (tag.tagId && tag.tagName) {
            if (!tagFrequency.has(tag.tagId)) {
              tagFrequency.set(tag.tagId, { count: 0, names: new Set() });
            }
            const tagData = tagFrequency.get(tag.tagId)!;
            tagData.count++;
            tagData.names.add(tag.tagName.toLowerCase());
          }
        }
      }
    }

    // Sort tags by frequency and get the most popular ones
    const sortedTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15); // Get top 15 most frequent tags

    console.log(`🏷️ Found ${sortedTags.length} popular tags, aggregating into categories...`);

    // Group tags into logical categories
    const categoryGroups = groupTagsIntoCategories(sortedTags, destinationName);

    // Convert to clarification options format
    const options = categoryGroups.map(group => ({
      category: group.category,
      label: group.label,
      description: group.description,
      tags: group.tagIds,
      searchTerms: group.searchTerms
    }));

    console.log(`✅ Generated ${options.length} dynamic clarification options from API data`);
    return options;

  } catch (error) {
    console.error(`❌ Failed to fetch top-rated products for destination ${destinationId}:`, error);
    return [];
  }
}

/**
 * 🗂️ GROUP TAGS INTO LOGICAL CATEGORIES
 * Takes frequent tags and groups them into user-friendly categories
 */
function groupTagsIntoCategories(sortedTags: Array<[number, { count: number; names: Set<string> }]>, destinationName: string): Array<{
  category: string;
  label: string;
  description: string;
  tagIds: number[];
  searchTerms: string[];
}> {
  const categories = {
    cultural: { tagIds: [] as number[], names: [] as string[], count: 0 },
    adventure: { tagIds: [] as number[], names: [] as string[], count: 0 },
    food: { tagIds: [] as number[], names: [] as string[], count: 0 },
    water: { tagIds: [] as number[], names: [] as string[], count: 0 },
    sightseeing: { tagIds: [] as number[], names: [] as string[], count: 0 },
    entertainment: { tagIds: [] as number[], names: [] as string[], count: 0 },
    nature: { tagIds: [] as number[], names: [] as string[], count: 0 }
  };

  // Categorize tags based on their names
  for (const [tagId, tagData] of sortedTags) {
    const tagNames = Array.from(tagData.names).join(' ').toLowerCase();
    let categorized = false;

    // Cultural & Historical
    if (tagNames.includes('cultural') || tagNames.includes('museum') || tagNames.includes('historical') || 
        tagNames.includes('heritage') || tagNames.includes('art') || tagNames.includes('monument') ||
        tagNames.includes('temple') || tagNames.includes('church') || tagNames.includes('palace')) {
      categories.cultural.tagIds.push(tagId);
      categories.cultural.names.push(...tagData.names);
      categories.cultural.count += tagData.count;
      categorized = true;
    }

    // Adventure & Outdoor
    if (tagNames.includes('adventure') || tagNames.includes('hiking') || tagNames.includes('climbing') ||
        tagNames.includes('outdoor') || tagNames.includes('extreme') || tagNames.includes('zip') ||
        tagNames.includes('safari') || tagNames.includes('volcano')) {
      categories.adventure.tagIds.push(tagId);
      categories.adventure.names.push(...tagData.names);
      categories.adventure.count += tagData.count;
      categorized = true;
    }

    // Food & Culinary
    if (tagNames.includes('food') || tagNames.includes('culinary') || tagNames.includes('wine') ||
        tagNames.includes('tasting') || tagNames.includes('cooking') || tagNames.includes('restaurant') ||
        tagNames.includes('market') || tagNames.includes('gastronomy')) {
      categories.food.tagIds.push(tagId);
      categories.food.names.push(...tagData.names);
      categories.food.count += tagData.count;
      categorized = true;
    }

    // Water Activities
    if (tagNames.includes('water') || tagNames.includes('boat') || tagNames.includes('cruise') ||
        tagNames.includes('diving') || tagNames.includes('snorkeling') || tagNames.includes('swimming') ||
        tagNames.includes('fishing') || tagNames.includes('kayak') || tagNames.includes('surf')) {
      categories.water.tagIds.push(tagId);
      categories.water.names.push(...tagData.names);
      categories.water.count += tagData.count;
      categorized = true;
    }

    // Entertainment & Shows
    if (tagNames.includes('show') || tagNames.includes('entertainment') || tagNames.includes('performance') ||
        tagNames.includes('music') || tagNames.includes('theater') || tagNames.includes('concert') ||
        tagNames.includes('dance') || tagNames.includes('nightlife')) {
      categories.entertainment.tagIds.push(tagId);
      categories.entertainment.names.push(...tagData.names);
      categories.entertainment.count += tagData.count;
      categorized = true;
    }

    // Nature & Wildlife
    if (tagNames.includes('nature') || tagNames.includes('wildlife') || tagNames.includes('park') ||
        tagNames.includes('garden') || tagNames.includes('scenic') || tagNames.includes('photography') ||
        tagNames.includes('bird') || tagNames.includes('animal')) {
      categories.nature.tagIds.push(tagId);
      categories.nature.names.push(...tagData.names);
      categories.nature.count += tagData.count;
      categorized = true;
    }

    // Default to sightseeing if not categorized
    if (!categorized) {
      categories.sightseeing.tagIds.push(tagId);
      categories.sightseeing.names.push(...tagData.names);
      categories.sightseeing.count += tagData.count;
    }
  }

  // Convert to output format, only including categories that have tags
  const result = [];

  if (categories.cultural.tagIds.length > 0) {
    result.push({
      category: 'cultural',
      label: 'Cultural & Historical',
      description: `Explore museums, art galleries, historical sites, and cultural traditions in ${destinationName}`,
      tagIds: categories.cultural.tagIds,
      searchTerms: [...new Set(categories.cultural.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.adventure.tagIds.length > 0) {
    result.push({
      category: 'adventure',
      label: 'Adventure & Outdoor',
      description: `Find thrilling outdoor activities, adventure sports, and nature experiences in ${destinationName}`,
      tagIds: categories.adventure.tagIds,
      searchTerms: [...new Set(categories.adventure.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.food.tagIds.length > 0) {
    result.push({
      category: 'food',
      label: 'Food & Culinary',
      description: `Discover local cuisine, food tours, cooking classes, and dining experiences in ${destinationName}`,
      tagIds: categories.food.tagIds,
      searchTerms: [...new Set(categories.food.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.water.tagIds.length > 0) {
    result.push({
      category: 'water',
      label: 'Water Activities',
      description: `Enjoy water sports, boat tours, marine life experiences, and aquatic adventures in ${destinationName}`,
      tagIds: categories.water.tagIds,
      searchTerms: [...new Set(categories.water.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.entertainment.tagIds.length > 0) {
    result.push({
      category: 'entertainment',
      label: 'Shows & Entertainment',
      description: `Experience live shows, performances, nightlife, and entertainment in ${destinationName}`,
      tagIds: categories.entertainment.tagIds,
      searchTerms: [...new Set(categories.entertainment.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.nature.tagIds.length > 0) {
    result.push({
      category: 'nature',
      label: 'Nature & Wildlife',
      description: `Connect with nature through parks, wildlife tours, and scenic experiences in ${destinationName}`,
      tagIds: categories.nature.tagIds,
      searchTerms: [...new Set(categories.nature.names.map(n => n.toLowerCase()))]
    });
  }

  if (categories.sightseeing.tagIds.length > 0) {
    result.push({
      category: 'sightseeing',
      label: 'Tours & Sightseeing',
      description: `Take guided tours, see famous landmarks, and discover the highlights of ${destinationName}`,
      tagIds: categories.sightseeing.tagIds,
      searchTerms: [...new Set(categories.sightseeing.names.map(n => n.toLowerCase()))]
    });
  }

  // Sort by tag count (popularity) and return top 6
  return result
    .sort((a, b) => {
      const aCount = categories[a.category as keyof typeof categories]?.count || 0;
      const bCount = categories[b.category as keyof typeof categories]?.count || 0;
      return bCount - aCount;
    })
    .slice(0, 6);
}

/**
 * 🌍 Generate destination-specific clarification options
 */
async function generateDestinationSpecificOptions(destinationName: string, destinationId: number) {
  const destLower = destinationName.toLowerCase();

  // Base categories that work for most destinations
  const baseOptions = [
    {
      category: 'cultural',
      label: 'Cultural Experiences',
      description: `Explore museums, art galleries, historical sites, and local traditions in ${destinationName}`,
      tags: [12716, 11901, 21598], // Tours & Sightseeing, Cultural Tours, Art & Culture
      searchTerms: ['cultural tours', 'museums', 'art galleries', 'historical sites', 'heritage']
    },
    {
      category: 'food',
      label: 'Food & Culinary',
      description: `Discover local cuisine, food tours, cooking classes, and dining experiences in ${destinationName}`,
      tags: [21912, 21516, 20214], // Food & Drink, Shows & Performances, Flamenco (culinary shows)
      searchTerms: ['food tours', 'cooking classes', 'culinary experiences', 'local cuisine', 'food markets']
    },
    {
      category: 'adventure',
      label: 'Adventure & Outdoor',
      description: `Find outdoor activities, adventure sports, and nature experiences in ${destinationName}`,
      tags: [12716], // General adventure/outdoor tag
      searchTerms: ['outdoor activities', 'adventure sports', 'nature tours', 'hiking', 'water sports']
    },
    {
      category: 'entertainment',
      label: 'Shows & Entertainment',
      description: `Experience live shows, performances, nightlife, and entertainment in ${destinationName}`,
      tags: [21516, 11908, 21662], // Shows & Performances, Theater Shows, Classical Concerts
      searchTerms: ['shows', 'performances', 'theater', 'concerts', 'nightlife']
    },
    {
      category: 'sightseeing',
      label: 'Tours & Sightseeing',
      description: `Take guided tours, see famous landmarks, and discover the highlights of ${destinationName}`,
      tags: [12716, 11901], // Tours & Sightseeing, Cultural Tours
      searchTerms: ['city tours', 'sightseeing', 'landmarks', 'guided tours', 'highlights']
    }
  ];

  // Add destination-specific options
  const specificOptions = [];

  // Paris-specific options
  if (destLower.includes('paris')) {
    specificOptions.push({
      category: 'romance',
      label: 'Romantic Experiences',
      description: 'Seine river cruises, romantic dinners, and couples activities in the City of Love',
      tags: [12716, 21912], // General tours, Food & Drink
      searchTerms: ['romantic tours', 'seine cruise', 'couples activities', 'romantic dining']
    });
  }

  // Tokyo-specific options
  if (destLower.includes('tokyo')) {
    specificOptions.push({
      category: 'traditional',
      label: 'Traditional Japanese Culture',
      description: 'Tea ceremonies, temples, traditional crafts, and authentic Japanese experiences',
      tags: [11901, 21598], // Cultural Tours, Art & Culture
      searchTerms: ['tea ceremony', 'temples', 'traditional culture', 'japanese crafts']
    });
  }

  // London-specific options
  if (destLower.includes('london')) {
    specificOptions.push({
      category: 'royal',
      label: 'Royal & Historical',
      description: 'Royal palaces, historical tours, and British heritage experiences',
      tags: [12716, 11901], // Tours & Sightseeing, Cultural Tours
      searchTerms: ['royal palaces', 'british history', 'royal tours', 'historical sites']
    });
  }

  // Hawaii-specific options
  if (destLower.includes('hawaii') || destLower.includes('kona') || destLower.includes('honolulu')) {
    specificOptions.push({
      category: 'water',
      label: 'Water Activities',
      description: 'Snorkeling, diving, boat tours, and marine life experiences in tropical waters',
      tags: [12716], // General water activities
      searchTerms: ['snorkeling', 'diving', 'boat tours', 'marine life', 'water sports']
    });
  }

  // Barcelona-specific options
  if (destLower.includes('barcelona')) {
    specificOptions.push({
      category: 'architecture',
      label: 'Architecture & Gaudí',
      description: 'Explore Gaudí masterpieces, architectural tours, and unique Barcelona designs',
      tags: [12716, 11901], // Tours & Sightseeing, Cultural Tours
      searchTerms: ['gaudi tours', 'architecture', 'sagrada familia', 'barcelona architecture']
    });
  }

  // Combine base options with specific ones, prioritizing specific options
  return [...specificOptions, ...baseOptions].slice(0, 6); // Limit to 6 options max
}

/**
 * 🔧 Generic fallback clarification options
 */
function getGenericClarificationOptions() {
  return [
    {
      category: 'cultural',
      label: 'Cultural Experiences',
      description: 'Museums, art galleries, historical sites, and local traditions',
      tags: [12716, 11901, 21598],
      searchTerms: ['cultural tours', 'museums', 'art galleries', 'historical sites']
    },
    {
      category: 'food',
      label: 'Food & Culinary',
      description: 'Local cuisine, food tours, cooking classes, and dining experiences',
      tags: [21912, 21516, 20214],
      searchTerms: ['food tours', 'cooking classes', 'culinary experiences', 'local cuisine']
    },
    {
      category: 'adventure',
      label: 'Adventure & Outdoor',
      description: 'Outdoor activities, adventure sports, and nature experiences',
      tags: [12716],
      searchTerms: ['outdoor activities', 'adventure sports', 'nature tours', 'hiking']
    },
    {
      category: 'entertainment',
      label: 'Shows & Entertainment',
      description: 'Live shows, performances, nightlife, and entertainment',
      tags: [21516, 11908],
      searchTerms: ['shows', 'performances', 'theater', 'concerts', 'nightlife']
    }
  ];
}

export const anthropicService = new AnthropicService();