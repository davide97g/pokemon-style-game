/**
 * Splits text into lines that fit within a maximum width
 * Uses canvas measurement for accurate text width calculation
 */
export const splitTextIntoLines = (
  text: string,
  maxWidth: number,
  font: string = "16px monospace",
): string[] => {
  // Create a temporary canvas element to measure text width
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    // Fallback: simple word wrapping without measurement
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      // Rough estimate: ~10px per character for monospace
      const estimatedWidth = testLine.length * 10;

      if (estimatedWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  context.font = font;

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const textWidth = context.measureText(testLine).width;

    if (textWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};
