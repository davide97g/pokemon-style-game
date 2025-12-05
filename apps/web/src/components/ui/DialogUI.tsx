import { useCallback, useEffect, useState } from "react";
import { DIALOG_TYPING_SPEED } from "../../game/config/GameConstants";
import { gameEventBus } from "../../game/utils/GameEventBus";

interface DialogUIProps {
  isVisible: boolean;
  text: string;
  speaker?: string;
  onAdvance: () => void;
  onClose: () => void;
}

const DialogUI = ({ isVisible, text, speaker, onClose }: DialogUIProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);
  const [dialogLines, setDialogLines] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  useEffect(() => {
    if (!isVisible || !text) {
      setDisplayedText("");
      setCurrentIndex(0);
      setCurrentLineIndex(0);
      setShowIndicator(false);
      setDialogLines([]);
      return;
    }

    const fullText = speaker ? `${speaker}: ${text}` : text;
    // Simple line splitting (could be improved with proper text wrapping)
    const lines = fullText.split("\n").filter((line) => line.trim().length > 0);
    setDialogLines(lines);
    setCurrentLineIndex(0);
    setCurrentIndex(0);
    setDisplayedText("");
  }, [isVisible, text, speaker]);

  useEffect(() => {
    if (!isVisible || dialogLines.length === 0) return;

    const currentLine = dialogLines[currentLineIndex];
    if (!currentLine) return;

    if (currentIndex < currentLine.length) {
      const timer = setTimeout(() => {
        setDisplayedText(currentLine.substring(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, DIALOG_TYPING_SPEED);

      return () => clearTimeout(timer);
    } else {
      // Show indicator if there are more lines, or hide if last line
      if (currentLineIndex < dialogLines.length - 1) {
        setShowIndicator(true);
      } else {
        setShowIndicator(false);
      }
    }
  }, [isVisible, dialogLines, currentLineIndex, currentIndex]);

  const handleAdvance = useCallback(() => {
    const currentLine = dialogLines[currentLineIndex];
    if (!currentLine) return;

    // If still typing, complete the current line
    if (currentIndex < currentLine.length) {
      setDisplayedText(currentLine);
      setCurrentIndex(currentLine.length);
      if (currentLineIndex < dialogLines.length - 1) {
        setShowIndicator(true);
      }
      return;
    }

    // Move to next line or close
    if (currentLineIndex < dialogLines.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
      setCurrentIndex(0);
      setDisplayedText("");
      setShowIndicator(false);
    } else {
      onClose();
    }
  }, [dialogLines, currentLineIndex, currentIndex, onClose]);

  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleAdvance();
      }
    };

    // Listen to event bus for dialog advance
    const unsubscribe = gameEventBus.on("dialog:advance", handleAdvance);

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unsubscribe();
    };
  }, [isVisible, handleAdvance]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-8 left-8 right-8 z-50">
      <div className="bg-lightblue border-4 border-blue-600 rounded-lg p-4 max-w-4xl mx-auto">
        <p className="text-black text-base font-mono mb-2">{displayedText}</p>
        {showIndicator && (
          <div className="text-right">
            <span className="text-black text-xl font-mono animate-bounce">
              →
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DialogUI;
