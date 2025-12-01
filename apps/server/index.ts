import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Handle CORS origins - support multiple origins separated by comma
const getCorsOrigins = (): string | string[] => {
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) {
    return "http://localhost:5173";
  }
  // Support multiple origins separated by comma
  if (clientUrl.includes(",")) {
    return clientUrl.split(",").map((url) => url.trim());
  }
  return clientUrl;
};

const corsOrigins = getCorsOrigins();

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

// Configure CORS for Express
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
app.use(express.json());

// Log environment configuration on startup
console.log("=== Server Configuration ===");
console.log("PORT:", PORT);
console.log("CLIENT_URL:", process.env.CLIENT_URL || "http://localhost:5173 (default)");
console.log("CORS Origins:", Array.isArray(corsOrigins) ? corsOrigins.join(", ") : corsOrigins);
console.log("OPEN_AI_API_KEY:", process.env.OPEN_AI_API_KEY ? "✓ Set" : "✗ Not set");
console.log("===========================");

const SYSTEM_PROMPT = `You are an ancient stone statue in a fantasy game world. You have stood in the same place for many ages, observing the world around you. You speak in a wise, patient, and somewhat mysterious manner. You remember conversations with travelers who have visited you.

Key characteristics:
- You are old, weathered, and have witnessed many seasons
- You are patient and thoughtful
- You speak in a slightly formal, ancient way
- You remember previous conversations with the current traveler
- You are curious about the world but cannot move from your spot
- Keep responses concise (2-3 sentences typically)
- Be friendly but maintain your ancient, mysterious persona

Respond as the statue would, remembering the conversation history.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    if (!process.env.OPEN_AI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Set the API key for the OpenAI provider
    process.env.OPENAI_API_KEY = process.env.OPEN_AI_API_KEY;

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    res.json({
      response: result.text,
      usage: result.usage,
    });
  } catch (error) {
    console.error("Error generating chat response:", error);
    res.status(500).json({
      error: "Failed to generate response",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Multiplayer game state
interface Player {
  id: string;
  x: number;
  y: number;
  direction?: string;
}

const players: Map<string, Player> = new Map();

const getRandomSpawnPosition = (): { x: number; y: number } => {
  // Spawn players in a reasonable area (adjust based on your map)
  return {
    x: 100 + Math.random() * 300,
    y: 100 + Math.random() * 300,
  };
};

const getAllPlayers = (): Player[] => {
  return Array.from(players.values());
};

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id} from origin: ${socket.handshake.headers.origin}`);

  socket.on("newplayer", (data?: { x: number; y: number }) => {
    // Use provided position or random spawn
    const spawnPos = data ? { x: data.x, y: data.y } : getRandomSpawnPosition();

    const player: Player = {
      id: socket.id,
      x: spawnPos.x,
      y: spawnPos.y,
    };

    players.set(socket.id, player);

    // Send all existing players to the new player
    socket.emit("allplayers", getAllPlayers());

    // Broadcast new player to all other clients
    socket.broadcast.emit("newplayer", player);

    console.log(
      `New player joined: ${socket.id} at (${player.x}, ${player.y})`
    );
  });

  socket.on("move", (data: { x: number; y: number; direction?: string }) => {
    const player = players.get(socket.id);
    if (player) {
      player.x = data.x;
      player.y = data.y;
      if (data.direction) {
        player.direction = data.direction;
      }

      // Broadcast movement to all other clients
      socket.broadcast.emit("move", {
        id: socket.id,
        x: player.x,
        y: player.y,
        direction: player.direction,
      });
    }
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      // Notify all clients to remove this player
      io.emit("remove", socket.id);
      console.log(`Player disconnected: ${socket.id}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server ready for multiplayer connections`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT} (or wss:// in production)`);
});
