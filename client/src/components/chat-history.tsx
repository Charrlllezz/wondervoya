import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
}

interface ChatHistoryProps {
  onLoadConversation: (conversationId: string) => void;
}

export function ChatHistory({ onLoadConversation }: ChatHistoryProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const history = JSON.parse(localStorage.getItem('conversationHistory') || '[]');
      setConversations(history);
    }
  }, [isOpen]);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleLoadConversation = (conversationId: string) => {
    onLoadConversation(conversationId);
    setIsOpen(false);
  };

  const clearHistory = () => {
    localStorage.removeItem('conversationHistory');
    setConversations([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="text-orange-600 hover:text-orange-700 transition-colors" title="Adventure Log">
          <i className="fas fa-book-open text-sm"></i>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" style={{backgroundColor: '#F7F3E8', borderColor: '#9B8B7A'}}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-xl" style={{color: '#722F37', fontFamily: 'Playfair Display, serif'}}>
            <div className="flex items-center">
              <i className="fas fa-history mr-2" style={{color: '#C9A876'}}></i>
              Recent Conversations
            </div>
            {conversations.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearHistory}
                className="text-xs hover:bg-transparent"
                style={{color: '#9B8B7A'}}
                onMouseEnter={(e) => e.currentTarget.style.color = '#722F37'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9B8B7A'}
              >
                Clear All
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-80 overflow-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-8">
              <i className="fas fa-clock text-3xl mb-4 opacity-50" style={{color: '#C9A876'}}></i>
              <p className="font-medium mb-2" style={{color: '#722F37', fontFamily: 'Playfair Display, serif'}}>No conversations yet</p>
              <p className="text-sm" style={{color: '#9B8B7A'}}>Start your first conversation to see it here!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleLoadConversation(conv.id)}
                  className="p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md"
                  style={{
                    backgroundColor: 'white',
                    borderColor: '#9B8B7A',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#C9A876';
                    e.currentTarget.style.backgroundColor = '#F7F3E8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#9B8B7A';
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm flex-1 pr-2 leading-tight" style={{color: '#722F37', fontFamily: 'Playfair Display, serif'}}>
                      {conv.title}
                    </h4>
                    <span className="text-xs flex-shrink-0" style={{color: '#9B8B7A'}}>
                      {formatDate(conv.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs mb-2 line-clamp-2 leading-relaxed" style={{color: '#9B8B7A'}}>
                    {conv.lastMessage}
                  </p>
                  <div className="flex items-center text-xs" style={{color: '#C9A876'}}>
                    <i className="fas fa-message mr-1"></i>
                    {conv.messageCount} messages
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}