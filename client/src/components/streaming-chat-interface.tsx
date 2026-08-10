import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, Send, Square } from 'lucide-react';
import { useWonderVoyaChat } from '../lib/ai-chat';
import { TypingIndicator } from './typing-indicator';
import { ActivityCard } from './activity-card';
import { ActivityPanel } from './activity-panel';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { Message, ActivityRecommendation } from '../types/viator';

interface StreamingChatInterfaceProps {
  sessionId: string;
  initialMessages?: Message[];
  onMessageReceived?: () => void;
  setLocation?: (path: string) => void;
}

export interface StreamingChatInterfaceRef {
  startNewChat: () => void;
  sendMessage: (message: string, customLoadingMessage?: string, extractedDates?: any) => void;
}

function StreamingChatInterfaceComponent(props: StreamingChatInterfaceProps, ref: React.ForwardedRef<StreamingChatInterfaceRef>) {
  const { sessionId, initialMessages = [], setLocation } = props;
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [lastUserMessageTime, setLastUserMessageTime] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Open by default
  const [panelActivities, setPanelActivities] = useState<ActivityRecommendation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    sendMessage,
    recommendations,
    shouldShowRecommendations,
    stop,
  } = useWonderVoyaChat(sessionId, initialMessages);

  // Deduplicate activities based on unique identifiers
  const deduplicateActivities = (existingActivities: ActivityRecommendation[], newActivities: ActivityRecommendation[]): ActivityRecommendation[] => {
    const combinedActivities = [...existingActivities, ...newActivities];
    const uniqueActivities: ActivityRecommendation[] = [];
    const seenIdentifiers = new Set<string>();

    for (const activity of combinedActivities) {
      // Create a unique identifier using productCode (preferred) or title as fallback
      const identifier = activity.productCode || activity.title || activity.id;
      
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        uniqueActivities.push(activity);
      }
    }

    return uniqueActivities;
  };

  // Handle activity panel updates when recommendations change - optimized for immediate display
  useEffect(() => {
    if (recommendations && recommendations.length > 0) {
      // Immediately show the panel and add deduplicated activities
      setIsPanelOpen(true);
      setPanelActivities(prev => deduplicateActivities(prev, recommendations));
      setIsSearching(false); // Stop loading when recommendations arrive
    }
  }, [recommendations]);

  // Set loading state when AI is processing and looking for activities
  useEffect(() => {
    if (isLoading && messages.length > 0) {
      // Check if the latest message is from user and likely asking for activities
      const latestMessage = messages[messages.length - 1];
      if (latestMessage?.sender === 'user') {
        // Only show loading if the message appears to be asking for activities
        const messageContent = latestMessage.text || '';
        const isActivityQuery = messageContent.toLowerCase().includes('activit') || 
                               messageContent.toLowerCase().includes('recommend') ||
                               messageContent.toLowerCase().includes('do') ||
                               messageContent.toLowerCase().includes('visit') ||
                               messageContent.toLowerCase().includes('plan');
        if (isActivityQuery) {
          // Add small delay to prevent brief flashes during video transitions
          setTimeout(() => {
            if (isLoading) { // Only set if still loading
              setIsSearching(true);
            }
          }, 300);
        }
      }
    } else {
      // If not loading, clear the search state
      if (!isLoading) {
        setIsSearching(false);
      }
    }
  }, [isLoading, messages]);

  // Reset panel only when explicitly starting a new conversation
  useEffect(() => {
    if (messages.length === 0) {
      setPanelActivities([]);
      setIsPanelOpen(true); // Keep panel open but clear activities
      setIsSearching(false);
    }
  }, [messages.length]);

  // Keep panel open once activities are loaded (persistent behavior)
  const handlePanelClose = () => {
    // Only allow closing if there are no activities, otherwise just minimize
    if (panelActivities.length === 0) {
      setIsPanelOpen(false);
    }
  };

  // Handle intelligent scrolling for AI messages when they're received
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];

      // Only scroll for AI messages, not when first entering the page
      if (latestMessage.sender === 'ai' && messages.length > 1) {
        const delay = recommendations && recommendations.length > 0 ? 800 : 300;
        setTimeout(() => {
          const messageElement = document.getElementById(`message-${latestMessage.id}`);
          if (messageElement) {
            const messageRect = messageElement.getBoundingClientRect();
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // Position AI message at very top of viewport (20px from top for better visibility)
            const targetPosition = currentScrollTop + messageRect.top - 20;

            window.scrollTo({
              top: Math.max(0, targetPosition),
              behavior: 'smooth'
            });
          }
        }, delay);
      }
    }
  }, [messages, recommendations]);

  // Handle scrolling for typing indicator
  useEffect(() => {
    if (isLoading && messages.length > 0) {
      setTimeout(() => {
        const typingIndicator = document.querySelector('.typing-indicator-container');
        if (typingIndicator) {
          const typingRect = typingIndicator.getBoundingClientRect();
          const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;

          const targetPosition = currentScrollTop + typingRect.top - 20;

          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          });
        }
      }, 200);
    }
  }, [isLoading]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      setLastUserMessageTime(Date.now());
      setUserHasScrolled(false);
      handleSubmit(e);
    }
  };

  const sendMessageFromRef = (message: string, customLoadingMessage?: string, extractedDates?: any) => {
    if (message.trim() && !isLoading) {
      setLastUserMessageTime(Date.now());
      setUserHasScrolled(false);

      // Store extractedDates for use in itinerary creation
      if (extractedDates) {
        console.log('🎯 Received extractedDates from form:', extractedDates);
        // Store in sessionStorage for access by itinerary manager
        sessionStorage.setItem(`extractedDates_${sessionId}`, JSON.stringify(extractedDates));
      }

      sendMessage(message);
    }
  };

  const handleActivityInteraction = async (activity: ActivityRecommendation, action: string) => {
    console.log('🎯 Activity interaction triggered:', action, activity.title);

    switch (action) {
      case 'save':
        console.log('💾 Dispatching save event for:', activity.title);
        console.log('📋 Event detail:', { activity: activity.title, sessionId });
        console.log('📋 Full activity object:', activity);
        console.log('📋 Session ID:', sessionId);

        try {
          // Ensure we have all required data
          if (!activity) {
            console.error('❌ No activity provided');
            return;
          }

          if (!sessionId) {
            console.error('❌ No session ID provided');
            return;
          }

          // Open the save to itinerary modal
          const event = new CustomEvent('openItineraryModal', {
            detail: { activity, sessionId }
          });

          console.log('🚀 About to dispatch event:', event);
          console.log('🚀 Event detail for dispatch:', event.detail);
          console.log('🚀 Event detail activity:', event.detail.activity?.title);
          console.log('🚀 Event detail sessionId:', event.detail.sessionId);
          console.log('🚀 Window object exists:', !!window);

          // Dispatch the event
          const result = window.dispatchEvent(event);
          console.log('✅ Event dispatched successfully, result:', result);

          // Double check the event was dispatched
          console.log('🔍 Event dispatched with type:', event.type);
          console.log('🔍 Event bubbles:', event.bubbles);
          console.log('🔍 Event cancelable:', event.cancelable);

        } catch (error) {
          console.error('❌ Error dispatching event:', error);
        }
        break;
      case 'book':
        console.log('🔗 Opening booking URL for:', activity.title);
        // Handle booking
        const bookingUrl = activity.bookingUrl || activity.productUrl || 
          `https://www.viator.com/tours/activity/${activity.productCode}`;
        window.open(bookingUrl, '_blank');
        break;
      case 'expand':
        console.log('🔍 Dispatching expand event for:', activity.title);
        // Handle expand/view details
        const expandEvent = new CustomEvent('expandActivity', {
          detail: { activity }
        });
        window.dispatchEvent(expandEvent);
        console.log('✅ Expand event dispatched successfully');
        break;
      default:
        console.log('❓ Unknown activity interaction:', action, activity);
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    startNewChat: () => {
      // Reset chat state - this would need integration with the parent's session management
      window.location.reload(); // Temporary solution
    },
    sendMessage: sendMessageFromRef,
  }));

  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [realTimeTranscription, setRealTimeTranscription] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const isTranscribingRef = useRef(false);

  const sendMessageMutation = { isPending: false };

  // Initialize speech recognition (same as home page)
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Changed to false for better reliability
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        // Add network resilience settings
        if (recognition.serviceURI) {
          recognition.serviceURI = undefined; // Use default service
        }

        setSpeechRecognition(recognition);
        setSpeechSupported(true);
      } else {
        setSpeechSupported(false);
      }
    } else {
      setSpeechSupported(false);
    }
  }, []);

  const toggleVoiceRecording = () => {
    console.log('🎤 Voice recording button clicked, current state:', { isListening, speechSupported });

    if (isListening) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  const startVoiceRecording = async () => {
    console.log('🎤 Starting voice recording, speech supported:', speechSupported);

    setIsListening(true);
    isRecordingRef.current = true;
    setRealTimeTranscription('');
    setTranscribedText('');

    // Always try live transcription first, regardless of environment
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      console.log('Speech recognition available, attempting to start...');
      try {
        startRealtimeTranscription();
      } catch (error) {
        console.log('Live transcription failed to start:', error);
        setRealTimeTranscription('Using server transcription for reliable results...');
      }
    } else {
      console.log('Speech recognition not supported in this browser');
      setRealTimeTranscription('Live transcription not supported in this browser. Recording will be processed after you stop.');
    }

    // Start recording
    startRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);

      // Set up MediaRecorder for backup transcription
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log('🛑 MediaRecorder stopped, processing chunks:', chunks.length);

        if (chunks.length === 0) {
          console.log('❌ No audio chunks recorded');
          setRealTimeTranscription('No audio recorded - please try again');
          setIsTranscribing(false);
          return;
        }

        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);

        console.log('🎤 Audio recorded successfully:', {
          size: audioBlob.size,
          type: audioBlob.type,
          chunks: chunks.length
        });

        // Auto-transcribe the audio
        setRealTimeTranscription('Processing your voice message...');
        await handleTranscribeAudio(audioBlob);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setRealTimeTranscription('Recording...');

      // Set up browser speech recognition with enhanced error handling
      if (speechRecognition) {
        try {
          speechRecognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript;
              } else {
                interimTranscript += transcript;
              }
            }

            // Show real-time transcription
            const currentTranscript = finalTranscript || interimTranscript;
            if (currentTranscript.trim()) {
              setRealTimeTranscription(currentTranscript);
              const syntheticEvent = {
                target: { value: currentTranscript.trim() }
              } as React.ChangeEvent<HTMLTextAreaElement>;
              handleInputChange(syntheticEvent);
            }
          };

          speechRecognition.onerror = (event: any) => {
            console.log('Speech recognition error:', event.error);

            // Handle network errors gracefully
            if (event.error === 'network') {
              setRealTimeTranscription('Network connection issue - audio being recorded locally...');
            } else if (event.error === 'no-speech') {
              setRealTimeTranscription('No speech detected - please speak clearly...');
            } else if (event.error === 'not-allowed') {
              setRealTimeTranscription('Microphone access denied. Please enable permissions.');
            } else {
              setRealTimeTranscription('Speech recognition unavailable - recording audio for processing...');
            }
          };

          speechRecognition.onend = () => {
            // Don't restart if we're stopping recording
            if (isRecordingRef.current) {
              try {
                speechRecognition.start();
              } catch (error) {
                console.log('Could not restart speech recognition');
              }
            }
          };

          speechRecognition.start();
        } catch (error) {
          console.log('Browser speech recognition not available, using audio recording fallback');
          setRealTimeTranscription('Recording audio for processing...');
        }
      } else {
        setRealTimeTranscription('Recording audio for processing...');
      }

    } catch (error) {
      console.error('Error starting recording:', error);
      setRealTimeTranscription('Failed to start recording. Please check microphone permissions.');
    }
  };

  const startRealtimeTranscription = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        let finalTranscript = '';
        let hasNetworkError = false;
        let errorCount = 0;

        recognition.onstart = () => {
          setRealTimeTranscription('');
          finalTranscript = '';
          hasNetworkError = false;
          errorCount = 0;
        };

        recognition.onresult = (event: any) => {
          // Reset error count on successful results
          errorCount = 0;
          hasNetworkError = false;

          let interimTranscript = '';
          let currentFinalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              currentFinalTranscript += result[0].transcript;
            } else {
              interimTranscript += result[0].transcript;
            }
          }

          // Update final transcript
          if (currentFinalTranscript.trim()) {
            finalTranscript = currentFinalTranscript.trim();
          }

          // Update real-time transcription with interim results
          const currentTranscript = finalTranscript || interimTranscript;
          if (currentTranscript.trim()) {
            setRealTimeTranscription(currentTranscript.trim());
            const syntheticEvent = {
              target: { value: currentTranscript.trim() }
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('🚨 Speech recognition error:', event.error);
          errorCount++;

          switch (event.error) {
            case 'not-allowed':
              setRealTimeTranscription('Microphone access denied');
              hasNetworkError = true; // Stop retrying
              break;
            case 'no-speech':
              // Don't show error for no speech, just continue
              break;
            case 'network':
              hasNetworkError = true;
              // Only show network error message once, then go silent
              if (errorCount === 1) {
                setRealTimeTranscription('Using server transcription for best results...');
                // Clear the message after 2 seconds
                setTimeout(() => {
                  if (isRecordingRef.current) {
                    setRealTimeTranscription('Recording...');
                  }
                }, 2000);
              }
              break;
            default:
              // For other errors, stop retrying after 3 attempts
              if (errorCount >= 3) {
                hasNetworkError = true;
                setRealTimeTranscription('Recording audio for server transcription...');
              }
          }
        };

        recognition.onend = () => {
          console.log('🔇 Speech recognition ended');
          setSpeechRecognition(null);

          // Only restart if recording is active, no major errors, and we haven't exceeded retry limit
          if (isRecordingRef.current && !hasNetworkError && errorCount < 3) {
            setTimeout(() => {
              if (isRecordingRef.current) {
                startRealtimeTranscription();
              }
            }, 100);
          } else if (isRecordingRef.current) {
            // Just show recording status without error messages
            setRealTimeTranscription('Recording...');
          }
        };

        recognition.start();
        setSpeechRecognition(recognition);
      }
    } catch (error) {
      console.error('❌ Failed to start speech recognition:', error);
      setRealTimeTranscription('Recording...');
    }
  };

  const stopVoiceRecording = () => {
    console.log('🛑 Stopping recording...');
    setIsListening(false);
    isRecordingRef.current = false;

    // Stop speech recognition gracefully
    if (speechRecognition) {
      try {
        speechRecognition.stop();
        speechRecognition.abort(); // Force stop
        setSpeechRecognition(null);
      } catch (error) {
        console.log('Speech recognition already stopped');
      }
    }

    // Stop media recorder - transcription will be handled by the onstop event only
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('📹 Stopping active media recorder...');
      setRealTimeTranscription('Finalizing recording...');
      mediaRecorder.stop();
      // Don't manually call transcription here - let the onstop handler do it
    } else if (recordedAudio) {
      // Fallback: if we already have recorded audio but recorder isn't active
      console.log('🎵 Using existing recorded audio for transcription');
      setRealTimeTranscription('Processing your voice message...');
      handleTranscribeAudio(recordedAudio);
    } else {
      console.log('ℹ️ No recorded audio available - recording may have been too short');
      setRealTimeTranscription('Recording too short - please try again');
      setTimeout(() => setRealTimeTranscription(''), 2000);
    }

    // Stop audio stream
    if (audioStream) {
      audioStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.log('Track already stopped');
        }
      });
      setAudioStream(null);
    }

    // Clear transcript after a short delay only if not processing
    setTimeout(() => {
      setTranscript('');
      if (!isTranscribing) {
        setRealTimeTranscription('');
      }
    }, 1000);
  };

  const handleTranscribeAudio = async (audioBlob: Blob) => {
    // Prevent duplicate transcription calls
    if (isTranscribingRef.current) {
      console.log('🔄 Transcription already in progress, skipping duplicate call');
      return;
    }

    console.log('🎯 Starting transcription...', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    setIsTranscribing(true);
    isTranscribingRef.current = true;

    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Create AbortController with proper cleanup
      controller = new AbortController();

      // Set timeout with proper error handling
      timeoutId = setTimeout(() => {
        if (controller && !controller.signal.aborted) {
          console.log('⏰ Transcription timeout - aborting request');
          controller.abort();
        }
      }, 30000); // Increased to 30 second timeout

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      setRealTimeTranscription('Processing your recording...');

      console.log('📤 Sending transcription request...');
      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      // Clear timeout on successful response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      console.log('📥 Transcription response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Transcription API error:', response.status, errorText);

        if (response.status === 503 || response.status === 502) {
          throw new Error('Speech service temporarily unavailable');
        } else if (response.status === 429) {
          throw new Error('Too many requests - please wait a moment');
        } else if (response.status === 400) {
          throw new Error('Audio format not supported - please try again');
        } else {
          throw new Error(`Transcription service error: ${response.status}`);
        }
      }

      const result = await response.json();

      if (result.text && result.text.trim()) {
        console.log('✅ Transcription successful:', result.text.trim());
        setTranscribedText(result.text.trim());
        // Create a synthetic event to properly update the input
        const syntheticEvent = {
          target: { value: result.text.trim() }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
        setRealTimeTranscription('Voice message ready to send'); // Show success message
        setIsTranscribing(false);
        isTranscribingRef.current = false;

        // Clear success message after showing transcription result
        setTimeout(() => {
          setRealTimeTranscription('');
        }, 2000);
      } else {
        console.log('❌ No speech detected in response');
        setRealTimeTranscription('No clear speech detected - please try recording again');
        setTimeout(() => {
          setRealTimeTranscription('');
          setIsTranscribing(false);
          isTranscribingRef.current = false;
        }, 3000);
      }
    } catch (error: any) {
      console.log('🔍 Transcription error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n')[0]
      });

      // Handle AbortError gracefully - this is normal when user stops recording
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('user aborted')) {
        console.log('🛑 Transcription request was aborted (user stopped recording) - this is normal');
        setRealTimeTranscription('');
        setIsTranscribing(false);
        isTranscribingRef.current = false;
        return; // Exit silently, this is expected behavior
      }

      // Only show actual errors, not expected user actions
      let errorMessage = 'Transcription failed - please try recording again';

      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Network issue - please check your connection and try again';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Service timeout - please try again with a shorter recording';
      } else if (error.message?.includes('Audio format')) {
        errorMessage = 'Audio format issue - please try recording again';
      } else if (error.message && !error.message.includes('aborted')) {
        errorMessage = error.message;
      } else {
        // If it's any other abort-related error, don't show it
        setRealTimeTranscription('');
        setIsTranscribing(false);
        isTranscribingRef.current = false;
        return;
      }

      setRealTimeTranscription(errorMessage);

      // Auto-clear error message after 4 seconds
      setTimeout(() => {
        setRealTimeTranscription('');
        setIsTranscribing(false);
        isTranscribingRef.current = false;
      }, 4000);
    } finally {
      // Cleanup resources safely
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Ensure transcription flag is always reset
      isTranscribingRef.current = false;
      // Don't call abort in finally - let it naturally abort if needed
    }
  };
  const handleSpeechResult = async (transcript: string) => {
    if (transcript.trim()) {
      const syntheticChangeEvent = {
        target: { value: transcript.trim() }
      } as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticChangeEvent);
      console.log('🎤 Speech transcription received:', transcript);

      try {
        // Auto-submit the transcribed message
        const syntheticSubmitEvent = { preventDefault: () => {} } as React.FormEvent;
        await handleSubmit(syntheticSubmitEvent);
      } catch (error) {
        console.error('🚨 Error submitting speech message:', error);
        // Keep the transcribed text in the input so user can manually submit
      }
    }
  };
  const [fallbackData, setFallbackData] = useState<any>(null);

  // Debug log the fallback data
  useEffect(() => {
    if (fallbackData?.recommendations) {
      console.log('✅ Fallback: Recommendations data:', fallbackData);
      console.log('🔍 Fallback: Number of recommendations:', fallbackData.recommendations.length);
      console.log('🎯 Fallback: Destination:', fallbackData.preferences?.destination);
      console.log('📅 Fallback: Extracted dates:', fallbackData.extractedDates);
    }
  }, [fallbackData]);
  const MessageComponent = React.memo(({ message, isUser }: { message: Message; isUser: boolean }) => {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`max-w-3xl px-4 py-2 rounded-lg ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          <div className="whitespace-pre-wrap">
            {message.text}
          </div>
        </div>
      </div>
    );
  });
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(true);
  return (
    <div className="h-screen overflow-hidden relative">
      {/* Main Chat Section */}
      <div className={`relative z-20 flex flex-col h-screen transition-all duration-300 ${isPanelOpen ? 'mr-[45vw]' : 'mr-0'}`} style={{ backgroundColor: 'transparent' }}>
        <div className="flex flex-col h-full w-full" style={{ 
          paddingTop: '6rem',
          paddingBottom: '1rem',
          paddingLeft: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          paddingRight: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          maxWidth: '100vw'
        }}>
          {/* Messages Container - scrollable */}
          <div 
            ref={chatContainerRef} 
            className="flex-1 overflow-y-auto space-y-6 pr-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent'
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                style={message.sender === 'ai' ? { marginLeft: '0px' } : {}}
              >
                <div
                  className={`max-w-[95%] rounded-xl p-4 shadow-lg ${
                    message.sender === 'user'
                      ? 'bg-[#1E3A8A] text-[#F8FAFC]'
                      : 'bg-[#F8FAFC]/95 backdrop-blur-sm text-[#1F2937] border border-[#E5E7EB]/30'
                  }`}
                  style={message.sender === 'ai' ? {
                    marginLeft: '0px'
                  } : {}}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed font-['Inter'] mb-2">
                    {message.text}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex justify-start typing-indicator-container" style={{ marginLeft: '0px' }}>
                <div className="bg-[#F8FAFC]/95 backdrop-blur-sm text-[#1F2937] border border-[#E5E7EB]/30 rounded-xl p-4 shadow-lg max-w-[95%]" style={{ marginLeft: '0px' }}>
                  <TypingIndicator />
                </div>
              </div>
            )}

            {/* Activity recommendations now appear in the side panel */}
          </div>

          {/* Input Form */}
          <form onSubmit={handleFormSubmit} className="relative mt-6 flex-shrink-0">
            <div className="flex items-end space-x-3 bg-[#F8FAFC]/95 backdrop-blur-sm p-4 rounded-xl border border-[#E5E7EB]/30 shadow-lg">
              <Textarea
                value={input}
                onChange={handleInputChange}
                placeholder={
                  isListening 
                    ? (realTimeTranscription || transcript || "🎤 Listening...") 
                    : isTranscribing 
                      ? "Processing your voice message..."
                      : "Ask me about travel recommendations..."
                }
                className="flex-1 min-h-[44px] max-h-48 resize-none border-0 bg-transparent text-[#1F2937] placeholder:text-[#6B7280] focus:ring-0 font-['Inter'] pr-20"
                style={{
                  height: 'auto',
                  minHeight: '44px',
                  overflowY: 'auto'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  const newHeight = Math.min(target.scrollHeight, 192); // 192px = max-h-48
                  target.style.height = `${newHeight}px`;

                  // Enable scroll when content exceeds max height
                  if (target.scrollHeight > 192) {
                    target.style.overflowY = 'auto';
                  } else {
                    target.style.overflowY = 'hidden';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleFormSubmit(e);
                  }
                }}
              />
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleVoiceRecording}
                  disabled={sendMessageMutation.isPending || !speechSupported || isTranscribing}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all duration-200 text-white disabled:opacity-50 disabled:cursor-notallowed"
                  style={{
                    backgroundColor: isListening ? '#dc2626' : isTranscribing ? '#6B7280' : speechSupported ? '#1E3A8A' : '#6B7280',
                    boxShadow: isListening 
                      ? '0 4px 12px rgba(220, 38, 38, 0.3)' 
                      : speechSupported && !isTranscribing
                        ? '0 2px 8px rgba(30, 58, 138, 0.3)' 
                        : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isListening && speechSupported && !sendMessageMutation.isPending && !isTranscribing) {
                      e.currentTarget.style.backgroundColor = '#1E40AF';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isListening && speechSupported && !isTranscribing) {
                      e.currentTarget.style.backgroundColor = '#1E3A8A';
                    }
                  }}
                  title={
                    !speechSupported 
                      ? "Voice input not supported" 
                      : isTranscribing
                        ? "Processing audio..."
                      : isListening 
                        ? "Click to stop recording" 
                        : "Click to start recording"
                  }
                >
                  <i className={`fas ${
                    isTranscribing ? 'fa-spinner fa-spin' : 
                    isListening ? 'fa-stop' : 'fa-microphone'
                  } text-xs ${isListening ? 'animate-pulse' : ''}`}></i>
                </button>
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  size="sm"
                  className="bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-[#F8FAFC] disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </form>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Activity Panel - Side by Side */}
      <ActivityPanel 
        isOpen={isActivityPanelOpen}
        onClose={handlePanelClose}
        activities={panelActivities}
        onActivityInteraction={handleActivityInteraction}
        isLoading={isSearching || isLoading}
        destination={fallbackData?.preferences?.destination}
        extractedDates={fallbackData?.extractedDates}
        setLocation={setLocation}
      />
    </div>
  );
}

export const StreamingChatInterface = forwardRef<StreamingChatInterfaceRef, StreamingChatInterfaceProps>(StreamingChatInterfaceComponent);

StreamingChatInterface.displayName = 'StreamingChatInterface';

export default StreamingChatInterface;