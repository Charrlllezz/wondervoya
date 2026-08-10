import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../hooks/useAuth';
import { User, LogIn } from 'lucide-react';

interface EnhancedShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: {
    id: string;
    title: string;
    destination: string;
    activities: Array<{ activityData: { title: string; price?: { amount: number } | null } }>;
  };
}

export function EnhancedShareModal({ isOpen, onClose, itinerary }: EnhancedShareModalProps) {
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  const generateShareText = () => {
    const activityCount = itinerary.activities.length;
    const totalCost = itinerary.activities.reduce((sum, activity) => 
      sum + (activity.activityData.price?.amount || 0), 0);
    
    return `Check out my ${itinerary.destination} trip itinerary! ${activityCount} amazing activities planned${totalCost > 0 ? ` (estimated $${totalCost.toFixed(2)})` : ''}. View details: ${window.location.href}`;
  };

  const shareViaPlatform = (platform: string) => {
    const shareText = generateShareText();
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(window.location.href);
    
    let shareUrl = '';
    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodedText}`;
        break;
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
        break;
      case 'instagram':
        navigator.clipboard.writeText(shareText);
        toast({
          title: "Copied to clipboard!",
          description: "Share this text on Instagram Stories or posts.",
        });
        return;
      case 'sms':
        if (phoneNumber) {
          shareUrl = `sms:${phoneNumber}?body=${encodedText}`;
        } else {
          shareUrl = `sms:?body=${encodedText}`;
        }
        break;
      case 'copy':
        navigator.clipboard.writeText(shareText);
        toast({
          title: "Link copied!",
          description: "Share link has been copied to clipboard.",
        });
        return;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank');
    }
  };

  const handleEmailShare = async () => {
    if (!shareEmail) {
      toast({
        title: "Email required",
        description: "Please enter an email address to share.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/itineraries/${itinerary.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: shareEmail, 
          message: shareMessage || generateShareText() 
        }),
      });
      
      if (!response.ok) throw new Error('Failed to share itinerary');
      
      toast({
        title: "Itinerary shared!",
        description: `Shared successfully with ${shareEmail}`,
      });
      
      setShareEmail('');
      setShareMessage('');
      onClose();
    } catch (error) {
      toast({
        title: "Share failed",
        description: "Could not share itinerary. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Show account creation prompt if user is not authenticated
  if (!isLoading && !isAuthenticated) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Account to Share</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Save and Share Your Itineraries
              </h3>
              <p className="text-gray-600 text-sm">
                Create a free account to save your itineraries, share them with friends, and access them from any device.
              </p>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => {
                  window.location.href = '/api/login';
                }}
                className="w-full"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Create Account / Sign In
              </Button>
              
              <Button 
                variant="outline" 
                onClick={onClose}
                className="w-full"
              >
                Maybe Later
              </Button>
            </div>

            <div className="text-xs text-gray-500">
              Your itinerary will be saved automatically once you create an account.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Your Itinerary</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Quick Share Platforms */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Share</h4>
            <div className="grid grid-cols-4 gap-3">
              <button
                onClick={() => shareViaPlatform('whatsapp')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fab fa-whatsapp text-green-500 text-xl mb-1"></i>
                <span className="text-xs">WhatsApp</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('telegram')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fab fa-telegram text-blue-500 text-xl mb-1"></i>
                <span className="text-xs">Telegram</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('facebook')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fab fa-facebook text-blue-600 text-xl mb-1"></i>
                <span className="text-xs">Facebook</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('twitter')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fab fa-twitter text-blue-400 text-xl mb-1"></i>
                <span className="text-xs">Twitter</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('instagram')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fab fa-instagram text-pink-500 text-xl mb-1"></i>
                <span className="text-xs">Instagram</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('sms')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fas fa-sms text-gray-600 text-xl mb-1"></i>
                <span className="text-xs">SMS</span>
              </button>
              
              <button
                onClick={() => shareViaPlatform('copy')}
                className="flex flex-col items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <i className="fas fa-copy text-gray-600 text-xl mb-1"></i>
                <span className="text-xs">Copy Link</span>
              </button>
            </div>
          </div>

          {/* SMS with Phone Number */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Send SMS</h4>
            <div className="flex space-x-2">
              <Input
                placeholder="Phone number (optional)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => shareViaPlatform('sms')}
                variant="outline"
                size="sm"
              >
                Send SMS
              </Button>
            </div>
          </div>

          {/* Email Share */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Share via Email</h4>
            <div className="space-y-3">
              <Input
                placeholder="Recipient email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                type="email"
              />
              <Textarea
                placeholder="Add a personal message (optional)"
                value={shareMessage}
                onChange={(e) => setShareMessage(e.target.value)}
                rows={3}
              />
              <Button onClick={handleEmailShare} className="w-full">
                Share via Email
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}