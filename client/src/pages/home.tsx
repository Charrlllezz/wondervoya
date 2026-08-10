import { Link, useLocation } from 'wouter';
import { ChatInterface } from '../components/chat-interface';
import { StreamingChatInterface } from '../components/streaming-chat-interface';

import { ItineraryManager } from '../components/itinerary-manager';
import { ActivityDetailModal } from '../components/activity-detail-modal';
import { HomePageVideoCarousel } from '../components/home-page-video-carousel';
import { ChatPageVideoCarousel } from '../components/chat-page-video-carousel';
import { useAuth } from '../hooks/useAuth';
import { globalVideoState } from '../lib/global-video-state';
import { navigateWithVideoState } from '../lib/navigation';
import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DayPicker } from 'react-day-picker';
import { Calendar, ArrowRight, Sparkles, Globe, Users, Heart, X, MapPin, Plane, ChevronDown, CheckCircle } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { videoPreloader } from '@/lib/video-preloader';
import heroVideo from '@/assets/serene-tropical-video.mp4';
import clip2 from '@/assets/clip2.mp4';
import clip3 from '@/assets/clip3.mp4';
import clip4 from '@/assets/clip4.mp4';
import clip5 from '@/assets/clip5.mp4';
import type { ActivityRecommendation } from '../types/viator';

