# RoChat

RoChat - A New Way of Communication

## About

RoChat is an alternative chat system for Roblox that provides a reliable, unrestricted communication platform. Instead of relying on Roblox's built-in chat system, RoChat offers a dedicated desktop application that allows players to communicate freely across Roblox games.

## Features

- Roblox Authentication (OAuth2-based)
- Automatic game server detection (JobId/PlaceId)
- **Dual Chat System**: Server chat (per game instance) and Global chat (per game)
- Real-time WebSocket communication
- Automatic message cleanup for privacy
- Secure token storage (electron-store)
- Cross-platform support (Windows, macOS, Linux)

## Architecture

The application consists of two main components:

1. **Electron Client** - Desktop application for monitoring Roblox and providing chat interface
2. **Express Server** - Backend server for managing chat sessions and authentication

### Electron Client Structure

```
src/
├── main/           # Electron main process
│   ├── detection/   # Roblox detection (log monitoring, memory reading)
│   ├── auth/        # Authentication (Roblox login, token management)
│   ├── storage/     # Secure storage (electron-store)
│   ├── ipc/         # IPC communication handlers
│   └── logging/     # Logging (winston)
├── renderer/        # Renderer process (UI)
│   ├── js/          # JavaScript logic
│   ├── css/         # Stylesheets
│   └── index.html   # Main HTML
├── preload/         # Preload script for context isolation
└── shared/          # Shared utilities and constants
```

### Server Structure

```
server/
├── config/          # Database configuration
├── middleware/      # Express middleware
├── models/          # Mongoose models
├── routes/          # API routes
└── logging/         # Server logging
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

### 1. Register a Roblox OAuth2 Application

Before running the app, you need to create an OAuth2 application with Roblox:

1. Visit [https://create.roblox.com/credentials](https://create.roblox.com/credentials)
2. Click "Create OAuth2 App"
3. Fill in the application details:
   - **Name**: RoChat (or any name you prefer)
   - **Description**: Alternative chat application for Roblox
   - **Redirect URLs**: Add `http://localhost:3333/callback`
   - **Scopes**: Select:
     - `openid` (required)
     - `profile` (recommended)
4. Save the application and copy your **Client ID** and **Client Secret**

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:

   **Client-side (Electron app):**
   - `SERVER_URL` - Your backend server URL (http://localhost:3000 for local, https://your-render-url.onrender.com for production)
   - `ROBLOX_CLIENT_ID` - Your OAuth2 Client ID from step 1
   - `OAUTH_REDIRECT_URI` - OAuth2 callback URL (default: http://localhost:3333/callback)
   - `OAUTH_CALLBACK_PORT` - Local server port for OAuth2 callback (default: 3333)

   **Server-side (Backend on Render):**
   - `DB_URL` - MongoDB connection string
   - `JWT_SECRET` - Secret key for JWT tokens (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `ROBLOX_CLIENT_ID` - Your OAuth2 Client ID from step 1
   - `ROBLOX_CLIENT_SECRET` - Your OAuth2 Client Secret from step 1 (ONLY on server, never on client)
   - `OAUTH_REDIRECT_URI` - OAuth2 callback URL (http://localhost:3333/callback)
   - `NODE_ENV` - Set to `production` for deployment

## Running the Application

### Development

1. Start the server:
   ```bash
   npm run dev:server
   ```

2. In another terminal, start the Electron app:
   ```bash
   npm run dev
   ```

### Production

1. Build the application:
   ```bash
   npm run build
   ```

2. Run the built application from the `dist/` directory

## How It Works

1. **Authentication**: User authenticates via OAuth2 using their system browser
   - Clicking "Login" opens the Roblox login page in your default browser
   - After successful login, you're redirected back to the app
   - Access tokens are automatically refreshed (15-minute lifetime)
   - Refresh tokens last for 90 days
2. **Game Detection**: The app monitors Roblox logs to detect which game server you're in (JobId/PlaceId)
3. **Chat Sessions**: Two chat channels are automatically created:
   - **Server Chat**: Private to your specific game instance (JobId)
   - **Global Chat**: Shared across all instances of the same game (PlaceId)
4. **Real-time Communication**: Messages are sent and received via WebSocket for instant delivery
5. **Privacy**: When all players leave a chat session, messages are automatically deleted after 1 minute

## Security Notes

- All sensitive data is stored using `electron-store` with encryption
- Roblox tokens are never exposed to the renderer process
- IPC communication uses context isolation for security
- **OAuth2 Client Secret Protection**: The client secret is NEVER stored on the client side. All token exchanges happen through the backend server, keeping the client secret secure on the server. This prevents extraction of credentials from the Electron app.

## Dependencies

### Electron
- `electron` - Desktop application framework
- `electron-store` - Secure persistent storage

### Server
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `socket.io` - WebSocket library
- `winston` - Logging library
- `axios` - HTTP client

## License

This project is licensed under the terms of the MIT license. See the `LICENSE` file for details.