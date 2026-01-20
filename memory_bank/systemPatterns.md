# System Patterns: RoChat

## System Architecture
RoChat follows a **hybrid architecture** combining:
- **Electron Main Process:** Node.js backend for system-level operations
- **Electron Renderer Process:** Chromium-based UI for user interface
- **Express Backend Server:** RESTful API for chat relay and authentication
- **Database Layer:** MongoDB or PostgreSQL for persistent data storage

```
┌─────────────────────────────────────────────────────────────┐
│                         Electron App                        │
├─────────────────────────────────────────────────────────────┤
│  Renderer Process          │     Main Process               │
│  ┌─────────────────────┐   │  ┌─────────────────────────┐ │
│  │   Views (HTML)      │   │  │  Detection Module       │ │
│  │   - login.html      │   │  │  - logMonitor.js        │ │
│  │   - chat.html       │   │  │  - memoryReader.js      │ │
│  │   - settings.html   │   │  │  - processWatcher.js    │ │
│  ├─────────────────────┤   │  │  - detector.js          │ │
│  │   UI Logic (JS)     │   │  ├─────────────────────────┤ │
│  │   - app.js          │   │  │  Auth Module            │ │
│  │   - chat.js         │   │  │  - robloxAuth.js        │ │
│  │   - settings.js     │   │  │  - tokenManager.js      │ │
│  ├─────────────────────┤   │  ├─────────────────────────┤ │
│  │   Styles (CSS)      │   │  │  Storage Module         │ │
│  │   - main.css        │   │  │  - secureStore.js       │ │
│  │   - themes.css      │   │  ├─────────────────────────┤ │
│  └─────────────────────┘   │  │  IPC Handlers           │ │
│                            │  │  - handlers.js           │ │
└────────────────────────────┼────────────────────────────┼─┘
                             │   IPC Communication       │
                             └───────────┬───────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  Express Server     │
                              ├────────────────────┤
                              │  Routes            │
                              │  - chat.js         │
                              │  - auth.js         │
                              ├────────────────────┤
                              │  Middleware        │
                              │  - authMiddleware  │
                              └──────────┬─────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  Database          │
                              │  MongoDB/PostgreSQL│
                              ├────────────────────┤
                              │  Models            │
                              │  - User.js         │
                              │  - Message.js      │
                              └────────────────────┘
```

## Key Technical Decisions

### Detection Strategy (Dual-Method)
**Primary:** Log monitoring - Parse Roblox log files for chat events
**Fallback:** Memory scanning - Scan process memory when logs are unavailable
**Reasoning:** Provides reliability across different Roblox versions and scenarios

### Authentication Flow
1. User initiates login via OAuth or provides cookies
2. Roblox API authenticates and returns tokens
3. Tokens are securely stored in electron-store (encrypted)
4. Token manager handles refresh cycles automatically
5. IPC communicates auth state between main and renderer processes

### Data Flow
1. **Detection:** Process watcher detects RobloxPlayerBeta.exe
2. **Extraction:** Log monitor or memory reader extracts chat messages
3. **Transmission:** IPC sends messages to renderer process
4. **Display:** Chat UI renders messages in real-time
5. **Persistence:** Backend server stores messages in database
6. **Sync:** Server synchronizes chat history across sessions

## Design Patterns in Use

### Module Pattern
Each major component is an independent module:
- Detection module handles all process monitoring
- Auth module manages authentication flows
- Storage module handles encrypted data persistence

### Observer Pattern
Process watcher observes Roblox process state changes
Log monitor observes log file changes
Chat UI observes message updates via IPC

### Singleton Pattern
Secure store instance is a singleton for consistent access
Token manager maintains single source of truth for authentication

### Factory Pattern
Detector factory creates appropriate detection method based on environment

## Component Relationships

### Detection Module Dependencies
- `detector.js` orchestrates `logMonitor.js`, `memoryReader.js`, and `processWatcher.js`
- `processWatcher.js` triggers detection when Roblox starts/stops
- Detection results are sent via IPC to renderer

### Authentication Module Dependencies
- `robloxAuth.js` handles OAuth flows and cookie validation
- `tokenManager.js` manages token lifecycle (issue, refresh, revoke)
- `secureStore.js` persists encrypted credentials

### IPC Communication
- Main process exposes APIs via `handlers.js`
- Renderer process invokes APIs via `ipcRenderer`
- Shared constants define IPC channel names

## Critical Implementation Paths

### Startup Flow
1. Electron main process initializes
2. Process watcher starts monitoring for Roblox
3. Renderer loads login view
4. User authenticates via OAuth/cookies
5. Tokens stored securely
6. App switches to chat view

### Detection Flow
1. `processWatcher.js` detects RobloxPlayerBeta.exe
2. `detector.js` selects detection method
3. `logMonitor.js` reads log files (primary)
4. Or `memoryReader.js` scans memory (fallback)
5. Chat messages extracted and parsed
6. IPC sends messages to renderer

### Chat Relay Flow
1. Detection module extracts message
2. Main process forwards to backend server
3. Backend stores in database
4. Backend broadcasts to connected clients
5. Renderer receives via WebSocket/HTTP
6. Chat UI displays message

## Security Considerations

### Credential Storage
- All tokens encrypted using system keychain (Windows Credential Manager)
- electron-store configured with encryption enabled
- Memory cleared of sensitive data after use

### IPC Security
- Validated IPC channels only
- Input sanitization on all IPC messages
- No sensitive data in renderer process memory

### API Security
- JWT-based authentication
- Auth middleware on all protected routes
- HTTPS only for production deployment

## Scalability Patterns

### Detection Layer
- Event-driven architecture for process monitoring
- Non-blocking I/O for log reading
- Polling with adaptive intervals

### Backend Layer
- RESTful API design for horizontal scaling
- Database connection pooling
- Optional WebSocket for real-time updates

### Storage Layer
- Encrypted local storage for offline capability
- Cloud database for cross-device sync
- Lazy loading for chat history

## Performance Patterns

### Detection Optimization
- Tail-call optimization in log parsing
- Binary search for memory pattern matching
- Debouncing for rapid state changes

### UI Optimization
- Virtual scrolling for long chat histories
- CSS containment for theme switching
- Debounced input handling

### Data Optimization
- Message batching for network efficiency
- Delta updates for chat history
- Indexed patterns for memory scanning

## Notes
This architecture prioritizes security, reliability, and performance while maintaining clean separation of concerns between the Electron app and backend server.

## Future Considerations
- Add WebSocket support for real-time server push
- Implement message queuing for offline scenarios
- Consider Redis for caching active sessions
- Add rate limiting for API endpoints
