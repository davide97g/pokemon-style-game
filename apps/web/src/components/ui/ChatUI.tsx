import { useCallback, useEffect, useState } from "react";
import { STATUE_GREETING } from "../../game/config/ChatConfig";
import { CHAT_MAX_MESSAGES, CHAT_WIDTH } from "../../game/config/GameConstants";
import { gameEventBus } from "../../game/utils/GameEventBus";

interface ChatMessage {
  sender: string;
  text: string;
}

interface ChatUIProps {
  isOpen: boolean;
  nearStatue: boolean;
  onClose: () => void;
}

const ChatUI = ({ isOpen, onClose }: ChatUIProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { sender: "statue", text: STATUE_GREETING },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;

    const message = inputText.trim();
    setMessages((prev) => [...prev, { sender: "player", text: message }]);
    setInputText("");
    setIsLoading(true);

    gameEventBus.emit("chat:message", { message });

    // Simulate response
    setTimeout(() => {
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "statue",
          text: "I'm currently offline. Chat functionality will be available when the server is connected.",
        },
      ]);
    }, 500);
  }, [inputText, isLoading]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && inputText.trim()) {
        handleSendMessage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, inputText, onClose, handleSendMessage]);

  if (!isOpen) {
    return null;
  }

  const displayMessages = messages.slice(-CHAT_MAX_MESSAGES);

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black bg-opacity-50 z-40 border-0 p-0 cursor-pointer"
        onClick={onClose}
        aria-label="Close chat"
      />

      {/* Chat Panel */}
      <div
        className="fixed right-5 top-5 bottom-5 bg-gray-800 bg-opacity-95 border-3 border-gray-500 rounded-lg z-50 flex flex-col"
        style={{ width: `${CHAT_WIDTH}px`, maxWidth: "90vw" }}
      >
        {/* Header */}
        <div className="bg-gray-600 border-b-2 border-gray-500 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗿</span>
            <h3 className="text-white text-base font-mono font-bold">
              Statue Chat
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white text-2xl font-bold hover:text-gray-300"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-black">
          {displayMessages.map((msg, index) => {
            const messageKey = `msg-${msg.sender}-${index}-${msg.text.slice(
              0,
              10,
            )}`;
            return (
              <div
                key={messageKey}
                className={`mb-4 ${
                  msg.sender === "player" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block px-4 py-2 rounded-lg ${
                    msg.sender === "player"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-white"
                  }`}
                >
                  <p className="text-sm font-mono">{msg.text}</p>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="text-left mb-4">
              <div className="inline-block px-4 py-2 rounded-lg bg-gray-700 text-gray-400">
                <p className="text-sm font-mono">🗿 Typing...</p>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t-2 border-gray-500 p-4 bg-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 bg-gray-800 text-white border-2 border-gray-500 rounded font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendMessage();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSendMessage}
              className="px-4 py-2 bg-blue-500 text-white rounded font-mono font-bold text-sm hover:bg-blue-600"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatUI;
