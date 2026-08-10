import { useChat } from '@ai-sdk/react';
import { useState, useCallback, useEffect } from 'react';
import type { Message } from '../types/viator';

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

// Convert WonderVoya message format to AI SDK format
export function convertToAIMessage(message: Message): AIChatMessage {
  return {
    id: message.id,
    role: message.sender === 'user' ? 'user' : 'assistant',
    content: message.text,
    createdAt: new Date(message.timestamp),
  };
}

// Convert AI SDK message format to WonderVoya format
export function convertFromAIMessage(message: AIChatMessage): Message {
  return {
    id: message.id,
    text: message.content,
    sender: message.role === 'user' ? 'user' : 'ai',
    timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
  };
}

export function useWonderVoyaChat(sessionId: string, initialMessages: Message[] = []) {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [shouldShowRecommendations, setShouldShowRecommendations] = useState(false);
  const [prevLoadingState, setPrevLoadingState] = useState(false);

  // Convert initial messages to AI SDK format
  const aiMessages = initialMessages.map(convertToAIMessage);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
    reload,
    stop,
  } = useChat({
    api: '/api/chat',
    initialMessages: aiMessages,
    body: {
      sessionId,
    },
    onFinish: async (message) => {
      console.log('🎯 AI response finished:', message);
      console.log('📊 Message content length:', message.content?.length || 0);
      console.log('📊 Message content preview:', message.content?.substring(0, 100) + '...');
      console.log('📋 Full message object (first 500 chars):', JSON.stringify(message, null, 2).substring(0, 500) + '...');

      // After AI response is complete, check for travel recommendations
      try {
        console.log('🔍 Fetching travel recommendations...');
        const response = await fetch('/api/conversation/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: message.content,
          }),
        });

        console.log('🌐 Recommendations response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Recommendations data:', data);
          console.log('🔍 Number of recommendations:', data.recommendations?.length || 0);
          console.log('🔍 Should show recommendations:', data.shouldShowRecommendations);
          setRecommendations(data.recommendations || []);
          setShouldShowRecommendations(data.shouldShowRecommendations || false);
        } else {
          console.error('❌ Recommendations request failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('💥 Error fetching recommendations:', error);
      }
    },
    onError: (error) => {
      console.error('🚨 AI Chat Error:', error);
      console.log('🔍 Error details:', error);
      // Force show recommendations panel when AI fails
      console.log('🔄 AI Error fallback: Forcing activity panel to show');
      setRecommendations([]);
      setShouldShowRecommendations(true);

      // Provide fallback response for common errors
      if (error.message?.includes('JSON') || error.message?.includes('stream')) {
        console.log('🔄 JSON streaming error detected, attempting fallback...');
        // The streaming will continue with partial content
      }
    },
    onResponse: (response) => {
      console.log('📡 Raw API response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });
    },
  });

  // Convert AI SDK messages back to WonderVoya format
  const wonderVoyaMessages = messages.map((m) => convertFromAIMessage(m as unknown as AIChatMessage));

  // Debug message conversion
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    console.log('📨 Current AI SDK messages:', messages.length, messages);
    console.log('🔄 Converted WonderVoya messages:', wonderVoyaMessages.length, wonderVoyaMessages);
    console.log('⏳ Is loading:', isLoading);
    console.log('🚨 Current error:', error || {});
  }

  // Fallback mechanism - check for recommendations when loading finishes
  useEffect(() => {
    const handleFallbackRecommendations = async () => {
      if (prevLoadingState && !isLoading && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.content) {
          console.log('🔄 Fallback: AI response finished via loading state change');
          console.log('🔄 Fallback: Checking for recommendations...');

          // Trigger recommendations check
          try {
            const response = await fetch('/api/conversation/recommendations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                message: lastMessage.content,
              }),
            });

            if (!response.ok) {
              console.warn('Failed to fetch recommendations:', response.status);
              return;
            }

            const data = await response.json();
            if (data.recommendations && data.recommendations.length > 0) {
              console.log('✅ Recommendations loaded:', data.recommendations.length);
            }
            console.log('✅ Fallback: Recommendations data:', data);
            console.log('🔍 Fallback: Number of recommendations:', data.recommendations?.length || 0);
            setRecommendations(data.recommendations || []);
            setShouldShowRecommendations(data.shouldShowRecommendations || false);
          } catch (error) {
            console.error('💥 Fallback: Error fetching recommendations:', error);
            // Force show recommendations panel even if fetch fails
            console.log('🔄 Final fallback: Forcing activity panel to show');
            setRecommendations([]);
            setShouldShowRecommendations(true);
          }
        }
      }
      setPrevLoadingState(isLoading);
    };

    handleFallbackRecommendations();
  }, [isLoading, messages, sessionId, prevLoadingState]);

  console.log('📨 Current AI SDK messages:', messages.length, messages);
  console.log('🔄 Converted WonderVoya messages:', wonderVoyaMessages.length, wonderVoyaMessages);
  console.log('⏳ Is loading:', isLoading);
  console.log('🚨 Current error:', error);

  const sendMessage = useCallback(async (content: string, options?: { extractedDates?: any }) => {
    if (!content.trim()) return;

    console.log('📧 Sending message via sendMessage:', content);

    // Add user message immediately
    const userMessage: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    // Use append to add user message and get AI response
    append(userMessage);

    // Reset recommendations state
    setShouldShowRecommendations(false);
    setRecommendations([]);

    try {
      // SINGLE recommendation request with original user message
      console.log('🔍 Fetching recommendations for user message:', content);

      // Add small delay to prevent duplicate requests
      await new Promise(resolve => setTimeout(resolve, 100));

      const recommendationResponse = await fetch('/api/conversation/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: content, // Use original user message
          requestId: `${sessionId}-${Date.now()}` // Add unique request ID
        }),
      });

      if (recommendationResponse.ok) {
        const recommendationData = await recommendationResponse.json();
        console.log('✅ Recommendations received:', recommendationData.recommendations?.length || 0);

        // Only update if we got actual recommendations
        if (recommendationData.recommendations && recommendationData.recommendations.length > 0) {
          setRecommendations(recommendationData.recommendations);
          setShouldShowRecommendations(recommendationData.shouldShowRecommendations || false);
        }
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    }
  }, [append, sessionId]);

  return {
    messages: wonderVoyaMessages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    sendMessage,
    recommendations,
    shouldShowRecommendations,
    reload,
    stop,
  };
}