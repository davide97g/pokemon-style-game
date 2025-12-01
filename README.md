# Pokemon Style Game

A Pokemon-style game built with React 19, TypeScript, and Phaser.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create a `.env` file in the root directory with your OpenAI API key:
```bash
OPEN_AI_API_KEY=your_openai_api_key_here
PORT=3001
CLIENT_URL=http://localhost:5173
DEBUG=true
```

**For Production:**
- **Server** (`.env` in `apps/server/` or root):
  - `OPEN_AI_API_KEY` - Your OpenAI API key (required)
  - `PORT` - Server port (default: 3001)
  - `CLIENT_URL` - Client URL(s) for CORS. Can be comma-separated for multiple origins (e.g., `https://yourdomain.com,https://www.yourdomain.com`)
  - `DEBUG` - Set to `"true"` to enable debug logging (default: disabled in production, enabled in development)

- **Client** (build-time environment variable):
  - `VITE_SERVER_URL` - Full URL of your server (e.g., `https://api.yourdomain.com` or `https://yourdomain.com:3001`)
  - `VITE_DEBUG` - Set to `"true"` to enable debug logging (default: disabled in production, enabled in development)
  
**Important for Production WebSocket:**
- If your client is served over HTTPS, ensure `VITE_SERVER_URL` uses `https://` (WebSocket will automatically use `wss://`)
- The `CLIENT_URL` on the server must match your production client domain(s)
- Both URLs should use the same protocol (http/http or https/https)
- Debug logging is automatically disabled in production unless explicitly enabled with `DEBUG=true` or `VITE_DEBUG=true`

3. Start both the frontend and backend servers:
```bash
bun run dev:all
```

Or start them separately:
- Frontend only: `bun run dev`
- Backend only: `bun run dev:server`

4. Build for production:
```bash
bun run build
```

5. Preview production build:
```bash
bun run preview
```

## Project Structure

- `src/` - Source code
  - `components/` - React components
  - `game/` - Phaser game code (TypeScript)
- `assets/` - Game assets (tilesets, tilemaps, sprites)
- `index.html` - Entry HTML file
- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript configuration

## Technologies

- React 19
- TypeScript
- Phaser 3
- Vite
- Vercel AI SDK (for LLM-powered chat)
- Express (backend API server)
- Bun (package manager and runtime)

## Features

- **LLM-Powered Chat**: The stone statue chat is powered by OpenAI's GPT models via the Vercel AI SDK, providing intelligent, context-aware responses with conversation history.
- **Model Agnostic**: Built with Vercel AI SDK, making it easy to switch between different LLM providers (OpenAI, Anthropic, etc.)