export default function Home() {
  const [, setLocation] = useLocation();
  const chatInterfaceRef = useRef<any>(null);
  const { user, isAuthenticated, isLoading } = useAuth();



  const [showSignInDialog, setShowSignInDialog] = useState(false);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showUniversalTemplate, setShowUniversalTemplate] = useState(false);
  const [showVoiceRecording, setShowVoiceRecording] = useState(false);
  const [chatTriggered, setChatTriggered] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const isRecordingRef = useRef(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [realTimeTranscription, setRealTimeTranscription] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [editableTranscription, setEditableTranscription] = useState<string>('');
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Track current page for video navigation - only set when actually navigating away
  useEffect(() => {
    // Only set to 'home' if we're actually loading the home page directly
    // Don't override existing session storage that might be set by navigation
    if (!sessionStorage.getItem('currentPage')) {
      sessionStorage.setItem('currentPage', 'home');
    }
  }, []);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [playbackPosition, setPlaybackPosition] = useState<number>(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [universalFormData, setUniversalFormData] = useState({
    destination: '',
    dates: '',
    interests: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<{from?: Date, to?: Date}>({});
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Itinerary modal state
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecommendation | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  // Activity detail modal state
  const [showActivityDetailModal, setShowActivityDetailModal] = useState(false);
  const [activityForDetail, setActivityForDetail] = useState<ActivityRecommendation | null>(null);

  // Enhanced date picker state for auto-navigation
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Handle date selection with auto-navigation
  const handleDateSelect = (range: {from?: Date, to?: Date} | undefined) => {
    console.log('📅 Date selected:', range);
    if (range) {
      setSelectedDateRange(range);

      // Auto-navigate to next month if user clicks on last day of current month
      if (range.from && !range.to) {
        const clickedDate = range.from;
        const currentMonth = calendarMonth.getMonth();
        const currentYear = calendarMonth.getFullYear();
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Check if clicked date is the last day of the current displayed month
        if (clickedDate.getDate() === lastDayOfMonth && 
            clickedDate.getMonth() === currentMonth && 
            clickedDate.getFullYear() === currentYear) {
          // Navigate to next month
          const nextMonth = new Date(currentYear, currentMonth + 1, 1);
          setCalendarMonth(nextMonth);
          console.log('📅 Auto-navigating to next month:', nextMonth);
        }
      }

      // Format dates for display
      let dateString = '';
      if (range.from) {
        dateString = format(range.from, 'MMM d, yyyy');
        if (range.to && range.to.getTime() !== range.from.getTime()) {
          dateString += ' - ' + format(range.to, 'MMM d, yyyy');
        }
      }

      console.log('📝 Formatted date string:', dateString);
      setUniversalFormData({...universalFormData, dates: dateString});
    }
  };

  // Fetch recent conversations
  const { data: recentChats = [], isLoading: chatsLoading } = useQuery({
    queryKey: ['/api/conversations/recent'],
    retry: false
  });

  // Smart destination search now handles autocomplete directly

  // Handle location search with enhanced destination matching
  const handleLocationSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setLocationSuggestions([]);
      setShowLocationDropdown(false);
      return;
    }

    setIsLoadingLocations(true);
    setShowLocationDropdown(true);

    try {
      // Use enhanced destination search API (same as LocationAutocomplete component)
      const response = await fetch('/api/destinations/find', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          searchTerm: searchTerm.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        console.log(`🔍 Plan Adventure modal: Found ${results.length} enhanced destinations for "${searchTerm}"`);
        setLocationSuggestions(results);
      } else {
        console.error('Enhanced destination search failed:', response.statusText);
        setLocationSuggestions([]);
      }
    } catch (error) {
      console.error('Enhanced location search failed:', error);
      setLocationSuggestions([]);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  // Handle location selection - support both old format (name) and new format (destinationName)
  const handleLocationSelect = (location: any) => {
    const destinationName = location.destinationName || location.name;
    setUniversalFormData({...universalFormData, destination: destinationName});
    setShowLocationDropdown(false);
    setLocationSuggestions([]);
    console.log(`🎯 Plan Adventure modal: Selected destination "${destinationName}"`);
  };

  // Video array for cross-fade sequence
  const videoList = [
    heroVideo,  // Clip 1 (current serene tropical)
    clip2,      // Clip 2
    clip3,      // Clip 3
    clip4,      // Clip 4
    clip5       // Clip 5
  ];

  // Handle video loading
  const handleVideoLoad = () => {
    if (!videoLoaded) {
      setVideoLoaded(true);
      // Faster transition on mobile, slightly longer on desktop
      const isMobile = window.innerWidth < 768;
      const delay = isMobile ? 200 : 400;
      setTimeout(() => {
        setShowCompass(false);
        setShowContent(true);
      }, delay);
    }
  };

  // Show compass immediately on component mount
  useEffect(() => {
    setShowCompass(true);
    // Faster failsafe - if videos don't load after 1 second, hide compass anyway
    const failsafe = setTimeout(() => {
      setShowCompass(false);
      setShowContent(true);
    }, 1000);

    return () => clearTimeout(failsafe);
  }, []);

  // Cross-fade effect between videos with consistent timing (only for homepage, not chat)
  useEffect(() => {
    if (!videoLoaded || videoList.length <= 1 || chatTriggered) return;

    // Use consistent 7-second display time for all videos on homepage only
    const displayDuration = 7000; 

    const timeout = setTimeout(() => {
      // Update to next video index
      const nextIndex = (currentVideoIndex + 1) % videoList.length;
      console.log(`Homepage: Transitioning from video ${currentVideoIndex} to video ${nextIndex} (7s display)`);

      setCurrentVideoIndex(nextIndex);
    }, displayDuration);

    return () => clearTimeout(timeout);
  }, [videoLoaded, videoList.length, currentVideoIndex, chatTriggered]);

  // Aggressive chat video preloading - start immediately when home page loads
  useEffect(() => {
    if (chatTriggered) return;

    // Start preloading ALL chat videos immediately with high priority
    console.log('🚀 Starting aggressive preload of ALL chat page videos for instant availability...');

    const preloadAllChatVideos = async () => {
      const allChatVideoImports = [
        import('@/assets/1.mp4'), import('@/assets/2.mp4'), import('@/assets/3.mp4'),
        import('@/assets/4.mp4'), import('@/assets/5.mp4'), import('@/assets/6.mp4'),
        import('@/assets/7.mp4'), import('@/assets/8.mp4'), import('@/assets/9.mp4'),
        import('@/assets/10.mp4'), import('@/assets/11.mp4'), import('@/assets/12.mp4'),
        import('@/assets/13.mp4'), import('@/assets/14.mp4'), import('@/assets/15.mp4'),
        import('@/assets/16.mp4'), import('@/assets/17.mp4')
      ];

      // Preload all videos simultaneously with high priority
      const preloadPromises = allChatVideoImports.map(async (videoImport, index) => {
        try {
          const videoModule = await videoImport;
          // High priority for all videos (1-17) for instant chat page availability
          await videoPreloader.preloadVideo(videoModule.default, index + 1);
          console.log(`✅ Pre-preloaded chat video ${index + 1} for instant availability`);
          return true;
        } catch (error) {
          console.log(`⚠️ Failed to pre-preload chat video ${index + 1}:`, error);
          return false;
        }
      });

      // Wait for all videos to preload
      const results = await Promise.allSettled(preloadPromises);
      const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;
      console.log(`🎬 Chat video preloading complete: ${successCount}/17 videos ready for instant chat page access`);
    };

    // Start preloading immediately when component mounts
    preloadAllChatVideos();
  }, [chatTriggered]);





  const handleLoadConversation = (conversationId: string) => {
    if (chatInterfaceRef.current) {
      chatInterfaceRef.current.loadConversation(conversationId);
    }
  };

  // Template definitions (matching chat interface)
  const travelTemplates = [
    {
      id: 'romantic',
      title: 'Romantic Getaway',
      badge: 'COUPLES',
      badgeColor: '#722F37', // Deep Wine
      template: 'Going to [destination] on [dates] with my partner. We\'re looking for romantic activities like [sunset dinners, couples spa, scenic walks, wine tasting]. Budget: [activity budget].'
    },
    {
      id: 'family',
      title: 'Family Adventure',
      badge: 'ALL AGES',
      badgeColor: '#C9A876', // Antique Gold
      template: 'Planning a family trip to [destination] from [dates] with [number] adults and [number] kids (ages [ages]). Looking for family-friendly activities like [theme parks, museums, outdoor adventures, educational tours]. Budget: [budget per person/total].'
    },
    {
      id: 'solo',
      title: 'Solo Explorer',
      badge: 'INDEPENDENT',
      badgeColor: '#9B8B7A', // Warm Taupe
      template: 'Solo traveling to [destination] on [dates]. I enjoy [adventure activities, cultural experiences, food tours, photography spots]. Budget: [activity budget].'
    },
    {
      id: 'friends',
      title: 'Friends Trip',
      badge: 'GROUP',
      badgeColor: '#722F37', // Deep Wine
      template: 'Going to [destination] with [number] friends from [dates]. We love [nightlife, adventure sports, group activities, food experiences] and want unforgettable experiences. Budget: [budget per person].'
    }
  ];

  const handleTemplateSelect = (templateId: string) => {
    const template = travelTemplates.find(t => t.id === templateId);
    if (template && chatInterfaceRef.current) {
      // Open the template form in the chat interface
      chatInterfaceRef.current.openTemplateForm(template);

      // Scroll to the chat interface
      setTimeout(() => {
        const chatSection = document.querySelector('[data-chat-section]');
        if (chatSection) {
          chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  // Navigation handlers
  const handleLogoClick = () => {
    // WonderVoya logo acts as Dashboard/Home button and New Chat
    if (chatTriggered) {
      // If in chat mode, start new chat
      handleStartNewChat();
    } else {
      // If on homepage, scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStartNewChat = () => {
    if (chatInterfaceRef.current) {
      chatInterfaceRef.current.startNewChat();
    }
  };



  const handleSignIn = () => {
    setShowSignInDialog(true);
  };

  const handleAuthPopup = (provider: 'google' | 'apple') => {
    setIsSigningIn(true);
    const popup = window.open(`/api/auth/${provider}`, 'oauth', 'width=500,height=600');

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setIsSigningIn(false);
        setShowSignInDialog(false);
        window.location.reload();
      }
    }, 1000);
  };

  const handleUniversalTemplateSubmit = () => {
    console.log('🚀 Start Planning button clicked');
    console.log('📋 Form data:', universalFormData);
    console.log('📅 Selected date range:', selectedDateRange);

    // Create template message from form data
    const templateMessage = `I'm planning to travel to ${universalFormData.destination} on ${universalFormData.dates}. I'm interested in ${universalFormData.interests}. Can you help me find activities and create an itinerary?`;

    console.log('📝 Template message:', templateMessage);

    // Create structured extractedDates object from form data
    const extractedDates = {
      destination: universalFormData.destination,
      startDate: selectedDateRange.from ? selectedDateRange.from.toISOString().split('T')[0] : null,
      endDate: selectedDateRange.to ? selectedDateRange.to.toISOString().split('T')[0] : null,
      duration: selectedDateRange.from && selectedDateRange.to ? 
        Math.ceil((selectedDateRange.to.getTime() - selectedDateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1 : null
    };

    console.log('📊 Extracted dates object:', extractedDates);

    // Don't set session storage here - let the navigation handle it

    // First, show chat interface with loading message and close form
    setChatTriggered(true);
    setShowUniversalTemplate(false);

    // Video carousels are now independent - no need for global state reset
    console.log('✅ Chat triggered, form closed');

    // Wait for chat interface to render, then send message
    setTimeout(() => {
      if (chatInterfaceRef.current) {
        console.log('🔍 Chat interface ref found, sending message with extracted dates');
        chatInterfaceRef.current.sendMessage(templateMessage, `Finding the perfect activities for your trip to ${universalFormData.destination}...`, extractedDates);

        // Scroll to chat section
        setTimeout(() => {
          const chatSection = document.querySelector('[data-chat-section]');
          if (chatSection) {
            chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('🎯 Scrolled to chat section');
          } else {
            console.log('❌ Chat section not found');
          }
        }, 100);
      } else {
        console.log('❌ Chat interface ref still not available after delay');
      }
    }, 100);

    // Reset form
    setUniversalFormData({
      destination: '',
      dates: '',
      interests: ''
    });
    setSelectedDateRange({});
  };

  // Callback to handle when chat message is received
  const handleChatMessageReceived = () => {
    console.log('📨 Chat message received, transitioning to chat interface');
    setChatLoading(false);
    setChatTriggered(true);
  };

  // Callback to handle when chat starts loading
  const handleChatStartLoading = () => {
    console.log('📨 Chat starting to load, showing loading message');
    setChatLoading(false);
    setChatTriggered(true);
  };

  // Global event listeners for activity interactions
  useEffect(() => {
    console.log('🎯 Setting up event listeners for activity interactions');

    const handleOpenItineraryModal = (event: any) => {
      console.log('🎯 Itinerary modal event received:', event.detail);
      const { activity, sessionId } = event.detail;
      console.log('🎯 Activity:', activity?.title, 'SessionId:', sessionId);
      console.log('🎯 Current modal state before:', showItineraryModal);
      console.log('🎯 Setting activity:', activity);
      console.log('🎯 Setting session ID:', sessionId);

      // Force immediate state update
      setSelectedActivity(activity);
      setCurrentSessionId(sessionId);
      setShowItineraryModal(true);

      console.log('🎯 Modal state should be true now');
      console.log('🎯 Activity set:', activity?.title);
      console.log('🎯 Session ID set:', sessionId);
    };

    const handleExpandActivity = (event: any) => {
      console.log('🎯 Expand activity event received:', event.detail);
      const { activity } = event.detail;
      setActivityForDetail(activity);
      setShowActivityDetailModal(true);
    };

    // Add event listeners with detailed logging
    window.addEventListener('openItineraryModal', handleOpenItineraryModal);
    window.addEventListener('expandActivity', handleExpandActivity);

    console.log('✅ Event listeners registered successfully');
    console.log('🎯 Window object:', window);
    console.log('🎯 Event listeners available:', typeof window.addEventListener);

    return () => {
      console.log('🎯 Cleaning up event listeners');
      window.removeEventListener('openItineraryModal', handleOpenItineraryModal);
      window.removeEventListener('expandActivity', handleExpandActivity);
    };
  }, [showItineraryModal]);

  const handleVoiceRecording = async () => {
    // Open voice modal but don't start recording immediately
    setShowVoiceModal(true);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRealTimeTranscription('');
    setAudioLevel(0);
    setTranscribedText('');
    setEditableTranscription('');
    setIsTranscribing(false);
    setWaveformData([]);
    setRecordedAudioUrl(null);
    setIsPlayingRecording(false);
    setRecordingDuration(0);
    setPlaybackPosition(0);

    // Clean up any existing speech recognition
    if (speechRecognition) {
      speechRecognition.stop();
      setSpeechRecognition(null);
    }
  };

  const handleStartRecording = async () => {
    setIsRecording(true);
    isRecordingRef.current = true;
    setRealTimeTranscription('');
    setAudioLevel(0);
    setTranscribedText(''); // Clear any previous transcription

    // Always try live transcription first, regardless of environment
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      console.log('Speech recognition available, attempting to start...');
      console.log('Environment details:', {
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        userAgent: navigator.userAgent,
        isSecureContext: window.isSecureContext
      });
      try {
        startRealtimeTranscription();
      } catch (error) {
        console.log('Live transcription failed to start:', error);
        setRealTimeTranscription('Using server transcription for reliable results...');
      }
    } else {
      console.log('Speech recognition not supported in this browser');
      console.log('Available APIs:', {
        SpeechRecognition: !!window.SpeechRecognition,
        webkitSpeechRecognition: !!window.webkitSpeechRecognition,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia
      });
      setRealTimeTranscription('Live transcription not supported in this browser. Recording will be processed after you stop.');
    }

    // Start recording
    startRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);

      // Set up waveform data collection
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const waveformArray: number[] = [];
      let animationFrameId: number;
      const startTime = Date.now();

      const updateWaveform = () => {
        if (isRecordingRef.current) {
          analyser.getByteFrequencyData(dataArray);

          // Calculate current audio level (0-1)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const normalizedLevel = Math.min(average / 128, 1);

          // Update duration every frame
          const currentTime = Date.now();
          const duration = Math.floor((currentTime - startTime) / 1000);
          setRecordingDuration(duration);

          // Add to waveform data every 100ms for smooth visualization
          if (waveformArray.length === 0 || currentTime - startTime - (waveformArray.length * 100) >= 100) {
            waveformArray.push(normalizedLevel);
            setWaveformData([...waveformArray]);
          }

          setAudioLevel(normalizedLevel * 100);
          animationFrameId = requestAnimationFrame(updateWaveform);
        }
      };
      updateWaveform();

      // Store cleanup function
      (window as any).stopAudioLevelMonitoring = () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };

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

        // Create audio URL for playback
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);

        console.log('🎤 Audio recorded successfully:', {
          size: audioBlob.size,
          type: audioBlob.type,
          duration: recordingDuration,
          chunks: chunks.length
        });

        // Auto-transcribe the audio - don't set isTranscribing here as it's set in the function
        setRealTimeTranscription('Processing your voice message...');
        await transcribeVoiceMessage(audioBlob);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
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

            // Update real-time transcription
            const currentTranscript = finalTranscript || interimTranscript;
            if (currentTranscript.trim()) {
              setRealTimeTranscription(currentTranscript.trim());
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

  const handleStopRecording = () => {
    console.log('🛑 Stopping recording...');
    setIsRecording(false);
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

    // Stop media recorder and automatically start transcription
    if (mediaRecorder) {
      console.log('📹 Media recorder state:', mediaRecorder.state);

      if (mediaRecorder.state === 'recording') {
        console.log('📹 Stopping active media recorder...');
        mediaRecorder.stop();
        // Note: transcription will be triggered in the onstop handler
      } else if (mediaRecorder.state === 'inactive' && recordedAudio) {
        // If recorder is already stopped but we have audio, transcribe it
        console.log('🎵 Media recorder already stopped, transcribing existing audio');
        setRealTimeTranscription('Processing your voice message...');
        handleTranscribeAudio(recordedAudio);
      } else {
        console.log('❌ No recorded audio available');
        setRealTimeTranscription('No audio recorded - please try again');
        setTimeout(() => setRealTimeTranscription(''), 2000);
      }
    } else if (recordedAudio) {
      // Fallback: if we have recorded audio but no media recorder reference
      console.log('🎵 Using existing recorded audio for transcription');
      setRealTimeTranscription('Processing your voice message...');
      handleTranscribeAudio(recordedAudio);
    } else {
      console.log('❌ No media recorder or recorded audio available');
      setRealTimeTranscription('No audio recorded - please try again');
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

    // Stop audio level monitoring
    if ((window as any).stopAudioLevelMonitoring) {
      (window as any).stopAudioLevelMonitoring();
    }

    setAudioLevel(0);
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      // Add connection timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      setRealTimeTranscription('Processing your recording...');

      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503 || response.status === 502) {
          throw new Error('Speech service temporarily unavailable');
        } else if (response.status === 429) {
          throw new Error('Too many requests - please wait a moment');
        } else {
          throw new Error('Transcription service error');
        }
      }

      const data = await response.json();

      if (data.text && data.text.trim()) {
        setTranscribedText(data.text.trim());
        setRealTimeTranscription('');
      } else {
        setRealTimeTranscription('No clear speech detected - please try recording again');
      }
    } catch (error: any) {
      console.error('Transcription error:', error);

      if (error.name === 'AbortError') {
        setRealTimeTranscription('Transcription timeout - please try a shorter recording');
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        setRealTimeTranscription('Network connection issue - please check your internet connection and try again');
      } else {
        setRealTimeTranscription('Transcription service temporarily unavailable - please try again in a moment');
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const transcribeVoiceMessage = async (audioBlob: Blob) => {
    try {
      setRealTimeTranscription('Transcribing...');
      setIsTranscribing(true);

      // Create FormData for audio upload
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Send to transcription endpoint
      const response = await fetch('/api/speech/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const result = await response.json();

      if (result.text && result.text.trim()) {
        // Show transcribed text in modal for editing
        setTranscribedText(result.text.trim());
        setEditableTranscription(result.text.trim());
        setRealTimeTranscription('');
        setIsTranscribing(false);
      } else {
        setRealTimeTranscription('No speech detected. Please try again.');
        setIsTranscribing(false);
        setTimeout(() => setRealTimeTranscription(''), 2000);
      }

      } catch (error) {
      console.error('Transcription error:', error);
      setRealTimeTranscription('Transcription failed. Please try again.');
      setIsTranscribing(false);
      setTimeout(() => setRealTimeTranscription(''), 2000);
    }
  };

  const handleSendVoiceMessage = () => {
    const textToSend = editableTranscription || transcribedText;

    if (!textToSend?.trim()) {
      console.log('❌ No text to send');
      return;
    }

    // Don't set session storage here - let the navigation handle it

    // Close modal and trigger chat with the transcribed text
    setShowVoiceModal(false);
    setChatTriggered(true);

    // Reset video to beginning for chat sequence
    globalVideoState.resetForChatTransition();

    // Clear all voice recording state
    setRealTimeTranscription('');
    setTranscribedText('');
    setEditableTranscription('');
    setIsRecording(false);
    isRecordingRef.current = false;
    setWaveformData([]);
    setRecordingDuration(0);
    setIsTranscribing(false);

    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }

    // Send message through chat interface
    setTimeout(() => {
      if (chatInterfaceRef.current) {
        chatInterfaceRef.current.sendMessage(textToSend);

        // Scroll to chat section
        setTimeout(() => {
          const chatSection = document.querySelector('[data-chat-section]');
          if (chatSection) {
            chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    }, 100);
  };

  const handlePlayPauseRecording = () => {
    if (!audioElementRef.current || !recordedAudioUrl) return;

    if (isPlayingRecording) {
      audioElementRef.current.pause();
      setIsPlayingRecording(false);
    } else {
      audioElementRef.current.play();
      setIsPlayingRecording(true);
    }
  };

  const handleDeleteRecording = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setWaveformData([]);
    setRecordingDuration(0);
    setPlaybackPosition(0);
    setIsPlayingRecording(false);
  };

  // Set up Speech Recognition with enhanced configuration
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
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
    }
  }, []);

    const handleTranscribeAudio = async (audioBlob: Blob) => {
    console.log('🎯 Starting transcription...', {
      size: audioBlob.size,
      type: audioBlob.type
    });
    setIsTranscribing(true);

    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Create AbortController with proper cleanup
      controller = new AbortController();

      // Set timeout with proper error handling
      timeoutId = setTimeout(() => {
        if (controller && !controller.signal.aborted) {
          controller.abort();
        }
      }, 20000); // 20 second timeout

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
          throw new Error('Transcription service error: ' + response.status);
        }
      }

      const result = await response.json();

      if (result.text && result.text.trim()) {
        console.log('✅ Transcription successful:', result.text.trim());
        setTranscribedText(result.text.trim());
        setEditableTranscription(result.text.trim());
        setRealTimeTranscription(''); // Clear live transcription
        setIsTranscribing(false);

        // Show success message briefly
        setTimeout(() => {
          setRealTimeTranscription('');
        }, 500);
      } else {
        console.log('❌ No speech detected in response');
        setRealTimeTranscription('No clear speech detected - please try recording again');
        setTimeout(() => {
          setRealTimeTranscription('');
          setIsTranscribing(false);
        }, 3000);
      }
    } catch (error: any) {
      console.error('❌ Transcription error:', error);

      let errorMessage = 'Transcription failed - please try recording again';

      // Handle AbortError specifically
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        errorMessage = 'Request timed out - please try a shorter recording';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Network issue - please check your connection and try again';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Service timeout - please try again with a shorter recording';
      } else if (error.message?.includes('Audio format')) {
        errorMessage = 'Audio format issue - please try recording again';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setRealTimeTranscription(errorMessage);

      // Auto-clear error message after 4 seconds
      setTimeout(() => {
        setRealTimeTranscription('');
        setIsTranscribing(false);
      }, 4000);
    } finally {
      // Cleanup resources
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
    }
  };

  return (
    <div className="h-screen overflow-hidden relative">
      {/* Compass Loading Animation */}
      {showCompass && (
        <div className="fixed inset-0 z-50 flex
items-center justify-center bg-black">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                viewBox="0 0 24 24"
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))'
                }}
              >
                {/* Outer circle */}
                <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>

                {/* Cardinal direction marks */}
                <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 1L12 3" opacity="0.6"/>
                <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 21L12 23" opacity="0.6"/>
                <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M1 12L3 12" opacity="0.6"/>
                <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M21 12L23 12" opacity="0.6"/>

                {/* Center dot */}
                <circle cx="12" cy="12" r="1" fill="currentColor"/>

                {/* Spinning needle */}
                <g style={{
                  animation: 'spin 1.5s linear infinite',
                  transformOrigin: '12px 12px'
                }}>
                  <path 
                    fill="currentColor" 
                    d="M12 4L13 11L12 12L11 11Z"
                    opacity="0.9"
                  />
                  <path 
                    fill="currentColor" 
                    d="M12 20L11 13L12 12L13 13Z" 
                    opacity="0.5"
                  />
                </g>
              </svg>
            </div>
            <p className="text-white text-sm opacity-70" style={{fontFamily: 'Inter'}}>
              Loading your journey...
            </p>
          </div>
        </div>
      )}

      {/* OLD VIDEO SYSTEM REMOVED - Now using MultiVideoBackground for all states */}



      {/* Video Background System - Context Aware */}
      {/* Home Page: 5-video carousel with 8-second intervals */}
      {!chatTriggered && <HomePageVideoCarousel isActive={true} />}

      {/* Chat Page: 17-video carousel with full-length playback */}
      {chatTriggered && <ChatPageVideoCarousel isActive={true} />}

      {/* Header layered over content */}
      <header 
        className={(chatTriggered ? 'fixed top-0 left-0 right-0' : 'relative') + ' z-50 w-full py-4 transition-opacity duration-1000 ' + (showContent || chatTriggered ? 'opacity-100' : 'opacity-0')}
        style={{
          background: 'transparent',
          backdropFilter: 'none',
          borderBottom: 'none'
        }}
      >
        <div className="w-full" style={{ 
          paddingLeft: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          paddingRight: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          maxWidth: '100vw'
        }}>
          <div className="flex items-center justify-between h-20">
            {/* Left side - Logo and Sign in */}
            <div className="flex items-center" style={{ marginLeft: '0px' }}>
              {/* Logo - acts as Dashboard/Home button */}
              <button
                onClick={handleLogoClick}
                className="text-2xl font-bold italic transition-all duration-200 hover:opacity-80"
                style={{
                  color: 'white',
                  fontFamily: 'Playfair Display, serif',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  textDecoration: 'none',
                  marginLeft: '0px',
                  paddingLeft: '0px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#14B8A6';
                  e.currentTarget.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(20, 184, 166, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
                }}
              >
                WonderVoya
              </button>



            </div>

            {/* Right side - Navigation buttons with improved spacing */}
            <div className="flex items-center space-x-6">
              {/* My Itineraries Button */}
              <button
                onClick={() => navigateWithVideoState('home', '/itineraries')}
                className="inline-flex items-center justify-center px-4 py-2 border-2 rounded-lg font-medium text-sm transition-all duration-300 backdrop-blur-md"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  fontWeight: '500',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                My Itineraries
              </button>

              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-sm text-white opacity-90">Loading...</span>
                </div>
              ) : !isAuthenticated ? (
                <button
                onClick={() => handleAuthPopup('google')}
                disabled={isSigningIn}
                className="inline-flex items-center justify-center px-6 py-3 border-2 rounded-lg font-medium text-sm transition-all duration-300 backdrop-blur-md"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  fontFamily: 'Roboto, arial, sans-serif',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '200px',
                  height: '40px',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>



      {/* Hero Section - Only show when chat is NOT triggered and not loading */}
      {!chatTriggered && !chatLoading && (
        <section className="relative z-40 h-screen flex items-center justify-center" style={{marginTop: '-80px'}}>
          <div className={'w-full max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 text-center flex flex-col items-center justify-center h-full transition-all duration-1000 ' + (showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4')}>
          <h1 className="text-6xl md:text-8xl font-bold mb-16 italic text-white drop-shadow-lg" style={{fontFamily: 'Playfair Display, serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>
            WonderVoya
          </h1>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-8 w-full max-w-2xl justify-center">
            {/* Plan My Adventure Button */}
            <button
              onClick={() => setShowUniversalTemplate(true)}
              className="relative px-8 py-4 rounded-lg border-2 flex-1 max-w-sm transition-all duration-300 backdrop-blur-md"
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="text-center">
                <h3 
                  className="text-xl font-semibold italic text-white"
                  style={{
                    fontFamily: 'Playfair Display, serif',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                  }}
                >
                  Start Planning
                </h3>

              </div>
            </button>

            {/* Voice Recording Button */}
            <button
              onClick={handleVoiceRecording}
              className="relative px-8 py-4 rounded-lg border-2 flex-1 max-w-sm transition-all duration-300 backdrop-blur-md"
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="text-center flex flex-col items-center">
                {/* Enhanced Cosmic Microphone Icon */}
                <div className="relative mb-2">
                  <svg 
                    className={'w-8 h-8 ' + (isRecording ? 'animate-pulse' : '') + ' transition-all duration-300'}
                    fill="none"
                    stroke="white" 
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    style={{filter: 'drop-shadow(0 0 8px rgba(20, 184, 166, 0.6))'}}
                  >
                    {/* Microphone capsule */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"
                      fill={isRecording ? "#14B8A6" : "none"}
                      stroke={isRecording ? "#14B8A6" : "white"}
                    />
                    {/* Sound waves when recording */}
                    {isRecording && (
                      <>
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          d="M19 10v2a7 7 0 01-14 0v-2"
                          stroke="#14B8A6"
                          className="animate-pulse"
                        />
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          d="M21 8v8a9 9 0 01-18 0V8"
                          stroke="#7C3AED"
                          strokeWidth="1"
                          className="animate-pulse"
                          style={{animationDelay: '0.2s'}}
                        />
                      </>
                    )}
                    {/* Base stand */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M12 18v4m-4 0h8"
                      stroke="white"
                    />
                    {/* Connection arc */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M8 14a4 4 0 008 0"
                      stroke={isRecording ? "#14B8A6" : "white"}
                    />
                  </svg>

                  {/* Cosmic glow effect when recording */}
                  {isRecording && (
                    <div 
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{
                        background: 'radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, transparent 70%)',
                        transform: 'scale(1.5)'
                      }}
                    />
                  )}
                </div>

                <h3 
                  className="text-lg font-semibold italic text-white mb-1"
                  style={{
                    fontFamily: 'Playfair Display, serif',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                  }}
                >
                  Voice Input
                </h3>

                {isRecording ? (
                  <div className="flex items-center">
                    <div 
                      className="w-2 h-2 rounded-full mr-2 animate-pulse"
                      style={{backgroundColor: '#14B8A6'}}
                    />
                    <p className="text-sm text-white opacity-90" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.8)'}}>
                      Listening...
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-white opacity-75" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.8)'}}>
                    Speak your plans
                  </p>
                )}
              </div>
            </button>
          </div>
          </div>
        </section>
      )}

      {/* Chat Interface Section - Hidden until triggered */}
      {chatTriggered && (
        <section className="py-4" data-chat-section style={{marginTop: '1rem'}}>
          <StreamingChatInterface 
            ref={chatInterfaceRef}
            sessionId="test-session-123"
            onMessageReceived={handleChatMessageReceived}
            setLocation={setLocation}
          />
        </section>
      )}

      {/* Premium Sign In Dialog */}
      <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
        <DialogContent className="sm:max-w-md premium-card border border-gray-200">
          <DialogHeader>
            <DialogTitle className="font-semibold text-xl text-gray-800 flex items-center" style={{fontFamily: 'Playfair Display, serif'}}>
              <i className="fas fa-compass mr-3" style={{color: '#1E3A8A'}}></i>
              Welcome to WonderVoya
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">

              {isSigningIn ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600 mr-3"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}


            <p className="text-xs text-gray-500 text-center">
              Sign in to save your travel plans and preferences
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent Chats Dialog - Hidden for now */}

      {/* Universal Template Modal */}
      <Dialog open={showUniversalTemplate} onOpenChange={setShowUniversalTemplate}>
        <DialogContent
          className="sm:max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none animate-none"
          onPointerDownOutside={(e) => {
            if (showDatePicker) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (showDatePicker) e.preventDefault();
          }}
        >
          <div className="p-6">
            <DialogHeader>
              <DialogTitle 
                className="text-xl font-bold text-center mb-6 italic text-white"
                style={{fontFamily: 'Playfair Display, serif'}}
              >
                Plan Your Adventure
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="relative">
                <label className="block text-sm font-medium mb-2 text-slate-300" style={{fontFamily: 'Inter, sans-serif'}}>
                  Where are you going?
                </label>
                <input
                  type="text"
                  value={universalFormData.destination}
                  onChange={(e) => {
                    setUniversalFormData({...universalFormData, destination: e.target.value});
                    handleLocationSearch(e.target.value);
                  }}
                  placeholder="e.g., Paris, France"
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 bg-slate-800/70 backdrop-blur-md text-white placeholder:text-slate-400"
                  style={{
                    borderColor: universalFormData.destination ? '#14B8A6' : '#475569',
                    fontSize: '16px',
                    boxShadow: universalFormData.destination ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#14B8A6';
                    e.target.style.boxShadow = '0 0 0 3px rgba(20, 184, 166, 0.2)';
                    if (universalFormData.destination.length > 0) {
                      handleLocationSearch(universalFormData.destination);
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = universalFormData.destination ? '#14B8A6' : '#475569';
                    e.target.style.boxShadow = universalFormData.destination ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none';
                    // Delay hiding dropdown to allow for clicks
                    setTimeout(() => {
                      setShowLocationDropdown(false);
                    }, 150);
                  }}
                />

                {/* Location Autocomplete Dropdown */}
                {showLocationDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800/95 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {isLoadingLocations ? (
                      <div className="px-4 py-2 text-sm text-slate-400 flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--aurora-teal)] mr-2"></div>
                        Searching destinations...
                      </div>
                    ) : locationSuggestions.length > 0 ? (
                      locationSuggestions.map((location, index) => (
                        <button
                          key={index}
                          onClick={() => handleLocationSelect(location)}
                          className="w-full px-4 py-2 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-600/30 last:border-b-0"
                        >
                          <div className="font-medium text-sm text-white">
                            {location.destinationName || location.name}
                          </div>
                        </button>
                      ))
                    ) : universalFormData.destination.length > 2 ? (
                      <div className="px-4 py-2 text-sm text-slate-400">
                        No destinations found for "{universalFormData.destination}"
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-300" style={{fontFamily: 'Inter, sans-serif'}}>
                  When are you traveling?
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(true)}
                    className="w-full px-4 py-4 border-2 rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 bg-slate-800/70 backdrop-blur-md text-left flex items-center justify-between group hover:bg-slate-800/80 hover:border-teal-400/50"
                    style={{
                      borderColor: universalFormData.dates ? '#14B8A6' : '#475569',
                      fontSize: '16px',
                      color: universalFormData.dates ? '#ffffff' : '#94a3b8',
                      boxShadow: universalFormData.dates ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#14B8A6';
                      e.target.style.boxShadow = '0 0 0 3px rgba(20, 184, 166, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = universalFormData.dates ? '#14B8A6' : '#475569';
                      e.target.style.boxShadow = universalFormData.dates ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none';
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <Calendar className="h-5 w-5 text-teal-400 group-hover:text-teal-300 transition-colors" />
                      <span className="font-medium">
                        {universalFormData.dates || 'Select your travel dates'}
                      </span>
                    </div>
                    <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-slate-300 transition-all duration-200 group-hover:rotate-180" />
                  </button>

                  {/* Subtle gradient border effect */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-500/20 via-transparent to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10"></div>
                </div>

                {universalFormData.dates && (
                  <div className="mt-2 text-xs text-teal-300 flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3" />
                    <span>Dates selected</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300" style={{fontFamily: 'Inter, sans-serif'}}>
                  What interests you?
                </label>
                <input
                  type="text"
                  value={universalFormData.interests}
                  onChange={(e) => setUniversalFormData({...universalFormData, interests: e.target.value})}
                  placeholder="e.g., museums, local cuisine, outdoor activities"
                  className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 bg-slate-800/70 backdrop-blur-md text-white placeholder:text-slate-400"
                  style={{
                    borderColor: universalFormData.interests ? '#14B8A6' : '#475569',
                    fontSize: '16px',
                    boxShadow: universalFormData.interests ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#14B8A6';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 184, 166, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = universalFormData.interests ? '#14B8A6' : '#475569';
                    e.currentTarget.style.boxShadow = universalFormData.interests ? '0 0 0 1px rgba(20, 184, 166, 0.3)' : 'none';
                  }}
                />
              </div>



              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUniversalTemplate(false);
                    // Clear form data when cancelling
                    setUniversalFormData({
                      destination: '',
                      dates: '',
                      interests: ''
                    });
                    setSelectedDateRange({});
                  }}
                  className="flex-1 border-slate-600 text-slate-700 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUniversalTemplateSubmit}
                  disabled={!universalFormData.destination || !universalFormData.dates}
                  className="flex-1 bg-[var(--aurora-teal)] hover:bg-[var(--aurora-teal-dark)] text-slate-900 font-medium disabled:opacity-50"
                >
                  Start Planning
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhanced Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center p-4 z-[100] animate-fadeIn" style={{pointerEvents: 'auto'}}>
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-white/20 relative overflow-hidden">
            {/* Subtle gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50/50 via-white/50 to-blue-50/50 -z-10"></div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Select Travel Dates</h3>
                <p className="text-xs text-gray-600">Choose your travel dates</p>
              </div>
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all duration-200 hover:scale-105"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="mb-4">
              <DayPicker
                mode="range"
                selected={selectedDateRange.from ? { from: selectedDateRange.from, to: selectedDateRange.to } : undefined}
                onSelect={handleDateSelect}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                disabled={(date) => date < new Date()}
                showOutsideDays={true}
                className="rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm shadow-lg p-3"
                onDayClick={(day, modifiers) => {
                  console.log('📅 Day clicked:', day, 'modifiers:', modifiers);
                }}
                classNames={{
                  months: "flex flex-col sm:flex-row justify-center",
                  month: "space-y-4",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: "h-7 w-7 bg-transparent p-0 text-slate-500 hover:text-slate-900 cursor-pointer",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex",
                  head_cell: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
                  row: "flex w-full mt-2",
                  cell: "h-9 w-9 text-center text-sm p-0 relative cursor-pointer",
                  day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100 rounded-md cursor-pointer",
                  day_range_start: "day-range-start bg-teal-500 text-white hover:bg-teal-600",
                  day_range_end: "day-range-end bg-teal-500 text-white hover:bg-teal-600",
                  day_selected: "bg-teal-500 text-white hover:bg-teal-600 hover:text-white focus:bg-teal-600 focus:text-white",
                  day_today: "bg-blue-100 text-blue-900 font-bold",
                  day_outside: "text-slate-400 opacity-50",
                  day_disabled: "text-slate-400 opacity-50 cursor-not-allowed",
                  day_range_middle: "aria-selected:bg-teal-100 aria-selected:text-teal-900",
                  day_hidden: "invisible"
                }}
                components={{
                  IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                  IconRight: () => <ChevronRight className="h-4 w-4" />
                }}
              />
            </div>



            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowDatePicker(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  // Update the form data with selected dates
                  if (selectedDateRange?.from && selectedDateRange?.to) {
                    const dateString = format(selectedDateRange.from, 'MMM d, yyyy') + ' - ' + format(selectedDateRange.to, 'MMM d, yyyy');
                    setUniversalFormData({...universalFormData, dates: dateString});
                  } else if (selectedDateRange?.from) {
                    const dateString = format(selectedDateRange.from, 'MMM d, yyyy');
                    setUniversalFormData({...universalFormData, dates: dateString});
                  }
                  setShowDatePicker(false);
                  // Explicitly keep the Plan Adventure modal open
                  setShowUniversalTemplate(true);

                  // Prevent auto-focus on any field when returning to the modal
                  setTimeout(() => {
                    if (document.activeElement && document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                  }, 100);
                }}
                disabled={!selectedDateRange?.from}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-lg hover:from-teal-600 hover:to-blue-600 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-all duration-200 text-sm shadow-lg"
              >
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Confirm Dates</span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recording Modal */}
      <Dialog open={showVoiceModal} onOpenChange={(open) => {
        if (!open) {
          setShowVoiceModal(false);
          handleStopRecording();
          // Clean up all transcription state
          setRealTimeTranscription('');
          setTranscribedText('');
          setIsTranscribing(false);
        }
      }}>
        <DialogContent className="sm:max-w-md premium-card border border-gray-200 fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none animate-none">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle 
                className="text-xl font-bold text-center mb-6 italic"
                style={{color: '#1E3A8A', fontFamily: 'Playfair Display, serif'}}
              >
                Voice Message
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center space-y-6">
              {/* Enhanced Cosmic Microphone Display */}
              <div className="relative">
                <div 
                  className="w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500" 
                  style={{
                    background: isRecording 
                      ? 'radial-gradient(circle, #14B8A6 0%, #1E3A8A 70%)' 
                      : 'radial-gradient(circle, #1E3A8A 0%, #E5E7EB 70%)',
                    boxShadow: isRecording 
                      ? '0 0 30px rgba(20, 184, 166, 0.4), inset 0 0 20px rgba(255,255,255,0.1)' 
                      : '0 0 20px rgba(30, 58, 138, 0.3), inset 0 0 15px rgba(255,255,255,0.05)'
                  }}
                >
                  <svg 
                    className={'w-16 h-16 transition-all duration-300 ' + (isRecording ? 'scale-110' : '')}
                    fill="none"
                    stroke="white"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    {/* Microphone body */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"
                      fill={isRecording ? "#F8FAFC" : "none"}
                    />

                    {/* Audio waves when recording */}
                    {isRecording && (
                      <>
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          d="M19 10v2a7 7 0 01-14 0v-2"
                          stroke="#F8FAFC"
                          className="animate-pulse"
                        />
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          d="M21 8v8a9 9 0 01-18 0V8"
                          stroke="#7C3AED"
                          strokeWidth="1"
                          className="animate-pulse"
                          style={{animationDelay: '0.3s'}}
                        />
                      </>
                    )}

                    {/* Stand */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M12 18v4m-4 0h8"
                      stroke="white"
                    />

                    {/* Connection */}
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M8 14a4 4 0 008 0"
                      stroke="white"
                    />
                  </svg>
                </div>

                {/* Cosmic energy rings when recording */}
                {isRecording && (
                  <>
                    <div 
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{
                        background: 'radial-gradient(circle, rgba(20, 184, 166, 0.3) 0%, transparent 70%)',
                        transform: 'scale(1.3)',
                        animationDuration: '2s'
                      }}
                    />
                    <div 
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{
                        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.2) 0%, transparent 70%)',
                        transform: 'scale(1.5)',
                        animationDuration: '3s',
                        animationDelay: '0.5s'
                      }}
                    />
                  </>
                )}
              </div>

              {/* Recording Status */}
              <div className="text-center">
                {isRecording ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full animate-pulse"
                      style={{backgroundColor: '#14B8A6'}}
                    />
                    <p className="text-lg font-medium" style={{color: '#1E3A8A', fontFamily: 'Inter, sans-serif'}}>
                      Listening...
                    </p>
                  </div>
                ) : transcribedText ? (
                  <p className="text-lg font-medium" style={{color: '#14B8A6', fontFamily: 'Inter, sans-serif'}}>
                    Ready to send
                  </p>
                ) : (
                  <p className="text-lg font-medium" style={{color: '#1E3A8A', fontFamily: 'Inter, sans-serif'}}>
                    Ready to record
                  </p>
                )}
              </div>

              {/* Apple Messages-style Waveform Display */}
              {(isRecording || recordedAudioUrl || waveformData.length > 0) && (
                <div className="w-full p-6 rounded-lg border-2" style={{
                  backgroundColor: '#F8FAFC',
                  borderColor: isRecording ? '#14B8A6' : recordedAudioUrl ? '#14B8A6' : '#E5E7EB',
                  minHeight: '120px',
                  transition: 'all 0.3s ease',
                  boxShadow: (isRecording || recordedAudioUrl) ? '0 0 20px rgba(20, 184, 166, 0.1)' : '0 0 10px rgba(30, 58, 138, 0.05)'
                }}>
                  {(isRecording || recordedAudioUrl) && (
                    <div className="flex justify-end mb-4">
                      <div className="text-sm" style={{color: '#1E3A8A', fontFamily: 'Inter, sans-serif'}}>
                        {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                  )}

                  {/* Waveform Visualization - Fixed Size Container */}
                  <div className="relative overflow-hidden mb-4" style={{height: '60px', width: '100%'}}>
                    <div 
                      className="flex items-center space-x-1 absolute transition-transform duration-100"
                      style={{
                        height: '60px',
                        transform: waveformData.length > 50 ? 'translateX(-' + (waveformData.length - 50) * 4 + 'px)' : 'translateX(0)',
                        width: Math.max(waveformData.length * 4, 200) + 'px'
                      }}
                    >
                      {waveformData.length > 0 ? (
                        waveformData.map((level, index) => (
                          <div
                            key={index}
                            className="rounded-full flex-shrink-0"
                            style={{
                              width: '3px',
                              height: Math.max(4, level * 50) + 'px',
                              backgroundColor: isRecording ? '#14B8A6' : '#1E3A8A',
                              opacity: recordedAudioUrl && isPlayingRecording && index <= playbackPosition ? 1 : 0.7
                            }}
                          />
                        ))
                      ) : (
                        // Default centered waveform bars when not recording
                        <div className="flex items-center justify-center space-x-1 w-full h-full">
                          {Array.from({length: 50}).map((_, index) => (
                            <div
                              key={index}
                              className="rounded-full flex-shrink-0"
                              style={{
                                width: '3px',
                                height: '4px',
                                backgroundColor: '#E5E7EB'
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Playback Controls for Recorded Audio */}
                  {recordedAudioUrl && (
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        onClick={handlePlayPauseRecording}
                        className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                        style={{backgroundColor: '#1E3A8A'}}
                      >
                        <i className={'fas ' + (isPlayingRecording ? 'fa-pause' : 'fa-play') + ' text-white text-sm'} />
                      </button>
                      <button
                        onClick={handleDeleteRecording}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                        style={{backgroundColor: '#dc2626'}}
                      >
                        <i className="fas fa-trash text-white text-xs" />
                      </button>
                    </div>
                  )}

                  {/* Hidden audio element for playback */}
                  {recordedAudioUrl && (
                    <audio
                      ref={audioElementRef}
                      src={recordedAudioUrl}
                      onEnded={() => {
                        setIsPlayingRecording(false);
                        setPlaybackPosition(0);
                      }}
                      onTimeUpdate={(e) => {
                        const audio = e.target as HTMLAudioElement;
                        const progress = (audio.currentTime / audio.duration) * waveformData.length;
                        setPlaybackPosition(Math.floor(progress));
                      }}
                    />
                  )}
                </div>
              )}

              {/* Transcription Results Display */}
              {transcribedText && (
                <div className="w-full">
                  <textarea
                    value={editableTranscription || transcribedText}
                    onChange={(e) => setEditableTranscription(e.target.value)}
                    className="w-full p-4 border-2 rounded-lg resize-none focus:outline-none focus:ring-2 transition-all"
                    rows={4}
                    placeholder="Your message will appear here..."
                    style={{
                      fontSize: '16px',
                      fontFamily: 'Inter, sans-serif',
                      borderColor: '#14B8A6',
                      backgroundColor: '#F8FAFC',
                      cursor: 'text'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#14B8A6';
                      e.target.style.boxShadow = '0 0 0 2px rgba(20, 184, 166, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#14B8A6';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              )}

              {/* Real-time transcription display (when recording) */}
              {realTimeTranscription && !transcribedText && !realTimeTranscription.toLowerCase().includes('recording') && (
                <div className="w-full p-4 rounded-lg border-2" style={{
                  backgroundColor: '#F8FAFC',
                  borderColor: isRecording ? '#14B8A6' : '#E5E7EB'
                }}>
                  <p className="text-gray-600 italic text-center" style={{fontFamily: 'Inter, sans-serif'}}>
                    {realTimeTranscription}
                  </p>
                </div>
              )}

              {/* Control Buttons */}
              <div className="flex space-x-3 mt-6">
                {transcribedText && !isTranscribing ? (
                  <>
                    <Button
                      onClick={() => {
                        setShowVoiceModal(false);
                        setRealTimeTranscription('');
                        setTranscribedText('');
                        setEditableTranscription('');
                        setWaveformData([]);
                        setRecordingDuration(0);
                        setIsTranscribing(false);
                        if (recordedAudioUrl) {
                          URL.revokeObjectURL(recordedAudioUrl);
                          setRecordedAudioUrl(null);
                        }
                      }}
                      variant="outline"
                      className="flex-1"
                      style={{
                        borderColor: '#E5E7EB',
                        color: '#6B7280'
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSendVoiceMessage}
                      className="flex-1 text-white hover:shadow-lg transition-all duration-200"
                      style={{
                        backgroundColor: '#1E3A8A',
                        borderColor: '#1E3A8A'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1E40AF';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(30, 58, 138, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1E3A8A';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <span className="font-medium">Send Message</span>
                    </Button>
                  </>
                ) : recordedAudioUrl && !isTranscribing && !transcribedText ? (
                  <>
                    <Button
                      onClick={() => {
                        setShowVoiceModal(false);
                        setRealTimeTranscription('');
                        setTranscribedText('');
                        setEditableTranscription('');
                        setWaveformData([]);
                        setRecordingDuration(0);
                        setIsTranscribing(false);
                        if (recordedAudioUrl) {
                          URL.revokeObjectURL(recordedAudioUrl);
                          setRecordedAudioUrl(null);
                        }
                      }}
                      variant="outline"
                      className="flex-1"
                      style={{
                        borderColor: '#E5E7EB',
                        color: '#6B7280'
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const audioBlob = recordedAudio;
                        if (audioBlob) {
                          setRealTimeTranscription('');
                          transcribeVoiceMessage(audioBlob);
                        }
                      }}
                      className="flex-1 text-white hover:shadow-lg transition-all duration-200"
                      style={{
                        backgroundColor: '#1E3A8A',
                        borderColor: '#1E3A8A'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#1E40AF';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(30, 58, 138, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1E3A8A';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <span className="font-medium">Transcribe</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => {
                        setShowVoiceModal(false);
                        if (isRecording) {
                          handleStopRecording();
                        }
                        setWaveformData([]);
                        setRecordingDuration(0);
                        setRealTimeTranscription('');
                        setTranscribedText('');
                        setIsTranscribing(false);
                      }}
                      variant="outline"
                      disabled={isTranscribing}
                      style={{
                        borderColor: '#E5E7EB',
                        color: '#6B7280'
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      disabled={isTranscribing}
                      className="flex-1 text-white hover:shadow-lg transition-all duration-200"
                      style={{
                        backgroundColor: isRecording ? '#dc2626' : isTranscribing ? '#6B7280' : '#1E3A8A',
                        borderColor: isRecording ? '#dc2626' : isTranscribing ? '#6B7280' : '#1E3A8A'
                      }}
                      onMouseEnter={(e) => {
                        if (!isTranscribing) {
                          if (isRecording) {
                            e.currentTarget.style.backgroundColor = '#b91c1c';
                            e.currentTarget.style.boxShadow = '0 0 20px rgba(220, 38, 38, 0.4)';
                          } else {
                            e.currentTarget.style.backgroundColor = '#1E40AF';
                            e.currentTarget.style.boxShadow = '0 0 20px rgba(30, 58, 138, 0.4)';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isTranscribing) {
                          if (isRecording) {
                            e.currentTarget.style.backgroundColor = '#dc2626';
                          } else {
                            e.currentTarget.style.backgroundColor = '#1E3A8A';
                          }
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                    >
                      {isTranscribing ? 'Processing...' : isRecording ? 'Stop' : 'Record'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Itinerary Modal - positioned over activity panel without background */}
      {showItineraryModal && selectedActivity && (
        <div 
          className="fixed right-0 top-0 h-full w-[40vw] z-[9999] flex items-center justify-center p-4"
          onClick={(e) => {
            // Close modal when clicking the overlay
            if (e.target === e.currentTarget) {
              setShowItineraryModal(false);
              setSelectedActivity(null);
            }
          }}
        >
          <ItineraryManager
            activity={selectedActivity}
            isOpen={showItineraryModal}
            sessionId={currentSessionId}
            onClose={() => {
              setShowItineraryModal(false);
              setSelectedActivity(null);
            }}
          />
        </div>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black text-white text-xs p-2 rounded opacity-50 pointer-events-none z-50">
          Modal: {showItineraryModal ? 'OPEN' : 'CLOSED'} | Activity: {selectedActivity?.title || 'NONE'}
          <br/>
          ItineraryManager: {showItineraryModal && selectedActivity ? 'SHOULD RENDER' : 'NOT RENDERING'}
        </div>
      )}

      {/* Activity Detail Modal */}
      {showActivityDetailModal && activityForDetail && (
        <ActivityDetailModal
          activity={activityForDetail}
          isOpen={showActivityDetailModal}
          onClose={() => {
            setShowActivityDetailModal(false);
            setActivityForDetail(null);
          }}
        />
      )}

      {/* Recent Chats Modal - Hidden for now */}
    </div>
  );
}