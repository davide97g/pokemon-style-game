import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_MAX_MESSAGES } from "../config/game";
import { STATUE_GREETING } from "../game/config/ChatConfig";
import { ChatService } from "../game/services/ChatService";
import { Card } from "./ui/card";

interface ChatMessage {
  sender: "player" | "statue";
  text: string;
}

interface ChatUIProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatUI = ({ isOpen, onClose }: ChatUIProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { sender: "statue", text: STATUE_GREETING },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatServiceRef = useRef<ChatService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize chat service
  useEffect(() => {
    if (!chatServiceRef.current) {
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
      const apiUrl = `${serverUrl}/api/chat`;
      chatServiceRef.current = new ChatService(apiUrl);
    }
  }, []);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll to bottom when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is stable from useState, won't cause re-renders
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || isLoading || !chatServiceRef.current) return;

    const message = inputText.trim();
    setInputText("");

    // Add player message
    const newMessages = [
      ...messages,
      { sender: "player" as const, text: message },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await chatServiceRef.current.sendMessage(message);
      setMessages([...newMessages, { sender: "statue", text: response }]);
    } catch (error) {
      console.error("Error sending chat message:", error);
      setMessages([
        ...newMessages,
        {
          sender: "statue",
          text: "I apologize, but I'm having trouble responding right now. Please try again later.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSendMessage();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSendMessage, onClose],
  );

  if (!isOpen) return null;

  // Limit messages to CHAT_MAX_MESSAGES
  const displayMessages = messages.slice(-CHAT_MAX_MESSAGES);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <Card className="w-[90%] max-w-[400px] h-[70vh] max-h-[600px] bg-gray-800 border-4 border-gray-600 pointer-events-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-gray-700 border-b-2 border-gray-600 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗿</span>
            <h2 className="font-bold text-white text-lg">Statue Chat</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 bg-black space-y-3">
          {displayMessages.map((msg) => (
            <div
              key={msg.text}
              className={`flex ${
                msg.sender === "player" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.sender === "player"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-white"
                }`}
              >
                <p className="text-sm font-mono whitespace-pre-wrap wrap-break-word">
                  {msg.text}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-700 text-gray-400 rounded-lg px-4 py-2">
                <p className="text-sm font-mono">🗿 Typing...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t-2 border-gray-600 p-3 bg-gray-700">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-bold text-sm"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Press Enter to send, Esc to close
          </p>
        </div>
      </Card>
    </div>
  );
};
