interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  response: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ChatService {
  private messageHistory: ChatMessage[] = [];
  private apiUrl: string;

  constructor(apiUrl: string = "/api/chat") {
    this.apiUrl = apiUrl;
  }

  public async sendMessage(userMessage: string): Promise<string> {
    // Add user message to history
    this.messageHistory.push({
      role: "user",
      content: userMessage,
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: this.messageHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data: ChatResponse = await response.json();

      // Add assistant response to history
      this.messageHistory.push({
        role: "assistant",
        content: data.response,
      });

      return data.response;
    } catch (error) {
      console.error("Error sending chat message:", error);
      throw error;
    }
  }

  public getMessageHistory(): ChatMessage[] {
    return [...this.messageHistory];
  }

  public clearHistory(): void {
    this.messageHistory = [];
  }

  public setHistory(messages: ChatMessage[]): void {
    this.messageHistory = [...messages];
  }
}

