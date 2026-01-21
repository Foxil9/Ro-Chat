# RoChat

Roblox Chat Relay Application - An Electron-based desktop application for monitoring and relaying Roblox chat messages.

## Features

- Roblox Authentication (OAuth/Token-based)
- Real-time server detection (JobId/PlaceId)
- Chat monitoring and relaying
- Secure token storage (electron-store)
- WebSocket-based real-time communication
- Cross-platform support (Windows, macOS, Linux)

## Architecture

The application consists of two main components:

1. **Electron Client** - Desktop application for monitoring Roblox and displaying chat
2. **Express Server** - Backend server for chat relay and authentication

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
   - **Description**: Desktop chat relay application
   - **Redirect URLs**: Add `http://localhost:3333/callback`
   - **Scopes**: Select:
     - `openid` (required)
     - `profile` (recommended)
     - `universe-messaging-service:publish` (required for chat relay)
4. Save the application and copy your **Client ID** and **Client Secret**

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:
   - `DB_URL` - MongoDB connection string
   - `PORT` - Server port (default: 3000)
   - `JWT_SECRET` - Secret key for JWT tokens
   - `ROBLOX_CLIENT_ID` - Your OAuth2 Client ID from step 1
   - `ROBLOX_CLIENT_SECRET` - Your OAuth2 Client Secret from step 1
   - `OAUTH_REDIRECT_URI` - OAuth2 callback URL (default: http://localhost:3333/callback)
   - `OAUTH_CALLBACK_PORT` - Local server port for OAuth2 callback (default: 3333)

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
2. **Detection**: The app monitors Roblox logs to detect game server (JobId/PlaceId)
3. **Connection**: App connects to the backend server using the detected JobId
4. **Chat Relay**: Messages are relayed between the app and the server via WebSocket

## Security Notes

- All sensitive data is stored using `electron-store` with encryption
- Roblox tokens are never exposed to the renderer process
- IPC communication uses context isolation for security

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

MIT
