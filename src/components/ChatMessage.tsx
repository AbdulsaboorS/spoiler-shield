import { ChatMessage as ChatMessageType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, User, Bot, ShieldCheck } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  onReportSpoiler: () => void;
}

export function ChatMessage({ message, onReportSpoiler }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      
      <div className={`max-w-[80%] space-y-2`}>
        <div className={isUser ? 'message-bubble-user px-4 py-3' : 'message-bubble-assistant px-4 py-3'}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        {!isUser && (
          <div className="flex items-center gap-2">
            {message.audited && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="w-3 h-3 text-primary" />
                <span>Safety edit applied</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReportSpoiler}
              className="h-7 text-xs text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              That felt spoilery
            </Button>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <User className="w-4 h-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
