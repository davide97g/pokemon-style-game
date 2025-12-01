import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

// Debug logging utility
const DEBUG = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
const debugLog = (...args: unknown[]): void => {
  if (DEBUG) {
    console.log(...args);
  }
};
const debugWarn = (...args: unknown[]): void => {
  if (DEBUG) {
    console.warn(...args);
  }
};

const app = express();
const httpServer = createServer(app);

// Normalize URL - remove trailing slashes and ensure proper format
const normalizeUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, ""); // Remove trailing slashes
};

// Handle CORS origins - support multiple origins separated by comma
const getCorsOrigins = (): string | string[] => {
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) {
    return "http://localhost:5173";
  }

  // Support multiple origins separated by comma
  if (clientUrl.includes(",")) {
    const origins = clientUrl.split(",").map((url) => normalizeUrl(url));
    // Also add HTTPS versions if HTTP versions are provided
    const allOrigins: string[] = [];
    origins.forEach((origin) => {
      allOrigins.push(origin);
      // If HTTP, also allow HTTPS version
      if (origin.startsWith("http://")) {
        allOrigins.push(origin.replace("http://", "https://"));
      }
      // If HTTPS, also allow HTTP version (for flexibility)
      if (origin.startsWith("https://")) {
        allOrigins.push(origin.replace("https://", "http://"));
      }
    });
    return [...new Set(allOrigins)]; // Remove duplicates
  }

  const normalized = normalizeUrl(clientUrl);
  // Return both HTTP and HTTPS versions if only one is specified
  if (normalized.startsWith("http://")) {
    return [normalized, normalized.replace("http://", "https://")];
  }
  if (normalized.startsWith("https://")) {
    return [normalized, normalized.replace("https://", "http://")];
  }
  return normalized;
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

// Log environment configuration on startup (always show)
console.log("=== Server Configuration ===");
console.log("PORT:", PORT);
console.log(
  "CLIENT_URL:",
  process.env.CLIENT_URL || "http://localhost:5173 (default)"
);
debugLog(
  "CORS Origins:",
  Array.isArray(corsOrigins) ? corsOrigins.join(", ") : corsOrigins
);
debugLog(
  "OPEN_AI_API_KEY:",
  process.env.OPEN_AI_API_KEY ? "✓ Set" : "✗ Not set"
);
debugLog("DEBUG mode:", DEBUG ? "enabled" : "disabled");
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
  debugLog(
    `Player connected: ${socket.id} from origin: ${socket.handshake.headers.origin}`
  );

  socket.on("newplayer", (data?: { x: number; y: number }) => {
    // Use provided position or random spawn
    const spawnPos = data ? { x: data.x, y: data.y } : getRandomSpawnPosition();

    const player: Player = {
      id: socket.id,
      x: spawnPos.x,
      y: spawnPos.y,
    };

    players.set(socket.id, player);

    const allPlayers = getAllPlayers();
    debugLog(`📤 Emitting 'allplayers' to ${socket.id}:`, allPlayers);
    // Send all existing players to the new player
    socket.emit("allplayers", allPlayers);

    debugLog(
      `📤 Broadcasting 'newplayer' to all clients except ${socket.id}:`,
      player
    );
    // Broadcast new player to all other clients
    socket.broadcast.emit("newplayer", player);

    debugLog(
      `New player joined: ${socket.id} at (${player.x}, ${player.y}). Total players: ${players.size}`
    );
  });

  socket.on("move", (data: { x: number; y: number; direction?: string }) => {
    let player = players.get(socket.id);

    // If player doesn't exist yet, create them (handles race condition)
    if (!player) {
      debugWarn(
        `⚠️ Move event received from unregistered player ${socket.id}, creating player entry`
      );
      player = {
        id: socket.id,
        x: data.x,
        y: data.y,
        direction: data.direction,
      };
      players.set(socket.id, player);
      // Also notify other clients about this new player
      socket.broadcast.emit("newplayer", player);
    } else {
      player.x = data.x;
      player.y = data.y;
      if (data.direction) {
        player.direction = data.direction;
      }
    }

    const moveData = {
      id: socket.id,
      x: player.x,
      y: player.y,
      direction: player.direction,
    };

    debugLog(
      `📤 Broadcasting 'move' from ${socket.id} to all other clients:`,
      moveData
    );
    // Broadcast movement to all other clients
    socket.broadcast.emit("move", moveData);
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      debugLog(
        `📤 Broadcasting 'remove' for disconnected player: ${socket.id}`
      );
      // Notify all clients to remove this player
      io.emit("remove", socket.id);
      debugLog(
        `Player disconnected: ${socket.id}. Remaining players: ${players.size}`
      );
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  debugLog(`Socket.io server ready for multiplayer connections`);
  debugLog(
    `WebSocket endpoint: ws://localhost:${PORT} (or wss:// in production)`
  );
});
