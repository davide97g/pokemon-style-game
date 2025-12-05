import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useState } from "react";
import { DIALOG_TYPING_SPEED } from "../../game/config/GameConstants";
import { gameEventBus } from "../../game/utils/GameEventBus";
import { cn } from "../../lib/utils";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

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

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* No overlay - game should remain visible */}
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] bottom-8 z-50 w-full max-w-4xl translate-x-[-50%] border-4 bg-[#add8e6] p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 rounded-lg",
          )}
          style={{ borderColor: "#4169e1" }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleAdvance();
          }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "text-xl font-bold text-blue-900 font-mono mb-2",
                !speaker && "sr-only",
              )}
            >
              {speaker || "Dialog"}
            </DialogTitle>
            <DialogDescription className="text-base text-black font-mono min-h-[60px]">
              <span className="whitespace-pre-wrap">{displayedText}</span>
              {showIndicator && (
                <span className="ml-2 inline-block animate-bounce text-blue-900">
                  →
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 text-right text-sm text-blue-800 font-mono">
            Press Enter or Space to continue
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};

export default DialogUI;
