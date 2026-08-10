import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Calendar, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { initializeConversation, sendMessage, getConversation } from '../lib/api';
import { TypingIndicator } from './typing-indicator';
import { ActivityCard } from './activity-card';
import { OptimizedActivityCard } from './optimized-activity-card';
import { MultiDayTripComponent } from './multi-day-trip';
import { ActivityComparison } from './activity-comparison';
import { ChatHistory } from './chat-history';
import { ChatMessageSkeleton, ActivityCardSkeleton } from './loading-skeleton';
import { devLog } from './performance-monitor';
import { apiCache, cacheKeys, cachedFetch } from '../lib/api-cache';
import { memoryManager } from '../lib/memory-manager';
import { useDebouncedCallback } from '../hooks/use-debounced-callback';
import { useMobileDetection } from '../hooks/use-mobile-detection';
import { ResponsiveActivityGrid } from './responsive-activity-grid';
import LocationAutocomplete from './location-autocomplete';

// Export chat control functions for use in header
export interface ChatControlsProps {
  onNewChat: () => void;
  onLoadConversation: (conversationId: string) => void;
}
import type { Message, ActivityRecommendation, MultiDayTrip } from '../types/viator';

// Speech Recognition types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatInterfaceProps {
  onMessageReceived?: () => void;
}

interface ChatInterfaceRef {
  startNewChat: () => void;
  loadConversation: (conversationId: string) => void;
  openTemplateForm: (template: any) => void;
  sendMessage: (message: string, loadingMessage?: string, explicitDestination?: string) => void;
}

