import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AuthPromptProps {
  onSignIn: () => void;
  onSkip: () => void;
}

export function AuthPrompt({ onSignIn, onSkip }: AuthPromptProps) {
  const [showSignInDialog, setShowSignInDialog] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleAuthPopup = (provider: 'google' | 'apple') => {
    setIsSigningIn(true);
    const popup = window.open(`/api/auth/${provider}`, 'oauth', 'width=500,height=600');
    
    // Listen for popup completion
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setIsSigningIn(false);
        setShowSignInDialog(false);
        // Refresh the page to update auth state
        window.location.reload();
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Welcome to WonderVoya
          </CardTitle>
          <p className="text-gray-600 mt-2">
            Your AI-powered travel planning companion
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Sign In Option */}
          <div className="space-y-3">
            <Button 
              onClick={() => setShowSignInDialog(true)}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 py-3 font-medium shadow-sm"
              size="lg"
              style={{
                fontFamily: 'Roboto, Arial, sans-serif',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
            
            <div className="text-center">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Full Features Available
              </Badge>
            </div>
            
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Save and manage unlimited itineraries</li>
              <li>• Access your trips from any device</li>
              <li>• Share itineraries with friends</li>
              <li>• Voice input and advanced features</li>
            </ul>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or</span>
            </div>
          </div>

          {/* Skip Option */}
          <div className="space-y-3">
            <Button 
              onClick={onSkip}
              variant="outline"
              className="w-full py-3"
              size="lg"
            >
              Continue as Guest
            </Button>
            
            <div className="text-center">
              <Badge variant="outline" className="border-orange-300 text-orange-700">
                Limited Features
              </Badge>
            </div>
            
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Chat and get travel recommendations</li>
              <li>• View activity details and pricing</li>
              <li>• No itinerary saving (session only)</li>
              <li>• Limited to current browser session</li>
            </ul>
          </div>

          <div className="text-xs text-gray-500 text-center mt-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </CardContent>
      </Card>

      {/* Sign In Dialog */}
      <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to your account</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Button 
              onClick={() => handleAuthPopup('google')}
              disabled={isSigningIn}
              className="w-full border-2 py-3 font-medium transition-all duration-300 hover:shadow-lg"
              size="lg"
              style={{
                backgroundColor: '#F7F3E8',
                borderColor: '#9B8B7A',
                color: '#3c4043',
                fontFamily: 'Roboto, Arial, sans-serif',
                fontSize: '14px',
                fontWeight: '500'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.borderColor = '#C9A876';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F7F3E8';
                e.currentTarget.style.borderColor = '#9B8B7A';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isSigningIn ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-transparent rounded-full mr-2"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}