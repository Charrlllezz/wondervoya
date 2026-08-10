import { useParams, useLocation } from 'wouter';
import { ChatInterface } from '../components/chat-interface';
import { useAuth } from '../hooks/useAuth';
import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { AlignmentDebugger } from '../components/alignment-debugger';
import { ChatPageVideoCarousel } from '../components/chat-page-video-carousel';
import { globalVideoState } from '../lib/global-video-state';
import { navigateWithRouterAndVideoState } from '../lib/navigation';

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [, setLocation] = useLocation();
  const chatInterfaceRef = useRef<any>(null);
  const { user, isAuthenticated, isLoading } = useAuth();

  // Handle video state and track page navigation
  useEffect(() => {
    const previousPage = sessionStorage.getItem('currentPage');
    console.log(`🎬 Chat page: Previous page was '${previousPage}'`);
    console.log(`🎬 Chat page: Session storage debug:`, {
      currentPage: sessionStorage.getItem('currentPage'),
      length: sessionStorage.length
    });
    
    // Maintain video state when coming from itinerary page
    if (previousPage === 'itinerary') {
      console.log('🎬 Maintaining video state on navigation from itinerary to chat');
      globalVideoState.maintainStateOnNavigation();
    } else if (previousPage === 'chat') {
      // If coming from chat page (hot reload), don't change video state
      console.log('🎬 Chat page hot reload - maintaining current video state');
    } else if (previousPage && previousPage !== 'home') {
      // If coming from any other non-home page, maintain video state
      console.log(`🎬 Maintaining video state on navigation from ${previousPage} to chat`);
      globalVideoState.maintainStateOnNavigation();
    } else {
      // If coming from home page or first visit, reset video
      console.log('🎬 Chat page mounted - resetting video state for chat transition');
      globalVideoState.resetForChatTransition();
    }

    // Set current page after video logic to ensure proper tracking for next navigation
    sessionStorage.setItem('currentPage', 'chat');
    console.log(`🎬 Chat page: Set current page to 'chat'`);
    console.log(`🎬 Chat page: Session storage after setting to chat:`, sessionStorage.getItem('currentPage'));

    if (conversationId && chatInterfaceRef.current) {
      console.log('Loading conversation:', conversationId);
      chatInterfaceRef.current.loadConversation(conversationId);
    }
  }, [conversationId]);

  return (
    <div className="h-screen relative overflow-hidden" style={{ background: 'black' }}>
      {/* Video Background - Chat Page Carousel - Immediate visibility */}
      <ChatPageVideoCarousel isActive={true} />

      {/* Dark overlay for video background */}
      <div className="fixed inset-0 bg-black/30 pointer-events-none z-20" />

      {/* Header - Fixed positioning */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-black/20 via-black/10 to-black/20 backdrop-blur-sm border-b border-white/10 p-3 h-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-full">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigateWithRouterAndVideoState('chat', setLocation, '/')}
              className="text-deep-wine hover:bg-antique-gold/20 hover:text-deep-wine border border-antique-gold/30 hover:border-deep-wine transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to <em>WonderVoya</em>
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => {
                console.log('🎬🎬🎬 BUTTON CLICKED: View Itineraries button clicked! 🎬🎬🎬');
                console.log('🎬 Chat: Current global video index:', globalVideoState.getCurrentIndex());
                console.log('🎬 Chat: Session storage before navigation:', sessionStorage.getItem('currentPage'));
                console.log('🎬 Chat: All session storage keys:', Object.keys(sessionStorage));
                console.log('🎬 Chat: About to call navigateWithRouterAndVideoState');
                navigateWithRouterAndVideoState('chat', setLocation, '/itineraries');
                console.log('🎬 Chat: navigateWithRouterAndVideoState called');
              }}
              className="text-deep-wine hover:bg-antique-gold/20 hover:text-deep-wine border border-antique-gold/30 hover:border-deep-wine transition-all duration-200"
            >
              View Itineraries
            </Button>
            <div>
              <h1 className="font-playfair text-2xl font-bold text-deep-wine">
                <em>Travel Planning Chat</em>
              </h1>
              {conversationId && (
                <p className="text-warm-taupe text-sm">
                  Continuing conversation {conversationId.slice(-8)}...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="relative pt-20 z-40">
        <ChatInterface ref={chatInterfaceRef} />

        {/* Alignment Debugger - Enable in development */}
        <AlignmentDebugger enabled={false} />
      </div>
    </div>
  );
}