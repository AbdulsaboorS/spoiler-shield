import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, ResponseStyle, RefinementOption, WatchSetup } from '@/lib/types';
import { useLocalStorage } from './useLocalStorage';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spoiler-shield-chat`;

export function useChat() {
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('spoilershield-chat', []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  const sendMessage = useCallback(async (
    question: string,
    watchSetup: WatchSetup,
    style: ResponseStyle
  ) => {
    if (!watchSetup.context.trim()) {
      setError('Please provide context from what you\'ve watched.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
      style
    };

    // Store user message ID to ensure it's preserved
    const userMessageId = userMessage.id;
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    let assistantContent = '';

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          question,
          context: watchSetup.context,
          style,
          showInfo: {
            platform: watchSetup.platform,
            title: watchSetup.showTitle,
            season: watchSetup.season,
            episode: watchSetup.episode,
            timestamp: watchSetup.timestamp,
          }
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 402) {
          throw new Error('Service temporarily unavailable. Please try again later.');
        }
        throw new Error('Failed to get response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const updateAssistantMessage = (content: string) => {
        assistantContent = content;
        setMessages(prev => {
          // Ensure user message is preserved - if missing, add it back
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage) {
            messagesWithUser = [...prev, userMessage];
          }
          
          const last = messagesWithUser[messagesWithUser.length - 1];
          if (last?.role === 'assistant') {
            return messagesWithUser.map((m, i) => 
              i === messagesWithUser.length - 1 ? { ...m, content } : m
            );
          }
          return [...messagesWithUser, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content,
            timestamp: new Date(),
            style
          }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              updateAssistantMessage(assistantContent + content);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              updateAssistantMessage(assistantContent + content);
            }
          } catch { /* ignore */ }
        }
      }

      // Audit pass disabled for MVP - endpoint not deployed yet
      // TODO: Re-enable when audit-answer endpoint is deployed
      // The original answer is already displayed, so no action needed
      if (assistantContent.trim()) {
        // Ensure message is persisted - verify it exists AND preserve user message
        setMessages(prev => {
          // CRITICAL: Ensure user message is preserved
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage && userMessageId) {
            messagesWithUser = [...prev, userMessage];
          }
          
          const last = messagesWithUser[messagesWithUser.length - 1];
          // If last message is assistant and has content, ensure it's preserved
          if (last?.role === 'assistant' && last.content.trim()) {
            return messagesWithUser; // Return with user message preserved
          }
          // If somehow missing, add it back (shouldn't happen, but safety check)
          if (assistantContent.trim()) {
            return [...messagesWithUser, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: assistantContent,
              timestamp: new Date(),
              style
            }];
          }
          return messagesWithUser; // Always return with user message preserved
        });
      }

    } catch (err) {
      // If we have partial content, preserve it even on error
      if (assistantContent.trim()) {
        setMessages(prev => {
          // CRITICAL: Ensure user message is preserved
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage && userMessageId) {
            messagesWithUser = [...prev, userMessage];
          }
          
          const last = messagesWithUser[messagesWithUser.length - 1];
          // Ensure assistant message exists with content
          if (last?.role === 'assistant') {
            // Update existing message if content is missing or shorter
            if (!last.content || last.content.length < assistantContent.length) {
              return messagesWithUser.map((m, i) => 
                i === messagesWithUser.length - 1 
                  ? { ...m, content: assistantContent }
                  : m
              );
            }
            return messagesWithUser;
          }
          // Add message if missing
          return [...messagesWithUser, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: assistantContent,
            timestamp: new Date(),
            style
          }];
        });
      }
      
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [setMessages]);

  const refineLastAnswer = useCallback(async (
    refinement: RefinementOption,
    watchSetup: WatchSetup
  ) => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    
    if (!lastAssistant || !lastUser) return;

    const refinementPrompts: Record<RefinementOption, string> = {
      shorter: `Make this shorter: "${lastAssistant.content}"`,
      detail: `Add more detail to: "${lastAssistant.content}"`,
      examples: `Add examples to explain: "${lastAssistant.content}"`,
      terms: `Define any terms in: "${lastAssistant.content}"`
    };

    await sendMessage(refinementPrompts[refinement], watchSetup, lastAssistant.style || 'quick');
  }, [messages, sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    refineLastAnswer,
    clearChat,
    setError
  };
}
