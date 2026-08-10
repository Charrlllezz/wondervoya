import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AuthPrompt } from "@/components/auth-prompt";
import Home from "@/pages/home";
import Chat from "@/pages/chat";
import Itineraries from "@/pages/itineraries";
import ItineraryDetail from "@/pages/itinerary-detail-final";
import SharedItinerary from "@/pages/shared-itinerary";
import EnhancedDemo from "@/pages/enhanced-demo";
import NotFound from "@/pages/not-found";
import LoginFailed from "@/pages/login-failed";

function Router() {
  const { needsAuth, isLoading, signInAsGuest } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg mb-6 mx-auto animate-pulse">
              <i className="fas fa-globe-americas text-white text-xl"></i>
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-center animate-bounce">
              <i className="fas fa-plane text-white text-xs"></i>
            </div>
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 bg-clip-text text-transparent mb-2">WonderVoya</h2>
          <p className="text-gray-600 text-sm">Loading your travel companion...</p>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <AuthPrompt 
        onSignIn={() => window.location.href = '/api/auth/google'}
        onSkip={signInAsGuest}
      />
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chat/:conversationId" component={Chat} />
      <Route path="/itineraries" component={Itineraries} />
      <Route path="/itinerary/:id" component={ItineraryDetail} />
      <Route path="/shared/:shareToken" component={SharedItinerary} />
      <Route path="/enhanced-demo" component={EnhancedDemo} />
      <Route path="/login-failed" component={LoginFailed} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