const ChatInterfaceComponent = (props: ChatInterfaceProps, ref: React.Ref<ChatInterfaceRef>) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);

  // Apply memory limits to messages
  const limitedMessages = useMemo(() => 
    memoryManager.limitMessages(messages, 50), [messages]);
  const [inputValue, setInputValue] = useState('');
  const [recommendations, setRecommendations] = useState<ActivityRecommendation[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [multiDayTrip, setMultiDayTrip] = useState<MultiDayTrip | null>(null);
  const [currentDayRecommendations, setCurrentDayRecommendations] = useState<ActivityRecommendation[]>([]);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [activitiesForComparison, setActivitiesForComparison] = useState<ActivityRecommendation[]>([]);
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [showingRecommendations, setShowingRecommendations] = useState<Set<string>>(new Set());
  const [aiSuggestedCategories, setAiSuggestedCategories] = useState<Array<{label: string, query: string}>>([]);
  const [extractedDates, setExtractedDates] = useState<{startDate?: string, endDate?: string, specificDates?: string[], duration?: number} | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<any>(null);
  const [templateFormData, setTemplateFormData] = useState<{[key: string]: string}>({});
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState<string | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<any>(undefined);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [lastUserMessageTime, setLastUserMessageTime] = useState<number>(0);
  const [selectedDestination, setSelectedDestination] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Mobile detection
  const { isMobile, isTablet, screenWidth, orientation } = useMobileDetection();

  // Simplified scroll detection for user activity
  useEffect(() => {
    const handleScroll = () => {
      const now = Date.now();
      // Only track scroll if it's after the last user message
      if (now - lastUserMessageTime > 1000) { // 1 second buffer
        setUserHasScrolled(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastUserMessageTime]);

  // Intelligent scrolling for AI messages
  const scrollToAIMessage = useCallback((messageId: string) => {
    // Don't scroll if user has scrolled since their last message
    if (userHasScrolled) {
      return;
    }

    setTimeout(() => {
      const messageElement = document.getElementById('message-' + messageId);

      if (messageElement) {
        messageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 100);
  }, [userHasScrolled]);

  // Initialize conversation
  const initMutation = useMutation({
    mutationFn: initializeConversation,
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      // Store session in localStorage for persistence
      localStorage.setItem('chatSessionId', data.sessionId);
    },
  });

  // Enhanced destination detection function
  const enhanceMessageWithDestinationMatching = async (message: string): Promise<string> => {
    try {
      // Only process explicit destination patterns to avoid false positives
      const destinationPatterns = [
        // "traveling to Tokyo", "going to Paris", etc.
        /(?:traveling|going|visiting|trip|vacation)\s+(?:to\s+)?([A-Z][a-zA-Z\s,]+?)(?=\s+(?:on|in|for|with|from)\s)/gi,
        // "Tokyo, Japan" format - strict city, country pairs
        /\b([A-Z][a-z]{3,}\s*,\s*[A-Z][a-z]{3,})\b/g,
        // Single major cities in travel context only
        /(?:to|visit|in|at|from)\s+(Tokyo|Paris|London|Rome|Barcelona|Madrid|Berlin|Amsterdam|Vienna|Prague|Sydney|Melbourne|New York|Los Angeles|San Francisco|Chicago|Miami|Las Vegas|Orlando|Boston|Seattle|Vancouver|Toronto|Montreal)\b/gi
      ];

      const potentialDestinations = [];

      // Extract only from explicit patterns, not word-by-word scanning
      for (const pattern of destinationPatterns) {
        let match;
        while ((match = pattern.exec(message)) !== null) {
          const destination = match[1].trim();

          // Strict validation - no dates, numbers, or common false positives
          if (destination.length >= 4 && 
              !destination.match(/\d/) && // No numbers
              !destination.match(/\b(sun|mon|tue|wed|thu|fri|sat|jul|jun|may|apr|mar|feb|jan|aug|sep|oct|nov|dec)\b/i) && // No date words
              !destination.match(/\bionian\s*islands?\b/i) && // Block specific false positive
              !destination.match(/\b(enjoy|museums|budget|things|please)\b/i)) { // No activity/preference words
            potentialDestinations.push(destination);
          }
        }
      }

      // Completely disable fuzzy matching to prevent false positives like "Ionian Islands"
      // Let server-side destination detection handle all extraction

      // Disable client-side fuzzy matching to prevent false positives
      return message;
    } catch (error) {
      return message;
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, sessionId, explicitDestination }: { message: string; sessionId: string; explicitDestination?: string }) => {
      // Skip destination enhancement if explicit destination provided
      if (explicitDestination) {
        return sendMessage(message, sessionId, explicitDestination);
      }
      // Otherwise enhance message with smart destination matching
      const enhancedMessage = await enhanceMessageWithDestinationMatching(message);
      return sendMessage(enhancedMessage, sessionId);
    },
    onSuccess: (data) => {
      // Add recommendations directly to the AI message
      const messageWithRecommendations = {
        ...data.message,
        recommendations: data.shouldShowRecommendations && data.recommendations.length > 0 
          ? data.recommendations 
          : undefined
      };

      // Replace loading message if it exists, otherwise just add the new message
      setMessages(prev => {
        const loadingMessageIndex = prev.findIndex(msg => msg.isLoading);
        if (loadingMessageIndex !== -1) {
          // Replace the loading message
          const newMessages = [...prev];
          newMessages[loadingMessageIndex] = messageWithRecommendations;
          return newMessages;
        } else {
          // Add normally if no loading message
          return [...prev, messageWithRecommendations];
        }
      });

      // Trigger intelligent scrolling for AI messages
      scrollToAIMessage(messageWithRecommendations.id);

      // Store AI-generated suggested categories
      if (data.suggestedCategories && data.suggestedCategories.length > 0) {
        setAiSuggestedCategories(data.suggestedCategories);
      } else {
        setAiSuggestedCategories([]);
      }

      // Store extracted dates for itinerary creation
      if (data.extractedDates) {
        setExtractedDates(data.extractedDates);
      }

      // Handle multi-day trip response
      if (data.isMultiDayTrip) {
        if (data.multiDayTrip) {
          setMultiDayTrip(data.multiDayTrip);
        }
        if (data.currentDayRecommendations) {
          setCurrentDayRecommendations(data.currentDayRecommendations.recommendations);
        }
      } else if (data.shouldShowRecommendations && data.recommendations.length > 0) {
        // Update global recommendations for comparison functionality (only latest)
        setRecommendations(data.recommendations);

        // Trigger card animation after a delay to show text first
        setTimeout(() => {
          setShowingRecommendations(prev => new Set(prev).add(data.message.id));
        }, 800);
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      setShowWelcome(false);

      // Callback to notify parent component that message was received
      if (props.onMessageReceived) {
        props.onMessageReceived();
      }
    },
    onError: (error: any) => {
      // Add user feedback for failed requests
      const errorMessage = {
        id: Date.now().toString(),
        text: 'I encountered an error processing your request. Please try again. ' + (error?.message ? '(' + error.message + ')' : ''),
        sender: 'ai' as const,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  // Always start with a fresh conversation
  useEffect(() => {
    initMutation.mutate();
  }, []);

  // Load a previous conversation
  const loadConversation = async (conversationId: string) => {
    try {
      const { messages: loadedMessages, preferences } = await getConversation(conversationId);
      setSessionId(conversationId);
      setMessages(loadedMessages);
      setShowWelcome(false);
      if (preferences) {
        // Apply loaded preferences if available
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Save conversation to history when it has meaningful content
  useEffect(() => {
    if (sessionId && messages.length > 2) { // Only save conversations with actual content
      const conversationSummary = {
        id: sessionId,
        title: messages[1]?.text.substring(0, 50) + '...' || 'Travel Planning',
        lastMessage: messages[messages.length - 1]?.text.substring(0, 100) + '...',
        timestamp: new Date().toISOString(),
        messageCount: messages.length
      };

      // Get existing conversation history
      const existingHistory = JSON.parse(localStorage.getItem('conversationHistory') || '[]');

      // Update or add this conversation
      const updatedHistory = existingHistory.filter((conv: any) => conv.id !== sessionId);
      updatedHistory.unshift(conversationSummary);

      // Keep only last 20 conversations
      const trimmedHistory = updatedHistory.slice(0, 20);

      localStorage.setItem('conversationHistory', JSON.stringify(trimmedHistory));
    }
  }, [messages, sessionId]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        setSpeechSupported(true);

        recognition.continuous = false; // Change back to false for better reliability
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1; // Reduce to 1 for better performance

        recognition.onstart = () => {
          setIsListening(true);
          setTranscript('');
        };

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];

            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              interimTranscript += result[0].transcript;
            }
          }

          const currentTranscript = finalTranscript || interimTranscript;
          setTranscript(currentTranscript);

          // Show interim results immediately in the input field
          if (currentTranscript.trim()) {
            setInputValue(currentTranscript.trim());
          }

          if (finalTranscript.trim()) {
            // Use the final transcript directly with basic location corrections
            const cleanedTranscript = finalTranscript
              .replace(/\bcona\b/gi, 'Kona')
              .replace(/\bhawaii\b/gi, 'Hawaii')
              .replace(/\bmaui\b/gi, 'Maui')
              .replace(/\boahu\b/gi, 'Oahu')
              .replace(/\bcolorado\b/gi, 'Colorado')
              .replace(/\bbolder\b/gi, 'Boulder')
              .replace(/\baspen\b/gi, 'Aspen')
              .replace(/\bsan francisco\b/gi, 'San Francisco')
              .replace(/\blos angeles\b/gi, 'Los Angeles')
              .replace(/\bnew york\b/gi, 'New York')
              .replace(/\blas vegas\b/gi, 'Las Vegas')
              .trim();


            setInputValue(cleanedTranscript);
            setIsListening(false);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);

          // Handle specific error types
          switch (event.error) {
            case 'not-allowed':
              setIsListening(false);
              setTranscript('');
              alert('Microphone access denied. Please enable microphone permissions in your browser settings and refresh the page.');
              break;
            case 'no-speech':
              // Don't stop listening for no speech - user might start speaking

              break;
            case 'network':
              // Don't stop listening for network errors - these are common in hosted environments

              break;
            case 'service-not-allowed':
              setIsListening(false);
              setTranscript('');
              alert('Speech recognition service is not available. Please check your internet connection.');
              break;
            case 'aborted':
              // User stopped recording - this is normal

              setIsListening(false);
              break;
            default:
              // For unknown errors, log but keep listening

          }
        };

        recognition.onend = () => {
          // Only stop if the user manually stopped or there's an error that requires stopping
          // For network errors and other temporary issues, restart recognition
          if (isListening) {
            setTimeout(() => {
              if (recognitionRef.current && isListening) {
                try {
                  recognitionRef.current.start();
                } catch (error) {

                  setIsListening(false);
                }
              }
            }, 100);
          }

          // If we have transcript but haven't sent it yet, keep it in the input
          if (transcript && !inputValue) {
            setInputValue(transcript);
          }
        };

        recognitionRef.current = recognition;
      } catch (error) {
        console.error('Speech recognition initialization failed:', error);
        setSpeechSupported(false);
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Template definitions (matching home page)
  const travelTemplates = [
    {
      id: 'romantic',
      title: 'Romantic Getaway',
      template: 'Going to [destination] on [dates] with my partner. We\'re looking for romantic activities like [sunset dinners, couples spa, scenic walks, wine tasting]. Budget: [activity budget].'
    },
    {
      id: 'family',
      title: 'Family Adventure',
      template: 'Planning a family trip to [destination] from [dates] with [number] adults and [number] kids (ages [ages]). Looking for family-friendly activities like [theme parks, museums, outdoor adventures, educational tours]. Budget: [budget per person/total].'
    },
    {
      id: 'solo',
      title: 'Solo Explorer',
      template: 'Solo traveling to [destination] on [dates]. I enjoy [adventure activities, cultural experiences, food tours, photography spots]. Budget: [activity budget].'
    },
    {
      id: 'friends',
      title: 'Friends Trip',
      template: 'Going to [destination] with [number] friends from [dates]. We love [nightlife, adventure sports, group activities, food experiences] and want unforgettable experiences. Budget: [budget per person].'
    }
  ];

  const extractTemplateFields = (template: string) => {
    const fieldMatches = template.match(/\[([^\]]+)\]/g);
    if (!fieldMatches) return [];

    return fieldMatches.map((match, index) => {
      const fieldName = match.slice(1, -1);
      let fieldType = 'text';
      let placeholder = fieldName;

      // Determine field type and placeholder based on content
      if (fieldName.toLowerCase().includes('date')) {
        fieldType = 'text';
        placeholder = 'e.g. March 15-20, next weekend, or 3/15/2024';
      } else if (fieldName.toLowerCase().includes('budget') || fieldName.toLowerCase().includes('cost')) {
        fieldType = 'text';
        placeholder = 'e.g. $1000-2000 or $100/day';
      } else if (fieldName.toLowerCase().includes('number') || fieldName.toLowerCase().includes('ages')) {
        fieldType = 'text';
        placeholder = fieldName.includes('ages') ? 'e.g. 8, 12' : 'e.g. 4';
      } else if (fieldName.toLowerCase().includes('destination')) {
        fieldType = 'text';
        // Set different destination examples based on current template
        if (currentTemplate?.id === 'romantic') {
          placeholder = 'e.g. Paris, France';
        } else if (currentTemplate?.id === 'family') {
          placeholder = 'e.g. Orlando, Florida';
        } else if (currentTemplate?.id === 'solo') {
          placeholder = 'e.g. Tokyo, Japan';
        } else if (currentTemplate?.id === 'friends') {
          placeholder = 'e.g. Las Vegas, Nevada';
        } else if (currentTemplate?.id === 'business') {
          placeholder = 'e.g. New York City, NY';
        } else if (currentTemplate?.id === 'adventure') {
          placeholder = 'e.g. Queenstown, New Zealand';
        } else {
          placeholder = 'e.g. Paris, France';
        }
      }

      return {
        id: 'field_' + index,
        name: fieldName,
        type: fieldType,
        placeholder,
        required: true
      };
    });
  };

  const openTemplateForm = (template: any) => {
    setCurrentTemplate(template);
    const fields = extractTemplateFields(template.template);
    const initialData: {[key: string]: string} = {};
    fields.forEach(field => {
      initialData[field.id] = '';
    });
    setTemplateFormData(initialData);
    setShowTemplateSelector(false);
    setShowTemplateForm(true);
  };

  const applyTemplate = (template: string) => {
    setInputValue(template);
    setShowTemplateSelector(false);
    setSelectedTemplate(template);
  };

  const generateMessageFromForm = () => {
    if (!currentTemplate) return '';

    let message = currentTemplate.template;
    const fields = extractTemplateFields(currentTemplate.template);

    fields.forEach(field => {
      const value = templateFormData[field.id] || '[' + field.name + ']';
      message = message.replace('[' + field.name + ']', value);
    });

    return message;
  };

  const submitTemplateForm = () => {
    const message = generateMessageFromForm();

    // Extract destination from form data for direct use
    const destinationField = Object.keys(templateFormData).find(key => 
      currentTemplate?.template.includes('[' + key + ']') && 
      key.toLowerCase().includes('destination')
    );
    const extractedDestination = destinationField ? templateFormData[destinationField] || undefined : undefined;

    // Create and send user message directly
    const userMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setShowWelcome(false);
    setShowTemplateForm(false);
    setCurrentTemplate(null);
    setTemplateFormData({});
    setShowTemplateSelector(false);

    // Reset comparison mode when starting a new search
    setIsComparisonMode(false);
    setSelectedForComparison(new Set());

    // Clear previous AI suggestions when starting a new search
    setAiSuggestedCategories([]);

    // Send to AI with explicit destination if captured
    sendMessageMutation.mutate({
      message: message,
      sessionId,
      explicitDestination: extractedDestination,
    });
  };

  // Massive comprehensive destination list (800+ destinations)
  const worldDestinations = [
    // Europe - Major Cities & Regions
    "London, United Kingdom", "Manchester, United Kingdom", "Liverpool, United Kingdom", "Birmingham, United Kingdom", "Edinburgh, Scotland", "Glasgow, Scotland", 
    "Cardiff, Wales", "Belfast, Northern Ireland", "Bath, United Kingdom", "Oxford, United Kingdom", "Cambridge, United Kingdom", "York, United Kingdom", 
    "Brighton, United Kingdom", "Bristol, United Kingdom", "Newcastle, United Kingdom", "Leeds, United Kingdom", "Sheffield, United Kingdom",
    "Paris, France", "Lyon, France", "Marseille, France", "Nice, France", "Cannes, France", "Monaco", "Toulouse, France", "Bordeaux, France", 
    "Strasbourg, France", "Lille, France", "Nantes, France", "Montpellier, France", "Rennes, France", "Reims, France", "Tours, France",
    "Rome, Italy", "Milan, Italy", "Florence, Italy", "Venice, Italy", "Naples, Italy", "Turin, Italy", "Bologna, Italy", "Palermo, Italy", 
    "Genoa, Italy", "Bari, Italy", "Catania, Italy", "Verona, Italy", "Pisa, Italy", "Siena, Italy", "Amalfi Coast, Italy", "Cinque Terre, Italy",
    "Barcelona, Spain", "Madrid, Spain", "Seville, Spain", "Valencia, Spain", "Bilbao, Spain", "Granada, Spain", "Toledo, Spain", "Salamanca, Spain", 
    "Santiago de Compostela, Spain", "San Sebastian, Spain", "Cordoba, Spain", "Malaga, Spain", "Ibiza, Spain", "Palma, Spain", 
    "Amsterdam, Netherlands", "Rotterdam, Netherlands", "The Hague, Netherlands", "Utrecht, Netherlands", "Eindhoven, Netherlands", "Groningen, Netherlands",
    "Berlin, Germany", "Munich, Germany", "Hamburg, Germany", "Cologne, Germany", "Frankfurt, Germany", "Stuttgart, Germany", "Düsseldorf, Germany", 
    "Dresden, Germany", "Leipzig, Germany", "Bremen, Germany", "Hanover, Germany", "Nuremberg, Germany",
    "Vienna, Austria", "Salzburg, Austria", "Innsbruck, Austria", "Graz, Austria", "Linz, Austria", "Hallstatt, Austria",
    "Prague, Czech Republic", "Brno, Czech Republic", "Ostrava, Czech Republic", "Pilsen, Czech Republic", "Karlovy Vary, Czech Republic",
    "Budapest, Hungary", "Debrecen, Hungary", "Szeged, Hungary", "Pecs, Hungary", "Lake Balaton, Hungary",
    "Stockholm, Sweden", "Gothenburg, Sweden", "Malmo, Sweden", "Uppsala, Sweden", "Linkoping, Sweden",
    "Copenhagen, Denmark", "Aarhus, Denmark", "Odense, Denmark", "Aalborg, Denmark", "Esbjerg, Denmark",
    "Oslo, Norway", "Bergen, Norway", "Trondheim, Norway", "Stavanger, Norway", "Tromso, Norway",
    "Helsinki, Finland", "Tampere, Finland", "Turku, Finland", "Oulu, Finland", "Lapland, Finland",
    "Dublin, Ireland", "Cork, Ireland", "Limerick, Ireland", "Galway, Ireland", "Waterford, Ireland",
    "Zurich, Switzerland", "Geneva, Switzerland", "Basel, Switzerland", "Bern, Switzerland", "Lausanne, Switzerland", "Lucerne, Switzerland",
    "Brussels, Belgium", "Antwerp, Belgium", "Ghent, Belgium", "Bruges, Belgium", "Liege, Belgium",
    "Lisbon, Portugal", "Porto, Portugal", "Braga, Portugal", "Coimbra, Portugal", "Faro, Portugal", "Funchal, Portugal",
    "Athens, Greece", "Thessaloniki, Greece", "Patras, Greece", "Santorini, Greece", "Mykonos, Greece", "Crete, Greece", "Rhodes, Greece",
    "Warsaw, Poland", "Krakow, Poland", "Gdansk, Poland", "Wroclaw, Poland", "Poznan, Poland", "Lodz, Poland",
    "Bratislava, Slovakia", "Kosice, Slovakia", "Zilina, Slovakia", "Ljubljana, Slovenia", "Maribor, Slovenia",
    "Zagreb, Croatia", "Split, Croatia", "Dubrovnik, Croatia", "Pula, Croatia", "Rijeka, Croatia",
    "Belgrade, Serbia", "Novi Sad, Serbia", "Nis, Serbia", "Sarajevo, Bosnia", "Mostar, Bosnia",
    "Sofia, Bulgaria", "Plovdiv, Bulgaria", "Varna, Bulgaria", "Bucharest, Romania", "Cluj-Napoca, Romania",
    "Tallinn, Estonia", "Tartu, Estonia", "Riga, Latvia", "Daugavpils, Latvia", "Vilnius, Lithuania", "Kaunas, Lithuania",
    "Reykjavik, Iceland", "Akureyri, Iceland", "Keflavik, Iceland",

    // Asia Pacific - Expanded
    "Tokyo, Japan", "Osaka, Japan", "Kyoto, Japan", "Yokohama, Japan", "Nagoya, Japan", "Sapporo, Japan", "Kobe, Japan", "Fukuoka, Japan", 
    "Hiroshima, Japan", "Sendai, Japan", "Nara, Japan", "Kanazawa, Japan", "Takayama, Japan", "Nikko, Japan", "Hakone, Japan",
    "Seoul, South Korea", "Busan, South Korea", "Incheon, South Korea", "Daegu, South Korea", "Daejeon, South Korea", "Gwangju, South Korea", "Jeju, South Korea",
    "Beijing, China", "Shanghai, China", "Guangzhou, China", "Shenzhen, China", "Chengdu, China", "Xi'an, China", "Hangzhou, China", "Nanjing, China", 
    "Wuhan, China", "Chongqing, China", "Tianjin, China", "Suzhou, China", "Harbin, China", "Dalian, China", "Qingdao, China",
    "Hong Kong", "Macau", "Taipei, Taiwan", "Kaohsiung, Taiwan", "Taichung, Taiwan", "Tainan, Taiwan",
    "Bangkok, Thailand", "Chiang Mai, Thailand", "Phuket, Thailand", "Pattaya, Thailand", "Krabi, Thailand", "Koh Samui, Thailand", "Ayutthaya, Thailand",
    "Singapore", "Kuala Lumpur, Malaysia", "George Town, Malaysia", "Ipoh, Malaysia", "Johor Bahru, Malaysia", "Kota Kinabalu, Malaysia", "Langkawi, Malaysia",
    "Jakarta, Indonesia", "Surabaya, Indonesia", "Bandung, Indonesia", "Medan, Indonesia", "Bali, Indonesia", "Yogyakarta, Indonesia", "Lombok, Indonesia", "Flores, Indonesia",
    "Manila, Philippines", "Quezon City, Philippines", "Cebu City, Philippines", "Davao, Philippines", "Boracay, Philippines", "Palawan, Philippines", "Bohol, Philippines",
    "Ho Chi Minh City, Vietnam", "Hanoi, Vietnam", "Da Nang, Vietnam", "Hoi An, Vietnam", "Hue, Vietnam", "Nha Trang, Vietnam", "Halong Bay, Vietnam", "Sapa, Vietnam",
    "Phnom Penh, Cambodia", "Siem Reap, Cambodia", "Battambang, Cambodia", "Sihanoukville, Cambodia",
    "Vientiane, Laos", "Luang Prabang, Laos", "Pakse, Laos", "Vang Vieng, Laos",
    "Yangon, Myanmar", "Mandalay, Myanmar", "Bagan, Myanmar", "Inle Lake, Myanmar",
    "Colombo, Sri Lanka", "Kandy, Sri Lanka", "Galle, Sri Lanka", "Anuradhapura, Sri Lanka", "Sigiriya, Sri Lanka",
    "Male, Maldives", "Addu City, Maldives", "Dhaka, Bangladesh", "Chittagong, Bangladesh", "Sylhet, Bangladesh",
    "Kathmandu, Nepal", "Pokhara, Nepal", "Chitwan, Nepal", "Lumbini, Nepal", "Thimphu, Bhutan", "Paro, Bhutan", "Punakha, Bhutan",
    "New Delhi, India", "Mumbai, India", "Bangalore, India", "Hyderabad, India", "Chennai, India", "Kolkata, India", "Pune, India", "Ahmedabad, India", 
    "Jaipur, India", "Lucknow, India", "Kanpur, India", "Nagpur, India", "Goa, India", "Agra, India", "Varanasi, India", "Kerala, India", 
    "Udaipur, India", "Jodhpur, India", "Rishikesh, India", "Dharamshala, India", "Amritsar, India", "Kochi, India", "Mysore, India",
    "Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia", "Perth, Australia", "Adelaide, Australia", "Gold Coast, Australia", "Newcastle, Australia", "Canberra, Australia",
    "Cairns, Australia", "Darwin, Australia", "Hobart, Australia", "Alice Springs, Australia", "Uluru, Australia",
    "Auckland, New Zealand", "Wellington, New Zealand", "Christchurch, New Zealand", "Hamilton, New Zealand", "Tauranga, New Zealand", "Dunedin, New Zealand", 
    "Queenstown, New Zealand", "Rotorua, New Zealand", "Nelson, New Zealand", "Napier, New Zealand",
    "Suva, Fiji", "Nadi, Fiji", "Lautoka, Fiji", "Port Vila, Vanuatu", "Noumea, New Caledonia", "Apia, Samoa", "Nuku'alofa, Tonga",

    // North America - Massively Expanded
    "New York City, USA", "Los Angeles, USA", "Chicago, USA", "Houston, USA", "Phoenix, USA", "Philadelphia, USA", "San Antonio, USA", "San Diego, USA", 
    "Dallas, USA", "San Jose, USA", "Austin, USA", "Jacksonville, USA", "Fort Worth, USA", "Columbus, USA", "Charlotte, USA", "San Francisco, USA",
    "Indianapolis, USA", "Seattle, USA", "Denver, USA", "Washington DC, USA", "Boston, USA", "El Paso, USA", "Nashville, USA", "Detroit,USA",
    "Oklahoma City, USA", "Portland, USA", "Las Vegas, USA", "Memphis, USA", "Louisville, USA", "Baltimore, USA", "Milwaukee, USA", "Albuquerque, USA",
    "Tucson, USA", "Fresno, USA", "Sacramento, USA", "Sacramento, USA", "Mesa, USA", "Kansas City, USA", "Atlanta, USA", "Long Beach, USA", "Colorado Springs, USA",
    "Raleigh, USA", "Miami, USA", "Virginia Beach, USA", "Omaha, USA", "Oakland, USA", "Minneapolis, USA", "Tulsa, USA", "Arlington, USA",
    "Tampa, USA", "New Orleans, USA", "Wichita, USA", "Cleveland, USA", "Bakersfield, USA", "Aurora, USA", "Anaheim, USA", "Honolulu, USA",
    "Santa Ana, USA", "Corpus Christi, USA", "Riverside, USA", "Lexington, USA", "Stockton, USA", "Henderson, USA", "Saint Paul, USA", "St. Louis, USA",
    "Cincinnati, USA", "Pittsburgh, USA", "Greensboro, USA", "Anchorage, USA", "Plano, USA", "Lincoln, USA", "Orlando, USA", "Irvine, USA",
    "Newark, USA", "Durham, USA", "Chula Vista, USA", "Toledo, USA", "Fort Wayne, USA", "St. Petersburg, USA", "Laredo, USA", "Jersey City, USA",
    "Chandler, USA", "Madison, USA", "Lubbock, USA", "Scottsdale, USA", "Reno, USA", "Buffalo, USA", "Gilbert, USA", "Glendale, USA",
    "Savannah, USA", "Charleston, USA", "Key West, USA", "Napa Valley, USA", "Yellowstone, USA", "Grand Canyon, USA", "Yosemite, USA", "Zion, USA",
    "Toronto, Canada", "Montreal, Canada", "Calgary, Canada", "Ottawa, Canada", "Edmonton, Canada", "Mississauga, Canada", "Winnipeg, Canada", "Vancouver, Canada",
    "Brampton, Canada", "Hamilton, Canada", "Quebec City, Canada", "Surrey, Canada", "Laval, Canada", "Halifax, Canada", "London, Canada", "Markham, Canada",
    "Vaughan, Canada", "Gatineau, Canada", "Saskatoon, Canada", "Longueuil, Canada", "Burnaby, Canada", "Regina, Canada", "Richmond, Canada",
    "Oakville, Canada", "Burlington, Canada", "Sherbrooke, Canada", "Oshawa, Canada", "Kelowna, Canada", "Barrie, Canada", "Whistler, Canada", "Banff, Canada",
    "Mexico City, Mexico", "Guadalajara, Mexico", "Monterrey, Mexico", "Puebla, Mexico", "Tijuana, Mexico", "Ciudad Juarez, Mexico", "Leon, Mexico", "Zapopan, Mexico",
    "Nezahualcoyotl, Mexico", "Chihuahua, Mexico", "Merida, Mexico", "San Luis Potosi, Mexico", "Aguascalientes, Mexico", "Morelia, Mexico", "Saltillo, Mexico",
    "Cancun, Mexico", "Puerto Vallarta, Mexico", "Playa del Carmen, Mexico", "Tulum, Mexico", "Oaxaca, Mexico", "San Miguel de Allende, Mexico", "Guanajuato, Mexico",
    "Mazatlan, Mexico", "Acapulco, Mexico", "Cozumel, Mexico", "Isla Mujeres, Mexico", "Chichen Itza, Mexico", "Palenque, Mexico", "Zihuatanejo, Mexico",

    // Latin America & Caribbean
    "São Paulo, Brazil", "Rio de Janeiro, Brazil", "Salvador, Brazil", "Brasília, Brazil", "Fortaleza, Brazil", "Belo Horizonte, Brazil", "Manaus, Brazil", "Curitiba, Brazil",
    "Recife, Brazil", "Porto Alegre, Brazil", "Belém, Brazil", "Goiânia, Brazil", "Guarulhos, Brazil", "Campinas, Brazil", "São Luís, Brazil", "Maceió, Brazil",
    "Florianopolis, Brazil", "Natal, Brazil", "João Pessoa, Brazil", "Teresina, Brazil", "Campo Grande, Brazil", "Cuiabá, Brazil", "Aracaju, Brazil",
    "Buenos Aires, Argentina", "Córdoba, Argentina", "Rosario, Argentina", "Mendoza, Argentina", "Tucumán, Argentina", "La Plata, Argentina", "Mar del Plata, Argentina", "Salta, Argentina",
    "Santa Fe, Argentina", "San Juan, Argentina", "Resistencia, Argentina", "Santiago del Estero, Argentina", "Corrientes, Argentina", "Posadas, Argentina", "Neuquen, Argentina",
    "Santiago, Chile", "Valparaíso, Chile", "Concepción, Chile", "La Serena, Chile", "Antofagasta, Chile", "Temuco, Chile", "Rancagua, Chile", "Talca, Chile",
    "Arica, Chile", "Iquique, Chile", "Puerto Montt, Chile", "Valdivia, Chile", "Osorno, Chile", "Punta Arenas, Chile", "Atacama Desert, Chile", "Easter Island, Chile",
    "Lima, Peru", "Arequipa, Peru", "Trujillo, Peru", "Chiclayo, Peru", "Piura, Peru", "Iquitos, Peru", "Cusco, Peru", "Huancayo, Peru", "Chimbote, Peru", "Machu Picchu, Peru",
    "Bogotá, Colombia", "Medellín, Colombia", "Cali, Colombia", "Barranquilla, Colombia", "Cartagena, Colombia", "Cúcuta, Colombia", "Soledad, Colombia", "Ibagué, Colombia",
    "Bucaramanga, Colombia", "Soacha, Colombia", "Pereira, Colombia", "Santa Marta, Colombia", "Villavicencio, Colombia", "Pasto, Colombia", "Manizales, Colombia",
    "Caracas, Venezuela", "Maracaibo, Venezuela", "Valencia, Venezuela", "Barquisimeto, Venezuela", "Maracay, Venezuela", "Ciudad Guayana, Venezuela", "San Cristóbal, Venezuela",
    "Quito, Ecuador", "Guayaquil, Ecuador", "Cuenca, Ecuador", "Santo Domingo, Ecuador", "Machala, Ecuador", "Manta, Ecuador", "Galápagos Islands, Ecuador",
    "La Paz, Bolivia", "Santa Cruz, Bolivia", "Cochabamba, Bolivia", "Oruro, Bolivia", "Sucre, Bolivia", "Tarija, Bolivia", "Potosí, Bolivia",
    "Asunción, Paraguay", "Ciudad del Este, Paraguay", "San Lorenzo, Paraguay", "Luque, Paraguay", "Capiatá, Paraguay", "Lambaré, Paraguay",
    "Montevideo, Uruguay", "Salto, Uruguay", "Paysandú, Uruguay", "Las Piedras, Uruguay", "Rivera, Uruguay", "Maldonado, Uruguay", "Punta del Este, Uruguay",
    "Havana, Cuba", "Santiago de Cuba, Cuba", "Camagüey, Cuba", "Holguín, Cuba", "Guantánamo, Cuba", "Santa Clara, Cuba", "Bayamo, Cuba", "Trinidad, Cuba",
    "Kingston, Jamaica", "Spanish Town, Jamaica", "Portmore, Jamaica", "Montego Bay, Jamaica", "May Pen, Jamaica", "Negril, Jamaica", "Ocho Rios, Jamaica",
    "Santo Domingo, Dominican Republic", "Santiago, Dominican Republic", "Santo Domingo Oeste, Dominican Republic", "Santo Domingo Este, Dominican Republic", "San Pedro de Macorís, Dominican Republic",
    "La Romana, Dominican Republic", "San Cristóbal, Dominican Republic", "Puerto Plata, Dominican Republic", "San Francisco de Macorís, Dominican Republic", "Punta Cana, Dominican Republic",
    "San Juan, Puerto Rico", "Bayamón, Puerto Rico", "Carolina, Puerto Rico", "Ponce, Puerto Rico", "Caguas, Puerto Rico", "Guaynabo, Puerto Rico", "Arecibo, Puerto Rico",
    "Nassau, Bahamas", "Lucaya, Bahamas", "Freeport, Bahamas", "West End, Bahamas", "Cooper's Town, Bahamas", "Marsh Harbour, Bahamas", "High Rock, Bahamas",
    "Bridgetown, Barbados", "Speightstown, Barbados", "Oistins, Barbados", "Bathsheba, Barbados", "Holetown, Barbados", "Crane, Barbados",
    "Port of Spain, Trinidad", "San Fernando, Trinidad", "Chaguanas, Trinidad", "Arima, Trinidad", "Point Fortin, Trinidad", "Scarborough, Tobago",
    "St. George's, Grenada", "Gouyave, Grenada", "Grenville, Grenada", "Victoria, Grenada", "Sauteurs, Grenada",
    "Castries, St. Lucia", "Gros Islet, St. Lucia", "Soufrière, St. Lucia", "Vieux Fort, St. Lucia", "Micoud, St. Lucia",
    "Roseau, Dominica", "Portsmouth, Dominica", "Marigot, Dominica", "Berekua, Dominica", "Mahaut, Dominica",
    "St. John's, Antigua", "All Saints, Antigua", "Liberta, Antigua", "Potter's Village, Antigua", "Bolans, Antigua",
    "Basseterre, St. Kitts", "Charlestown, Nevis", "Cayon, St. Kitts", "Old Road Town, St. Kitts", "Sandy Point Town, St. Kitts",
    "Oranjestad, Aruba", "Sint Nicolaas, Aruba", "Savaneta, Aruba", "Paradera, Aruba", "Tanki Leendert, Aruba",
    "Willemstad, Curaçao", "Barber, Curaçao", "Santa Catharina, Curaçao", "Westpunt, Curaçao", "Sint Michiel, Curaçao",
    "Philipsburg, St. Maarten", "Simpson Bay, St. Maarten", "Cole Bay, St. Maarten", "Cul de Sac, St. Maarten", "Lower Prince's Quarter, St. Maarten",

    // Middle East & Central Asia
    "Dubai, UAE", "Abu Dhabi, UAE", "Sharjah, UAE", "Al Ain, UAE", "Ajman, UAE", "Ras Al Khaimah, UAE", "Fujairah, UAE", "Umm Al Quwain, UAE",
    "Doha, Qatar", "Al Rayyan, Qatar", "Umm Salal, Qatar", "Al Wakrah, Qatar", "Al Khor, Qatar", "Dukhan, Qatar", "Lusail, Qatar",
    "Kuwait City, Kuwait", "Al Ahmadi, Kuwait", "Hawalli, Kuwait", "As Salimiyah, Kuwait", "Sabah as Salem, Kuwait", "Al Farwaniyah, Kuwait",
    "Manama, Bahrain", "Riffa, Bahrain", "Muharraq, Bahrain", "Hamad Town, Bahrain", "A'ali, Bahrain", "Isa Town, Bahrain", "Sitra, Bahrain",
    "Riyadh, Saudi Arabia", "Jeddah, Saudi Arabia", "Mecca, Saudi Arabia", "Medina, Saudi Arabia", "Dammam, Saudi Arabia", "Khobar, Saudi Arabia", "Tabuk, Saudi Arabia", "Buraidah, Saudi Arabia",
    "Khamis Mushait, Saudi Arabia", "Hofuf, Saudi Arabia", "Taif, Saudi Arabia", "Jubail, Saudi Arabia", "Najran, Saudi Arabia", "Abha, Saudi Arabia",
    "Muscat, Oman", "Seeb, Oman", "Salalah, Oman", "Bawshar, Oman", "Sohar, Oman", "As Suwayq, Oman", "Ibri, Oman", "Saham, Oman",
    "Tehran, Iran", "Mashhad, Iran", "Isfahan, Iran", "Karaj, Iran", "Shiraz, Iran", "Tabriz, Iran", "Qom, Iran", "Ahvaz, Iran", "Kermanshah, Iran", "Urmia, Iran",
    "Istanbul, Turkey", "Ankara, Turkey", "Izmir, Turkey", "Bursa, Turkey", "Adana, Turkey", "Gaziantep, Turkey", "Konya, Turkey", "Antalya, Turkey", "Kayseri, Turkey", "Mersin, Turkey",
    "Cappadocia, Turkey", "Pamukkale, Turkey", "Bodrum, Turkey", "Marmaris, Turkey", "Fethiye, Turkey", "Kas, Turkey", "Alanya, Turkey", "Side, Turkey",
    "Beirut, Lebanon", "Tripoli, Lebanon", "Sidon, Lebanon", "Tyre, Lebanon", "Nabatieh, Lebanon", "Zahle, Lebanon", "Baalbek, Lebanon", "Jounieh, Lebanon",
    "Damascus, Syria", "Aleppo, Syria", "Homs, Syria", "Latakia, Syria", "Hama, Syria", "Deir ez-Zor, Syria", "Raqqa, Syria", "Daraa, Syria",
    "Amman, Jordan", "Zarqa, Jordan", "Irbid, Jordan", "Russeifa, Jordan", "Wadi as-Sir, Jordan", "Aqaba, Jordan", "Sahab, Jordan", "Ramtha, Jordan", "Petra, Jordan", "Wadi Rum, Jordan",
    "Jerusalem, Israel", "Tel Aviv, Israel", "Haifa, Israel", "Rishon LeZion, Israel", "Petah Tikva, Israel", "Ashdod, Israel", "Netanya, Israel", "Beer Sheva, Israel", "Eilat, Israel", "Nazareth, Israel",
    "Cairo, Egypt", "Alexandria, Egypt", "Giza, Egypt", "Shubra El Kheima, Egypt", "Port Said, Egypt", "Suez, Egypt", "Luxor, Egypt", "Mansoura, Egypt", "Aswan, Egypt", "Hurghada, Egypt", "Sharm El Sheikh, Egypt",
    "Almaty, Kazakhstan", "Nur-Sultan, Kazakhstan", "Shymkent, Kazakhstan", "Aktobe, Kazakhstan", "Taraz, Kazakhstan", "Pavlodar, Kazakhstan", "Ust-Kamenogorsk, Kazakhstan", "Semey, Kazakhstan",
    "Tashkent, Uzbekistan", "Samarkand, Uzbekistan", "Namangan, Uzbekistan", "Andijan, Uzbekistan", "Nukus, Uzbekistan", "Fergana, Uzbekistan", "Bukhara, Uzbekistan", "Karshi, Uzbekistan",
    "Bishkek, Kyrgyzstan", "Osh, Kyrgyzstan", "Jalal-Abad, Kyrgyzstan", "Karakol, Kyrgyzstan", "Tokmok, Kyrgyzstan", "Uzgen, Kyrgyzstan", "Naryn, Kyrgyzstan",
    "Dushanbe, Tajikistan", "Khujand, Tajikistan", "Kulob, Tajikistan", "Qurghonteppa, Tajikistan", "Istaravshan, Tajikistan", "Vahdat, Tajikistan", "Konibodom, Tajikistan",
    "Ashgabat, Turkmenistan", "Turkmenbashi, Turkmenistan", "Dashoguz, Turkmenistan", "Mary, Turkmenistan", "Turkmenbashi, Turkmenistan", "Balkanabat, Turkmenistan",

    // Africa - Massively Expanded
    "Lagos, Nigeria", "Kano, Nigeria", "Ibadan, Nigeria", "Abuja, Nigeria", "Kaduna, Nigeria", "Port Harcourt, Nigeria", "Benin City, Nigeria", "Maiduguri, Nigeria",
    "Zaria, Nigeria", "Aba, Nigeria", "Jos, Nigeria", "Ilorin, Nigeria", "Oyo, Nigeria", "Enugu, Nigeria", "Abeokuta, Nigeria", "Ogbomoso, Nigeria",
    "Accra, Ghana", "Kumasi, Ghana", "Tamale, Ghana", "Takoradi, Ghana", "Cape Coast, Ghana", "Tema, Ghana", "Sunyani, Ghana", "Koforidua, Ghana",
    "Abidjan, Côte d'Ivoire", "Bouaké, Côte d'Ivoire", "Daloa, Côte d'Ivoire", "Yamoussoukro, Côte d'Ivoire", "San-Pédro, Côte d'Ivoire", "Korhogo, Côte d'Ivoire", "Man, Côte d'Ivoire", "Divo, Côte d'Ivoire",
    "Ouagadougou, Burkina Faso", "Bobo-Dioulasso, Burkina Faso", "Koudougou, Burkina Faso", "Ouahigouya, Burkina Faso", "Banfora, Burkina Faso", "Tenkodogo, Burkina Faso", "Kaya, Burkina Faso",
    "Bamako, Mali", "Sikasso, Mali", "Mopti, Mali", "Koutiala, Mali", "Kayes, Mali", "Ségou, Mali", "Gao, Mali", "Timbuktu, Mali",
    "Dakar, Senegal", "Thiès, Senegal", "Kaolack, Senegal", "Saint-Louis, Senegal", "Ziguinchor, Senegal", "Diourbel, Senegal", "Tambacounda, Senegal", "Mbour, Senegal",
    "Conakry, Guinea", "Nzérékoré, Guinea", "Kankan, Guinea", "Kindia, Guinea", "Labe, Guinea", "Mamou, Guinea", "Boke, Guinea", "Faranah, Guinea",
    "Freetown, Sierra Leone", "Bo, Sierra Leone", "Kenema, Sierra Leone", "Koidu, Sierra Leone", "Makeni, Sierra Leone", "Waterloo, Sierra Leone",
    "Monrovia, Liberia", "Gbarnga, Liberia", "Kakata, Liberia", "Bensonville, Liberia", "Harper, Liberia", "Voinjama, Liberia", "Zwedru, Liberia",
    "Marrakech, Morocco", "Casablanca, Morocco", "Fez, Morocco", "Tangier, Morocco", "Agadir, Morocco", "Meknes, Morocco", "Oujda, Morocco", "Kenitra, Morocco",
    "Rabat, Morocco", "Tetouan, Morocco", "Safi, Morocco", "Khouribga, Morocco", "Beni Mellal, Morocco", "El Jadida, Morocco", "Nador, Morocco", "Taza, Morocco",
    "Tunis, Tunisia", "Sfax, Tunisia", "Sousse, Tunisia", "Kairouan, Tunisia", "Bizerte, Tunisia", "Gabès, Tunisia", "Ariana, Tunisia", "Gafsa, Tunisia",
    "Algiers, Algeria", "Oran, Algeria", "Constantine, Algeria", "Annaba, Algeria", "Blida, Algeria", "Batna, Algeria", "Djelfa, Algeria", "Sétif, Algeria",
    "Tripoli, Libya", "Benghazi, Libya", "Misrata, Libya", "Tarhuna, Libya", "Al Khums, Libya", "Az Zawiyah, Libya", "Ajdabiya, Libya", "Tobruk, Libya",
    "Khartoum, Sudan", "Omdurman, Sudan", "Port Sudan, Sudan", "Kassala, Sudan", "Obeid, Sudan", "Nyala, Sudan", "Gedaref, Sudan", "Wad Medani, Sudan",
    "Addis Ababa, Ethiopia", "Dire Dawa, Ethiopia", "Mek'ele, Ethiopia", "Gondar, Ethiopia", "Awasa, Ethiopia", "Bahir Dar, Ethiopia", "Dessie, Ethiopia", "Jimma, Ethiopia",
    "Asmara, Eritrea", "Keren, Eritrea", "Massawa, Eritrea", "Assab, Eritrea", "Mendefera, Eritrea", "Barentu, Eritrea", "Adi Keih, Eritrea",
    "Djibouti City, Djibouti", "Ali Sabieh, Djibouti", "Dikhil, Djibouti", "Tadjourah, Djibouti", "Obock, Djibouti", "Arta, Djibouti",
    "Nairobi, Kenya", "Mombasa, Kenya", "Kisumu, Kenya", "Nakuru, Kenya", "Eldoret, Kenya", "Malindi, Kenya", "Kitale, Kenya", "Garissa, Kenya",
    "Kampala, Uganda", "Gulu, Uganda", "Lira, Uganda", "Mbarara, Uganda", "Jinja, Uganda", "Mbale, Uganda", "Mukono, Uganda", "Kasese, Uganda",
    "Kigali, Rwanda", "Butare, Rwanda", "Gitarama, Rwanda", "Musanze, Rwanda", "Gisenyi, Rwanda", "Cyangugu, Rwanda", "Kibungo, Rwanda",
    "Bujumbura, Burundi", "Muyinga, Burundi", "Gitega, Burundi", "Ruyigi, Burundi", "Ngozi, Burundi", "Rutana, Burundi", "Makamba, Burundi",
    "Dar es Salaam, Tanzania", "Mwanza, Tanzania", "Arusha, Tanzania", "Dodoma, Tanzania", "Mbeya, Tanzania", "Morogoro, Tanzania", "Tanga, Tanzania", "Kahama, Tanzania",
    "Stone Town, Zanzibar", "Pemba, Tanzania", "Moshi, Tanzania", "Tabora, Tanzania", "Kigoma, Tanzania", "Sumbawanga, Tanzania", "Kasulu, Tanzania",
    "Lusaka, Zambia", "Kitwe, Zambia", "Ndola, Zambia", "Kabwe, Zambia", "Chingola, Zambia", "Mufulira, Zambia", "Luanshya, Zambia", "Livingstone, Zambia",
    "Harare, Zimbabwe", "Bulawayo, Zimbabwe", "Chitungwiza, Zimbabwe", "Mutare, Zimbabwe", "Epworth, Zimbabwe", "Gweru, Zimbabwe", "Kwekwe, Zimbabwe", "Kadoma, Zimbabwe",
    "Maputo, Mozambique", "Matola, Mozambique", "Beira, Mozambique", "Nampula, Mozambique", "Chimoio, Mozambique", "Nacala, Mozambique", "Quelimane, Mozambique", "Tete, Mozambique",
    "Lilongwe, Malawi", "Blantyre, Malawi", "Mzuzu, Malawi", "Zomba, Malawi", "Kasungu, Malawi", "Mangochi, Malawi", "Karonga, Malawi", "Salima, Malawi",
    "Gaborone, Botswana", "Francistown, Botswana", "Molepolole, Botswana", "Maun, Botswana", "Mogoditshane, Botswana", "Serowe, Botswana", "Selibe Phikwe, Botswana", "Kanye, Botswana",
    "Windhoek, Namibia", "Rundu, Namibia", "Walvis Bay, Namibia", "Swakopmund, Namibia", "Oshakati, Namibia", "Rehoboth, Namibia", "Katima Mulilo, Namibia", "Otjiwarongo, Namibia",
    "Cape Town, South Africa", "Durban, South Africa", "Johannesburg, South Africa", "Soweto, South Africa", "Pretoria, South Africa", "Port Elizabeth, South Africa", "Pietermaritzburg, South Africa", "Benoni, South Africa",
    "Tembisa, South Africa", "East London, South Africa", "Vereeniging, South Africa", "Bloemfontein, South Africa", "Boksburg, South Africa", "Welkom, South Africa", "Newcastle, South Africa", "Krugersdorp, South Africa",
    "Maseru, Lesotho", "Teyateyaneng, Lesotho", "Mafeteng, Lesotho", "Hlotse, Lesotho", "Mohale's Hoek, Lesotho", "Maputsoe, Lesotho", "Qacha's Nek, Lesotho", "Quthing, Lesotho",
    "Mbabane, Eswatini", "Manzini, Eswatini", "Big Bend, Eswatini", "Malkerns, Eswatini", "Nhlangano, Eswatini", "Lobamba, Eswatini", "Siteki, Eswatini", "Piggs Peak, Eswatini"
  ];

  const getLocationSuggestions = async (input: string) => {
    if (input.length < 2) return [];

    try {
      const response = await fetch('/api/destinations/search?query=' + encodeURIComponent(input) + '&limit=8');
      if (response.ok) {
        const data = await response.json();
        return data.matches?.map((match: any) => match.name) || [];
      }
    } catch (error) {

    }

    return [];
  };

  const handleLocationInput = (fieldId: string, value: string) => {
    setTemplateFormData(prev => ({ ...prev, [fieldId]: value }));

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (value.length >= 2) {
      // Debounce API calls to avoid excessive requests
      const timeout = setTimeout(async () => {
        try {
          const suggestions = await getLocationSuggestions(value);
          setLocationSuggestions(suggestions);
          setShowLocationDropdown(fieldId);
        } catch (error) {

          setShowLocationDropdown(null);
        }
      }, 300);
      setSearchTimeout(timeout);
    } else {
      setShowLocationDropdown(null);
    }
  };

  const selectLocation = (fieldId: string, location: string) => {
    setTemplateFormData(prev => ({ ...prev, [fieldId]: location }));
    setShowLocationDropdown(null);
  };

  const handleDateSelect = (fieldId: string, range: any) => {
    if (range?.from && range?.to) {
      const fromDate = range.from.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const toDate = range.to.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      setTemplateFormData(prev => ({ ...prev, [fieldId]: fromDate + ' → ' + toDate }));
    } else if (range?.from) {
      const fromDate = range.from.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      setTemplateFormData(prev => ({ ...prev, [fieldId]: fromDate }));
    }
    setSelectedDateRange(range);
  };

  const getQuickDateOptions = () => {
    return [
      "± 1 day",
      "± 2 days", 
      "± 3 days",
      "± 7 days"
    ];
  };

  // Scroll to show latest messages - smart scrolling that doesn't interrupt card animations
  // Close dropdowns when clicking outside and track user scroll activity
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowLocationDropdown(null);
        setShowCalendar(null);
      }
    };

    const handleScroll = () => {
      // Only track scroll if user sent a message recently (within 10 seconds)
      if (lastUserMessageTime && Date.now() - lastUserMessageTime < 10000) {
        setUserHasScrolled(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastUserMessageTime]);

  // Auto-scrolling disabled for typing indicator to prevent page jumps
  useEffect(() => {
    // Typing indicator scrolling disabled to maintain user's scroll position
  }, [sendMessageMutation.isPending]);

  // Handle intelligent scrolling for AI messages when they're received - disabled for chat page
  useEffect(() => {
    // Auto-scrolling disabled to prevent unwanted page jumps when entering chat
    // Users can manually scroll to see content as needed
  }, [messages]);

  const handleSendMessage = async (content: string, messageType: 'text' | 'audio' = 'text') => {
    if (!content.trim() || sendMessageMutation.isPending) return;

    const now = Date.now();
    const userMessage: Message = {
      id: now.toString(),
      text: content.trim(),
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setShowWelcome(false);
    setInputValue('');
    setShowTemplateSelector(false);

    // Track user message timing and reset scroll state for new conversation
    setLastUserMessageTime(now);
    setUserHasScrolled(false);

    // Reset scroll position to bottom for new user messages
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);

    // Reset comparison mode when starting a new search
    setIsComparisonMode(false);
    setSelectedForComparison(new Set());

    // Clear previous AI suggestions when starting a new search
    setAiSuggestedCategories([]);

    sendMessageMutation.mutate({
      message: userMessage.text,
      sessionId,
    });
  };

  const handleLocationSelect = (destinationId: number, destinationName: string) => {
    setSelectedDestination({
      id: destinationId,
      name: destinationName
    });

    // Auto-send message with selected destination
    handleSendMessage("I'd like to explore " + destinationName);
  };

  const handleExampleClick = (prompt: string) => {
    // Direct search without populating chat input
    sendMessageMutation.mutate({
      message: prompt,
      sessionId,
    });

    // Auto-scroll to show typing indicator
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const startVoiceRecording = async () => {
    if (!isListening) {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Create MediaRecorder instance
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          // Create audio blob
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });

          // Send to AssemblyAI for transcription
          await transcribeWithAssemblyAI(audioBlob);

          // Clean up
          stream.getTracks().forEach(track => track.stop());
          setIsListening(false);
          setMediaRecorder(null);
        };

        setMediaRecorder(recorder);
        setAudioChunks(chunks);
        recorder.start();
        setIsListening(true);
        setTranscript('🎤 Recording... Click to stop');

      } catch (error) {
        console.error('Microphone access error:', error);
        alert('Please allow microphone access to use voice input.');
      }
    }
  };

  const stopVoiceRecording = () => {
    if (isListening && mediaRecorder) {
      mediaRecorder.stop();
      setTranscript('Processing audio...');
    }
  };

  const transcribeWithAssemblyAI = async (audioBlob: Blob) => {
    try {
      setTranscript('Transcribing audio...');

      // Create FormData for audio upload
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Send to our API endpoint
      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const result = await response.json();

      if (result.text && result.text.trim()) {
        setInputValue(result.text.trim());
        setTranscript('');
      } else {
        setTranscript('No speech detected. Please try again.');
        setTimeout(() => setTranscript(''), 2000);
      }

    } catch (error) {
      console.error('Transcription error:', error);
      setTranscript('Transcription failed. Please try again.');
      setTimeout(() => setTranscript(''), 2000);
    }
  };

  // Enhanced speech processing with HuggingFace AI
  const enhanceSpeechWithAI = async (text: string): Promise<string> => {
    try {
      const response = await fetch('/api/speech/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browserText: text }),
      });

      if (!response.ok) {
        throw new Error('Speech enhancement failed');
      }

      const { text: enhancedText } = await response.json();
      return enhancedText;
    } catch (error) {
      console.error('AI speech enhancement error:', error);
      throw error;
    }
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  // Comparison selection handlers
  const toggleComparisonSelection = (activityCode: string) => {
    const newSelected = new Set(selectedForComparison);
    if (newSelected.has(activityCode)) {
      newSelected.delete(activityCode);
    } else if (newSelected.size < 3) {
      newSelected.add(activityCode);
    }
    setSelectedForComparison(newSelected);
  };

  const startComparison = () => {
    if (selectedForComparison.size >= 2) {
      const selectedActivities = recommendations.filter(activity => 
        selectedForComparison.has(activity.productCode)
      );
      setActivitiesForComparison(selectedActivities);
      setIsComparisonOpen(true);
      setIsComparisonMode(false);
      setSelectedForComparison(new Set());
    }
  };

  const cancelComparison = () => {
    setIsComparisonMode(false);
    setSelectedForComparison(new Set());
  };

  // Multi-day trip handlers
  const handleActivitySelect = (activity: ActivityRecommendation) => {
    if (!multiDayTrip) return;

    const updatedTrip = {
      ...multiDayTrip,
      days: multiDayTrip.days.map(day => 
        day.day === multiDayTrip.currentDay
          ? { ...day, selectedActivities: [...day.selectedActivities, activity] }
          : day
      )
    };
    setMultiDayTrip(updatedTrip);
  };

  const handleNextDay = () => {
    if (!multiDayTrip) return;

    sendMessageMutation.mutate({
      message: 'Continue to day ' + (multiDayTrip.currentDay + 1),
      sessionId
    });
  };

  const handleSkipDay = () => {
    if (!multiDayTrip) return;

    sendMessageMutation.mutate({
      message: 'Skip day ' + multiDayTrip.currentDay + ', no activities planned',
      sessionId
    });
  };

  const handleFinishTrip = () => {
    if (!multiDayTrip) return;

    // Calculate total cost
    const totalCost = multiDayTrip.days.reduce((total, day) => {
      const dayTotal = day.selectedActivities.reduce((daySum, activity) => 
        daySum + (activity.price?.amount || 0), 0);
      return total + dayTotal;
    }, 0);

    const finalMessage = 'Trip planning complete! You\'ve selected ' + (
      multiDayTrip.days.reduce((count, day) => count + day.selectedActivities.length, 0)
    ) + ' activities with an estimated total cost of $' + totalCost.toFixed(2) + '.';

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: finalMessage,
      sender: 'ai',
      timestamp: new Date().toISOString()
    }]);

    // Reset trip state
    setMultiDayTrip(null);
    setCurrentDayRecommendations([]);
  };

  // Start a new conversation
  const startNewChat = () => {
    initMutation.mutate();
    setMessages([]);
    setShowWelcome(true);
    setMultiDayTrip(null);
    setCurrentDayRecommendations([]);
  };

  // Send message from external trigger
  const sendMessageFromRef = (message: string, loadingMessage?: string, explicitDestination?: string) => {
    const now = Date.now();

    // Add user message immediately
    const userMessage = {
      id: now.toString(),
      text: message,
      sender: 'user' as const,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Track user message timing and reset scroll state
    setLastUserMessageTime(now);
    setUserHasScrolled(false);

    // Add loading message if provided
    if (loadingMessage) {
      const loadingMsg = {
        id: (now + 1).toString(),
        text: loadingMessage,
        sender: 'ai' as const,
        timestamp: new Date().toISOString(),
        isLoading: true
      };
      setMessages(prev => [...prev, loadingMsg]);

      // Trigger intelligent scrolling for loading message
      scrollToAIMessage(loadingMsg.id);
    }

    if (!sessionId) {
      // Initialize conversation first if not already done
      initMutation.mutate();
      // Wait for initialization then send message
      setTimeout(() => {
        sendMessageMutation.mutate({ message, sessionId, explicitDestination });
      }, 100);
    } else {
      sendMessageMutation.mutate({ message, sessionId, explicitDestination });
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    startNewChat,
    loadConversation,
    openTemplateForm,
    sendMessage: sendMessageFromRef
  }));

  return (
    <div className="relative">

      <div 
        className="fixed left-0 right-0 flex flex-col chat-container"
        style={{ 
          top: '5rem',  // Align with Activities header
          bottom: '0',
          height: 'calc(100vh - 5rem)',
          maxWidth: 'calc(100vw - 30vw)', // Leave space for activity panel (reduced from 35vw to 30vw)
          paddingLeft: '1.5rem',
          paddingRight: '1.5rem'
        }}
      >
      {/* Adventure Welcome Section */}
      {showWelcome && (
        <div className="text-center mb-8 animate-fade-in">
          <div className="mb-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl border-4 transform -rotate-3 tilt-hover" style={{backgroundColor: '#722F37', borderColor: '#C9A876'}}>
              <div className="relative">
                <i className="fas fa-compass text-white text-4xl compass-spin"></i>
                <i className="fas fa-mountain absolute -top-3 -right-3 text-xl opacity-90 bounce-hover" style={{color: '#C9A876'}}></i>
              </div>
            </div>
            <h1 className="handwritten text-5xl sm:text-6xl font-bold mb-4 transform -rotate-1" style={{color: '#722F37'}}>
              WonderVoya
            </h1>
            <div className="handwritten text-sm mb-2 transform rotate-1" style={{color: '#C9A876'}}>~ Your Adventure Companion ~</div>
            <p className="text-gray-700 text-xl max-w-2xl mx-auto leading-relaxed">
              Ready to discover epic adventures? Tell me where you want to explore, when you're traveling, who's joining the quest, and what kind of thrills you're seeking!
            </p>
          </div>

          {/* Adventure Quest Templates */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <p className="handwritten text-lg mb-3" style={{color: '#C9A876'}}>Pick a quest template or craft your own adventure!</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {travelTemplates.map((template, index) => (
                  <button
                    key={template.id}
                    onClick={() => openTemplateForm(template)}
                    className="adventure-card border-4 py-4 px-4 text-center transition-all duration-300 hover:shadow-xl hover:-translate-y-2 hover:rotate-1 group flex items-center justify-center relative animate-fade-in-up transform-gpu tilt-hover interactive-card"
                    style={{
                      backgroundColor: 'rgba(247, 243, 232, 0.8)',
                      borderColor: '#9B8B7A',
                      animationDelay: (index * 150) + 'ms',
                      animationFillMode: 'both'
                    } as React.CSSProperties}
                  >
                    <div className="handwritten font-bold transition-colors text-lg" style={{color: '#722F37'}}>
                      {template.title}
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="fas fa-map-marker-alt text-xs bounce-hover" style={{color: '#C9A876'}}></i>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center space-x-2 text-sm text-gray-500 mb-4">
                <div className="h-px flex-1" style={{backgroundColor: '#9B8B7A'}}></div>
                <span className="handwritten" style={{color: '#722F37'}}>or write your own tale</span>
                <div className="h-px flex-1" style={{backgroundColor: '#9B8B7A'}}></div>
              </div>
            </div>


          </div>
        </div>
      )}

      {/* Scrollable Messages Area */}
      <div 
        ref={chatContainerRef} 
        className="flex-1 overflow-y-auto space-y-4 pb-4"
        style={{
          height: 'calc(100vh - 5rem - 120px)', // Fixed height minus header and input area
          paddingTop: '1rem'
        }}
      >

        {/* Messages and Recommendations in chronological order */}
        {limitedMessages.map((message, index) => {
          const isFirstMessage = index === 0;
          const shouldShowRecommendations = message.recommendations && message.recommendations.length > 0 && message.sender === 'ai';
          const isLastMessage = index === limitedMessages.length - 1;
          const isLastAIMessageWithRecommendations = isLastMessage && shouldShowRecommendations;

          return (
            <div key={message.id} id={'message-' + message.id}>
              {/* Message */}
              <div className={'flex items-start space-x-3 ' + (
                message.sender === 'user' ? 'justify-end' : ''
              )}>
                {message.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{background: 'linear-gradient(135deg, #C9A876 0%, #B8965F 100%)'}}>
                    <i className="fas fa-compass text-white text-sm"></i>
                  </div>
                )}
                <div className={'rounded-2xl px-4 py-3 max-w-md ' + (
                  message.sender === 'user'
                    ? 'text-white rounded-tr-md'
                    : 'bg-white/90 rounded-tl-md shadow-sm'
                )} style={{
                  backgroundColor: message.sender === 'user' ? '#722F37' : undefined,
                  border: message.sender === 'ai' ? '1px solid #9B8B7A30' : undefined,
                  color: message.sender === 'ai' ? '#3A3A3A' : undefined
                }}>
                  <div className="whitespace-pre-line leading-relaxed">
                    {message.text}
                    {message.isLoading && (
                      <div className="flex items-center space-x-1 mt-2">
                        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    )}
                  </div>
                </div>
                {message.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{backgroundColor: '#9B8B7A'}}>
                    <i className="fas fa-user text-white text-sm"></i>
                  </div>
                )}
              </div>

              {/* Show recommendations right after the AI message that triggered them */}
              {shouldShowRecommendations && (
                <div className={'mt-6 ' + (
                  showingRecommendations.has(message.id) 
                    ? 'opacity-0 animate-fadeIn' 
                    : 'opacity-100'
                )} style={{ 
                  animationDelay: showingRecommendations.has(message.id) ? '0.1s' : '0s', 
                  animationFillMode: 'forwards' 
                }}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-900">Perfect Activities for You</h3>
                    <div className="flex items-center space-x-3">
                      {recommendations.length >= 2 && !isComparisonMode && (
                        <button
                          onClick={() => setIsComparisonMode(true)}
                          className="text-sm px-3 py-1 rounded-full transition-colors flex items-center space-x-1 button-lift"
                          style={{
                            color: '#722F37',
                            backgroundColor: 'rgba(201, 168, 118, 0.2)'
                          }}
                        >
                          <i className="fas fa-balance-scale text-xs"></i>
                          <span>Compare Activities</span>
                        </button>
                      )}
                      {isComparisonMode && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={startComparison}
                            disabled={selectedForComparison.size < 2}
                            className="text-sm text-white px-3 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 button-lift"
                            style={{ backgroundColor: '#722F37' }}
                          >
                            <i className="fas fa-balance-scale text-xs"></i>
                            <span>Compare ({selectedForComparison.size})</span>
                          </button>
                          <button
                            onClick={cancelComparison}
                            className="text-sm px-3 py-1 rounded-full transition-colors flex items-center space-x-1 button-lift"
                            style={{
                              color: '#9B8B7A',
                              backgroundColor: 'rgba(155, 139, 122, 0.2)'
                            }}
                          >
                            <i className="fas fa-times text-xs"></i>
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}
                      <span className="text-sm px-3 py-1 rounded-full" style={{
                        color: '#9B8B7A',
                        backgroundColor: 'rgba(247, 243, 232, 0.8)'
                      }}>
                        {recommendations.length} results
                      </span>
                    </div>
                  </div>

                  <ResponsiveActivityGrid
                    activities={message.recommendations || []}
                    extractedDates={extractedDates}
                    conversationMessages={limitedMessages.map(msg => ({ 
                      role: msg.sender === 'user' ? 'user' : 'assistant', 
                      content: msg.text 
                    }))}
                    sessionId={sessionId}
                    isComparisonMode={isComparisonMode}
                    selectedForComparison={selectedForComparison}
                    onToggleComparison={toggleComparisonSelection}
                  />

                  {/* Search Again Button at bottom of cards */}
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => {
                        // Add randomization to get different results
                        const searchVariations = [
                          "Show me different options for the same search",
                          "Find alternative activities in this area",
                          "What other similar activities are available?",
                          "Show me more variety for this destination"
                        ];
                        const randomVariation = searchVariations[Math.floor(Math.random() * searchVariations.length)];

                        sendMessageMutation.mutate({
                          message: randomVariation,
                          sessionId,
                        });
                      }}
                      disabled={sendMessageMutation.isPending}
                      className="text-sm px-4 py-2 rounded-full transition-colors disabled:opacity-50 flex items-center space-x-2 mx-auto button-lift"
                      style={{
                        color: '#722F37',
                        backgroundColor: 'rgba(201, 168, 118, 0.2)'
                      }}
                    >
                      <i className="fas fa-refresh text-xs"></i>
                      <span>Search Again</span>
                    </button>
                  </div>

                  {/* AI-Generated Next Activity Suggestions */}
                  {aiSuggestedCategories.length > 0 && (
                    <div className="rounded-xl p-6 mt-6" style={{
                      background: 'linear-gradient(135deg, rgba(247, 243, 232, 0.8) 0%, rgba(201, 168, 118, 0.1) 100%)'
                    }}>
                      <h4 className="font-semibold mb-3" style={{color: '#722F37'}}>Continue exploring</h4>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestedCategories.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleExampleClick(suggestion.query)}
                            disabled={sendMessageMutation.isPending}
                            className="px-3 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 button-lift"
                            style={{
                              backgroundColor: 'white',
                              color: '#722F37',
                              borderColor: '#9B8B7A'
                            }}
                          >
                            {sendMessageMutation.isPending && (
                              <i className="fas fa-spinner fa-spin text-xs"></i>
                            )}
                            <span>{suggestion.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing Indicator */}
        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3 typing-indicator-container">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{background: 'linear-gradient(135deg, #C9A876 0%, #B8965F 100%)'}}>
              <i className="fas fa-compass text-white text-sm"></i>
            </div>
            <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border max-w-md" style={{borderColor: '#9B8B7A30'}}>
              <div className="flex items-center space-x-3">
                <TypingIndicator />
                <span className="text-sm text-slate-600">Searching for activities and planning your trip...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Template Form */}
      {showTemplateForm && currentTemplate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="premium-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 relative" style={{backgroundColor: '#F7F3E8'}}>
            <button
              onClick={() => {
                setShowTemplateForm(false);
                setCurrentTemplate(null);
                setTemplateFormData({});
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 flex items-center justify-center transition-all duration-200 hover:scale-105 z-10 shadow-sm"
            >
              <X className="h-4 w-4" style={{color: '#722F37'}} />
            </button>
            <div className="p-8">
              <div className="mb-6">
                <div>
                  <h3 className="text-2xl font-bold mb-2" style={{color: '#722F37', fontFamily: 'Playfair Display, serif'}}>{currentTemplate.title}</h3>
                  <p style={{color: '#9B8B7A', fontFamily: 'Inter'}}>Fill in your trip details</p>
                </div>
              </div>

              <div className="space-y-6">
                {extractTemplateFields(currentTemplate.template).map((field, index) => (
                  <div key={field.id} className="space-y-2 relative">
                    <label className="block text-sm font-semibold capitalize" style={{color: '#1C2A35', fontFamily: 'Inter'}}>
                      {field.name.toLowerCase().includes('budget') || field.name.toLowerCase().includes('expense') || field.name.toLowerCase().includes('cost')
                        ? 'Budget'
                        : field.name.toLowerCase().includes('activity') || field.name.toLowerCase().includes('adventure') || field.name.toLowerCase().includes('cultural') || field.name.toLowerCase().includes('food') || field.name.toLowerCase().includes('photography') || field.name.toLowerCase().includes('experience') || field.name.toLowerCase().includes('interests')
                        ? field.name.toLowerCase().includes('sunset') && field.name.toLowerCase().includes('dinner') && field.name.toLowerCase().includes('spa') && field.name.toLowerCase().includes('walk') && field.name.toLowerCase().includes('wine')
                          ? 'Sunset Dinners, Couples Spa, Scenic Walks, Wine Tasting'
                          : 'Activities'
                        : field.name.replace(/([a-z])([A-Z])/g, '$1 $2')
                      }
                      {field.required && <span style={{color: '#722F37'}} className="ml-1">*</span>}
                    </label>

                    {/* Activities field with examples in placeholder */}
                    {(field.name.toLowerCase().includes('activity') || field.name.toLowerCase().includes('interests') || field.name.toLowerCase().includes('experience')) && !(field.name.toLowerCase().includes('budget') || field.name.toLowerCase().includes('expense') || field.name.toLowerCase().includes('cost')) ? (
                      <textarea
                        value={templateFormData[field.id] || ''}
                        onChange={(e) => setTemplateFormData(prev => ({
                          ...prev,
                          [field.id]: e.target.value
                        }))}
                        placeholder="e.g. museums, local food tours, hiking, shopping, nightlife, historical sites"
                        className="w-full px-4 py-3 border-2 rounded-lg transition-all resize-none" 
                        style={{
                          borderColor: '#9B8B7A', 
                          backgroundColor: 'white',
                          fontFamily: 'Inter'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#722F37'}
                        onBlur={(e) => e.target.style.borderColor = '#9B8B7A'}
                        rows={3}
                      />
                    ) : field.name.toLowerCase().includes('destination') ? (
                      /* Location field with autocomplete */
                      <div className="relative dropdown-container">
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4" style={{color: '#9B8B7A'}} />
                          <input
                            type="text"
                            value={templateFormData[field.id] || ''}
                            onChange={(e) => handleLocationInput(field.id, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full pl-10 pr-4 py-3 border-2 rounded-lg transition-all"
                            style={{
                              borderColor: '#9B8B7A', 
                              backgroundColor: 'white',
                              fontFamily: 'Inter'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#722F37'}
                            onBlur={(e) => e.target.style.borderColor = '#9B8B7A'}
                          />
                        </div>
                        {showLocationDropdown === field.id && locationSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                            {locationSuggestions.map((location, idx) => (
                              <button
                                key={idx}
                                onClick={() => selectLocation(field.id, location)}
                                className="w-full text-left px-4 py-2 hover:bg-blue-50 first:roundedt-xl last:rounded-b-xl"
                              >
                                {location}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : field.name.toLowerCase().includes('date') ? (
                      /* Date field with calendar picker */
                      <div className="relative dropdown-container">
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            value={templateFormData[field.id] || ''}
                            onChange={(e) => setTemplateFormData(prev => ({
                              ...prev,
                              [field.id]: e.target.value
                            }))}
                            onFocus={() => setShowCalendar(field.id)}
                            placeholder={field.placeholder}
                            className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-400 focus:ring-0 transition-all"
                            readOnly
                          />
                        </div>
                        {showCalendar === field.id && (
                          <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4" style={{ width: '340px', left: '50%', transform: 'translateX(-50%)' }}>
                            <DayPicker
                              mode="range"
                              selected={selectedDateRange}
                              onSelect={(range) => handleDateSelect(field.id, range as any)}
                              showOutsideDays={true}
                              className="rdp w-full"
                              classNames={{
                                months: "flex flex-col sm:flex-row justify-center",
                                month: "space-y-4",
                                caption: "flex justify-center pt-1 relative items-center",
                                caption_label: "text-sm font-medium",
                                nav: "space-x-1 flex items-center",
                                nav_button: "h-7 w-7 bg-transparent p-0 text-slate-500 hover:text-slate-900",
                                nav_button_previous: "absolute left-1",
                                nav_button_next: "absolute right-1",
                                table: "w-full border-collapse space-y-1",
                                head_row: "flex",
                                head_cell: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
                                row: "flex w-full mt-2",
                                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                                day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100 rounded-md",
                                day_range_start: "day-range-start bg-blue-600 text-white hover:bg-blue-600",
                                day_range_end: "day-range-end bg-blue-600 text-white hover:bg-blue-600",
                                day_selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
                                day_today: "bg-slate-100 text-slate-900",
                                day_outside: "text-slate-400 opacity-50",
                                day_disabled: "text-slate-400 opacity-50",
                                day_range_middle: "aria-selected:bg-slate-100 aria-selected:text-slate-900",
                                day_hidden: "invisible"
                              }}
                              components={{
                                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                                IconRight: () => <ChevronRight className="h-4 w-4" />
                              }}
                            />
                            <div className="flex justify-center mt-4 pt-4 border-t">
                              <button
                                onClick={() => setShowCalendar(null)}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Regular input field */
                      <input
                        type={field.type}
                        value={templateFormData[field.id] || ''}
                        onChange={(e) => setTemplateFormData(prev => ({
                          ...prev,
                          [field.id]: e.target.value
                        }))}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-400 focus:ring-0 transition-all"
                      />
                    )}

                    {(field.name.toLowerCase().includes('budget') || field.name.toLowerCase().includes('expense') || field.name.toLowerCase().includes('cost')) && (
                      <p className="text-xs text-slate-500">
                        Enter total budget or per day budget (e.g. "$500 total" or "$100/day")
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6" style={{borderTop: '1px solid #9B8B7A'}}>
                <div className="rounded-lg p-4 mb-6" style={{backgroundColor: '#F7F3E8', border: '1px solid #9B8B7A'}}>
                  <h4 className="font-semibold mb-2" style={{color: '#722F37', fontFamily: 'Inter'}}>Preview:</h4>
                  <p className="text-sm leading-relaxed" style={{color: '#1C2A35', fontFamily: 'Inter'}}>
                    {generateMessageFromForm()}
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowTemplateForm(false);
                      setCurrentTemplate(null);
                      setTemplateFormData({});
                    }}
                    className="flex-1 py-3 rounded-lg transition-colors font-medium"
                    style={{
                      backgroundColor: '#9B8B7A',
                      color: 'white',
                      fontFamily: 'Inter'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#8A7B6A';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#9B8B7A';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitTemplateForm}
                    disabled={!Object.values(templateFormData).some(value => value.trim())}
                    className="flex-1 py-3 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    style={{
                      backgroundColor: '#722F37',
                      color: 'white',
                      fontFamily: 'Inter'
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#5D252A';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#722F37';
                    }}
                  >
                    <i className="fas fa-paper-plane text-base"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-day Trip Planning */}
      {multiDayTrip && (
        <MultiDayTripComponent
          trip={multiDayTrip}
          currentDayRecommendations={currentDayRecommendations}
          onActivitySelect={handleActivitySelect}
          onNextDay={handleNextDay}
          onSkipDay={handleSkipDay}
          onFinishTrip={handleFinishTrip}
        />
      )}

      {/* Template Selector Popup */}
      {showTemplateSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white/95 backdrop-blur-lg rounded-3xl max-w-5xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-white/20 relative">
            <button
              onClick={() => setShowTemplateSelector(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/90 hover:bg-white border border-slate-200 hover:border-slate-300 flex items-center justify-center transition-all duration-200 hover:scale-105 z-10 shadow-md backdrop-blur-sm"
            >
              <X className="h-4 w-4 text-slate-600" />
            </button>
            <div className="p-8">
              <div className="mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Choose Your Travel Style</h3>
                  <p className="text-slate-600">Select a template that matches your trip type</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {travelTemplates.map((template, index) => (
                  <button
                    key={template.id}
                    onClick={() => openTemplateForm(template)}
                    className="bg-gradient-to-br from-white to-slate-50 hover:from-blue-50 hover:to-indigo-50 border-2 border-slate-200/50 hover:border-blue-300 rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:shadow-blue-100/30 hover:-translate-y-1 group"
                    style={{
                      animationDelay: (index * 100) + 'ms'
                    }}
                  >
                    <div className="font-bold text-slate-800 mb-3 group-hover:text-blue-600 transition-colors text-lg">
                      {template.title}
                    </div>
                    <div className="text-sm text-slate-600 leading-relaxed mb-4">
                      {template.template.split(/(\[[^\]]+\])/).map((part, partIndex) => 
                        part.startsWith('[') && part.endsWith(']') ? (
                          <span key={partIndex} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium mx-0.5">
                            {part.slice(1, -1)}
                          </span>
                        ) : (
                          <span key={partIndex}>{part}</span>
                        )
                      )}                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-blue-600 opacity-0 group-hover:opacity-100 transition-all duration-300 text-sm font-medium">
                        <span>Fill out form</span>
                        <i className="fas fa-edit ml-2 text-xs group-hover:translate-x-1 transition-transform"></i>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-100 group-hover:bg-blue-600 flex items-center justify-center transition-all duration-300">
                        <i className="fas fa-edit text-xs text-blue-600 group-hover:text-white transition-colors"></i>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="text-center">
                  <p className="text-slate-500 text-sm mb-4">Prefer to write your own? That works too!</p>
                  <button
                    onClick={() => setShowTemplateSelector(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2 rounded-full transition-colors text-sm font-medium"
                  >
                    Start from scratch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Input Area at Container Bottom */}
      <div className="flex-shrink-0 backdrop-blur-lg shadow-2xl p-4 sm:p-6" style={{backgroundColor: '#F7F3E8E6', borderTop: '2px solid #9B8B7A'}}>
          <div className="flex space-x-3 sm:space-x-4">
            <div className="flex-1 relative">
              <div className="relative bg-white/90 rounded-2xl border-2 transition-all duration-200 shadow-lg" style={{borderColor: '#9B8B7A', backgroundColor: '#F7F3E8F0'}} onFocus={(e) => e.currentTarget.style.borderColor = '#C9A876'} onBlur={(e) => e.currentTarget.style.borderColor = '#9B8B7A'}>
                <textarea
                  value={isListening ? transcript : inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={isListening ? "🎤 Listening..." : "Share your travel dreams..."}
                  className="w-full px-4 sm:px-5 py-4 pr-20 sm:pr-24 bg-transparent border-0 rounded-2xl focus:ring-0 focus:outline-none resize-none transition-all min-h-[56px] max-h-32 overflow-y-auto text-sm sm:text-base"
                  style={{
                    color: '#3A3A3A',
                    height: 'auto',
                    minHeight: '56px'
                  }}
                  onFocus={(e) => e.target.style.color = '#722F37'}
                  onBlur={(e) => e.target.style.color = '#3A3A3A'}
                  disabled={sendMessageMutation.isPending || isListening}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                  }}
                />
                <div className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                  {speechSupported && (
                    <button
                      onClick={toggleVoiceRecognition}
                      disabled={sendMessageMutation.isPending}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all duration-200 text-white"
                      style={{
                        backgroundColor: isListening ? '#dc2626' : '#C9A876',
                        boxShadow: isListening ? '0 4px 12px rgba(220, 38, 38, 0.3)' : '0 2px 8px rgba(201, 168, 118, 0.3)'
                      }}
                      onMouseEnter={(e) => !isListening && (e.currentTarget.style.backgroundColor = '#B8965F')}
                      onMouseLeave={(e) => !isListening && (e.currentTarget.style.backgroundColor = '#C9A876')}
                      title={isListening ? "Stop recording" : "Voice storytelling"}
                    >
                      <i className={'fas ' + (isListening ? 'fa-stop' : 'fa-microphone') + ' text-xs'}></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || sendMessageMutation.isPending}
              className="text-white px-5 sm:px-7 py-4 rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[56px] shadow-lg font-medium"
              style={{
                backgroundColor: '#722F37',
                boxShadow: '0 4px 16px rgba(114, 47, 55, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#5A252B';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(114, 47, 55, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#722F37';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(114, 47, 55, 0.3)';
                }
              }}
            >
              {sendMessageMutation.isPending ? (
                <i className="fas fa-compass fa-spin text-base"></i>
              ) : (
                <span className="font-medium">Send</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Activity Comparison Modal */}
      <ActivityComparison
        activities={activitiesForComparison}
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        onSelect={(activity) => {
          // This will trigger the itinerary manager for the selected activity
          handleActivitySelect(activity);
        }}
      />
    </div>
  );
};

export const ChatInterface = forwardRef(ChatInterfaceComponent);