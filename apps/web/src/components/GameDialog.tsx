import { useCallback, useEffect, useRef, useState } from "react";
import { DIALOG_TYPING_SPEED } from "../config/game";
import { useKeyboard } from "../hooks/useKeyboard";
import { splitTextIntoLines } from "../utils/textUtils";
import { Card } from "./ui/card";

interface GameDialogProps {
  isOpen: boolean;
  text: string;
  speaker?: string;
  onClose: () => void;
}

export function GameDialog({
  isOpen,
  text,
  speaker,
  onClose,
}: GameDialogProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasMoreLines, setHasMoreLines] = useState(false);
  const keys = useKeyboard();
  const [lastKeyTime, setLastKeyTime] = useState(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogLinesRef = useRef<string[]>([]);
  const currentLineIndexRef = useRef(0);
  const currentCharIndexRef = useRef(0);
  const dialogContainerRef = useRef<HTMLDivElement>(null);
  const isTypingRef = useRef(false);
  const isWaitingRef = useRef(false);
  const hasMoreLinesRef = useRef(false);

  const typeDialogText = useCallback(() => {
    if (currentLineIndexRef.current >= dialogLinesRef.current.length) {
      isTypingRef.current = false;
      isWaitingRef.current = false;
      hasMoreLinesRef.current = false;
      setIsTyping(false);
      setIsWaiting(false);
      setHasMoreLines(false);
      return;
    }

    const currentLine = dialogLinesRef.current[currentLineIndexRef.current];

    if (currentCharIndexRef.current < currentLine.length) {
      const textToShow = currentLine.substring(
        0,
        currentCharIndexRef.current + 1,
      );
      setDisplayedText(textToShow);
      currentCharIndexRef.current++;

      typingTimeoutRef.current = setTimeout(() => {
        typeDialogText();
      }, DIALOG_TYPING_SPEED);
    } else {
      // Current line is complete
      if (currentLineIndexRef.current < dialogLinesRef.current.length - 1) {
        // There are more lines
        isTypingRef.current = false;
        isWaitingRef.current = true;
        hasMoreLinesRef.current = true;
        setIsTyping(false);
        setIsWaiting(true);
        setHasMoreLines(true);
      } else {
        // Last line complete
        isTypingRef.current = false;
        isWaitingRef.current = true;
        hasMoreLinesRef.current = false;
        setIsTyping(false);
        setIsWaiting(true);
        setHasMoreLines(false);
      }
    }
  }, []);

  // Reset when dialog opens or text changes
  useEffect(() => {
    if (isOpen && text) {
      setDisplayedText("");
      isTypingRef.current = true;
      isWaitingRef.current = false;
      hasMoreLinesRef.current = false;
      setIsTyping(true);
      setIsWaiting(false);
      setHasMoreLines(false);
      currentLineIndexRef.current = 0;
      currentCharIndexRef.current = 0;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Prepare text with speaker if provided
      const fullText = speaker ? `${speaker}: ${text}` : text;

      // Calculate max width for text wrapping (dialog width - padding - margins)
      // Using viewport width as reference, similar to original implementation
      const dialogWidth = window.innerWidth - 64;
      const maxTextWidth = dialogWidth - 80;

      // Split text into lines
      dialogLinesRef.current = splitTextIntoLines(
        fullText,
        maxTextWidth,
        "16px monospace",
      );

      // Start typing first line
      typeDialogText();
    } else {
      setDisplayedText("");
      isTypingRef.current = false;
      isWaitingRef.current = false;
      hasMoreLinesRef.current = false;
      setIsTyping(false);
      setIsWaiting(false);
      setHasMoreLines(false);
      dialogLinesRef.current = [];
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isOpen, text, speaker, typeDialogText]);

  const handleAdvance = useCallback(() => {
    if (isTypingRef.current) {
      // Finish typing current line immediately
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      const currentLine = dialogLinesRef.current[currentLineIndexRef.current];
      setDisplayedText(currentLine);
      currentCharIndexRef.current = currentLine.length;

      if (currentLineIndexRef.current < dialogLinesRef.current.length - 1) {
        // There are more lines
        isTypingRef.current = false;
        isWaitingRef.current = true;
        hasMoreLinesRef.current = true;
        setIsTyping(false);
        setIsWaiting(true);
        setHasMoreLines(true);
      } else {
        // Last line
        isTypingRef.current = false;
        isWaitingRef.current = true;
        hasMoreLinesRef.current = false;
        setIsTyping(false);
        setIsWaiting(true);
        setHasMoreLines(false);
      }
      return;
    }

    if (isWaitingRef.current && hasMoreLinesRef.current) {
      // Advance to next line
      currentLineIndexRef.current++;
      currentCharIndexRef.current = 0;
      setDisplayedText("");
      isTypingRef.current = true;
      isWaitingRef.current = false;
      hasMoreLinesRef.current = false;
      setIsTyping(true);
      setIsWaiting(false);
      setHasMoreLines(false);
      typeDialogText();
    } else if (isWaitingRef.current && !hasMoreLinesRef.current) {
      // Close dialog
      onClose();
    }
  }, [typeDialogText, onClose]);

  // Handle advance input
  useEffect(() => {
    if (!isOpen) return;

    const now = Date.now();
    if (now - lastKeyTime < 200) return; // Debounce

    if (keys.space || keys.enter) {
      handleAdvance();
      setLastKeyTime(now);
    }
  }, [keys, isOpen, lastKeyTime, handleAdvance]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogContainerRef}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl pointer-events-auto z-50"
    >
      <Card className="bg-blue-100/95 border-4 border-blue-600 p-4 shadow-lg min-h-[100px] relative">
        {speaker && (
          <div className="absolute -top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-t-lg font-bold text-sm border-x-2 border-t-2 border-blue-800">
            {speaker}
          </div>
        )}
        <p className="font-mono text-base text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
          {displayedText}
        </p>

        {hasMoreLines && (
          <div className="absolute bottom-2 right-4 animate-bounce text-blue-800 font-bold text-xl">
            ▼
          </div>
        )}
      </Card>
    </div>
  );
}
