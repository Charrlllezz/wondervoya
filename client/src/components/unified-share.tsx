import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Share2, Copy, Users, Mail, Smartphone, Link, 
  MessageCircle, Send, Globe, Lock, ExternalLink 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface UnifiedShareProps {
  type: 'activity' | 'itinerary';
  title: string;
  data: {
    id?: string;
    url?: string;
    description?: string;
    price?: string;
    location?: string;
  };
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function UnifiedShare({ type, title, data, className, variant = "outline" }: UnifiedShareProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Prepare share content based on type
  const shareContent = {
    title: type === 'activity' 
      ? `Check out this activity: ${title}`
      : `Check out my trip: ${title}`,
    text: type === 'activity'
      ? `I found this amazing activity: ${title}${data.location ? ` in ${data.location}` : ''}${data.price ? ` - ${data.price} per person` : ''}`
      : `I'm planning an amazing trip! Take a look at my ${title} itinerary and let me know what you think.`,
    url: data.url || window.location.href
  };

  // Check if native sharing is available
  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  // Handle native sharing
  const handleNativeShare = async () => {
    setIsSharing(true);
    try {
      if (hasNativeShare) {
        await navigator.share(shareContent);
        toast({
          title: "Shared successfully!",
          description: `Your ${type} has been shared.`
        });
      } else {
        await navigator.clipboard.writeText(shareContent.url);
        toast({
          title: "Link copied!",
          description: "Share link copied to clipboard."
        });
      }
      setIsOpen(false);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast({
          title: "Sharing failed",
          description: "Could not share. Link copied to clipboard instead.",
          variant: "destructive"
        });
        try {
          await navigator.clipboard.writeText(shareContent.url);
        } catch (clipboardError) {
          console.error('Clipboard fallback failed:', clipboardError);
        }
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Create shareable link (for itineraries)
  const createShareMutation = useMutation({
    mutationFn: async () => {
      if (type === 'itinerary' && data.id) {
        return await apiRequest(`/api/itineraries/${data.id}/share`, {
          method: 'POST',
          body: JSON.stringify({ shareType: 'link' })
        });
      }
      return { shareUrl: shareContent.url };
    },
    onSuccess: (response: any) => {
      setShareUrl(response.shareUrl || shareContent.url);
      toast({
        title: "Share link created!",
        description: "You can now share this link with anyone."
      });
    }
  });

  // Add collaborator (for itineraries)
  const addCollaboratorMutation = useMutation({
    mutationFn: async (email: string) => {
      if (type === 'itinerary' && data.id) {
        return await apiRequest(`/api/itineraries/${data.id}/collaborators`, {
          method: 'POST',
          body: JSON.stringify({ email, role: 'viewer' })
        });
      }
      throw new Error('Collaboration only available for itineraries');
    },
    onSuccess: () => {
      toast({
        title: "Invitation sent!",
        description: `Invitation sent to ${collaboratorEmail}`
      });
      setCollaboratorEmail('');
    }
  });

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Link copied to clipboard"
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually",
        variant: "destructive"
      });
    }
  };



  // Generate social media share URLs
  const getSocialShareUrls = () => {
    const encodedText = encodeURIComponent(shareContent.text);
    const encodedUrl = encodeURIComponent(shareContent.url);
    
    return {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    };
  };

  const socialUrls = getSocialShareUrls();

  // Handle authentication popup
  const handleAuthPopup = (provider: 'google' | 'apple') => {
    setIsSigningIn(true);
    const popup = window.open(`/api/auth/${provider}`, 'oauth', 'width=500,height=600');
    
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setIsSigningIn(false);
        setShowAuthDialog(false);
        window.location.reload();
      }
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share {type === 'activity' ? 'Activity' : 'Trip'}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="instant" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instant" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Instant
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Link
            </TabsTrigger>
            {type === 'itinerary' && (
              <TabsTrigger value="collaborate" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Collaborate
              </TabsTrigger>
            )}
          </TabsList>
          
          {/* Instant Share Tab */}
          <TabsContent value="instant" className="space-y-4">
            <div className="text-center space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  {shareContent.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {shareContent.text}
                </p>
              </div>
              
              {hasNativeShare ? (
                <Button 
                  onClick={handleNativeShare}
                  disabled={isSharing}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isSharing ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 border-b-2 border-current rounded-full"></div>
                      Sharing...
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-4 w-4 mr-2" />
                      Share to Any App
                    </>
                  )}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Choose where to share:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'WhatsApp', url: socialUrls.whatsapp, icon: MessageCircle, color: 'bg-green-500' },
                      { name: 'Twitter', url: socialUrls.twitter, icon: Send, color: 'bg-blue-400' },
                      { name: 'Facebook', url: socialUrls.facebook, icon: Globe, color: 'bg-blue-600' },
                      { name: 'LinkedIn', url: socialUrls.linkedin, icon: Users, color: 'bg-blue-700' },
                    ].map((platform) => (
                      <Button
                        key={platform.name}
                        onClick={() => window.open(platform.url, '_blank')}
                        variant="outline"
                        className="flex items-center gap-2 justify-start"
                      >
                        <platform.icon className="h-4 w-4" />
                        {platform.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          {/* Link Share Tab */}
          <TabsContent value="link" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Shareable Link</Label>
                <Badge variant="secondary" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Public
                </Badge>
              </div>
              
              {type === 'itinerary' && isAuthenticated ? (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => createShareMutation.mutate()}
                    disabled={createShareMutation.isPending}
                    variant="outline"
                  >
                    {createShareMutation.isPending ? "Creating..." : "Create Link"}
                  </Button>
                  {shareUrl && (
                    <div className="flex gap-2 flex-1">
                      <Input value={shareUrl} readOnly className="text-sm" />
                      <Button 
                        size="sm" 
                        onClick={() => copyToClipboard(shareUrl)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input value={shareContent.url} readOnly className="text-sm" />
                  <Button 
                    size="sm" 
                    onClick={() => copyToClipboard(shareContent.url)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <p className="text-xs text-gray-500">
                Anyone with this link can view your {type}
              </p>
            </div>
          </TabsContent>
          
          {/* Collaboration Tab (Itineraries Only) */}
          {type === 'itinerary' && (
            <TabsContent value="collaborate" className="space-y-4">
              {isAuthenticated ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Invite Collaborators</Label>
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Private
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        value={collaboratorEmail}
                        onChange={(e) => setCollaboratorEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        onClick={() => addCollaboratorMutation.mutate(collaboratorEmail)}
                        disabled={!collaboratorEmail || addCollaboratorMutation.isPending}
                        size="sm"
                      >
                        {addCollaboratorMutation.isPending ? "Sending..." : "Invite"}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Collaborators can suggest activities and leave comments
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900">Sign in to Collaborate</h3>
                    <p className="text-sm text-gray-600">
                      Create an account to invite friends and collaborate on trip planning
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Button 
                      onClick={() => setShowAuthDialog(true)}
                      className="w-full"
                    >
                      Sign In
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>

      {/* Sign In Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
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
    </Dialog>
  );
}