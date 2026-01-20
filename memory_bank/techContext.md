# Tech Context: RoChat

## Technologies Used

### Frontend / Desktop
- **Electron:** Cross-platform desktop application framework
- **HTML5/CSS3:** UI markup and styling
- **Vanilla JavaScript:** Renderer process logic (no framework initially)

### Backend
- **Node.js:** JavaScript runtime for main and server processes
- **Express.js:** Web server framework for API
- **MongoDB or PostgreSQL:** Database for persistent storage (TBD)

### Libraries & Tools
- **electron-store:** Encrypted local storage for Electron
- **node-fetch:** HTTP requests for Roblox API
- **JWT:** Token generation and validation
- **bcrypt:** Password hashing (if needed)

### Development Tools
- **electron-builder:** Application packaging and distribution
- **ESLint:** Code linting
- **Prettier:** Code formatting

## Development Setup

### Prerequisites
- Node.js (v18+)
- npm or yarn
- MongoDB or PostgreSQL (choice to be made)
- Git

### Installation Commands (to be implemented)
```bash
# Clone repository
git clone <repository-url>
cd RoChat

# Install dependencies
npm install

# Start backend server
npm run server

# Start Electron app
npm run electron
```

### Environment Configuration
Create `.env` file with:
```
# Database
DB_URL=mongodb://localhost:27017/rochat
# or
DB_URL=postgresql://user:password@localhost:5432/rochat

# Server
PORT=3000

# Security
JWT_SECRET=your-secret-key

# Roblox
ROBLOX_CLIENT_ID=your-client-id
ROBLOX_CLIENT_SECRET=your-client-secret
```

## Technical Constraints

### Platform-Specific
- **Initial Target:** Windows 10/11
- **Future:** macOS, Linux support (electron-builder handles cross-platform)

### Roblox Integration
- Must use approved detection methods (log parsing, memory reading)
- Cannot modify Roblox client files
- Must respect Roblox Terms of Service

### Security
- All credentials must be encrypted at rest
- IPC communication must be validated and sanitized
- API endpoints require authentication
- No sensitive data in client-side code

## Dependencies

### Production Dependencies (to be installed)
```json
{
  "electron": "^latest",
  "express": "^latest",
  "electron-store": "^latest",
  "node-fetch": "^latest",
  "jsonwebtoken": "^latest",
  "bcrypt": "^latest"
}
```

### Database Dependencies (to be selected)
- MongoDB: `mongoose` or `mongodb`
- PostgreSQL: `pg` and `sequelize`

### Development Dependencies (to be installed)
```json
{
  "electron-builder": "^latest",
  "eslint": "^latest",
  "prettier": "^latest"
}
```

## Tool Usage Patterns

### Version Control
- **Branch Strategy:** Git Flow (main, develop, feature branches)
- **Commit Convention:** Conventional Commits (feat:, fix:, docs:, etc.)
- **Repository:** GitHub (private)

### Code Quality
- **Linting:** ESLint for JavaScript
- **Formatting:** Prettier with consistent configuration
- **Type Safety:** Consider TypeScript for future refactoring

### Testing
- **Framework:** Jest for unit testing
- **E2E:** Playwright for Electron testing
- **Coverage:** Target 80%+ coverage

## Environment Configuration

### Development
- Hot reload enabled for renderer process
- Debug logging enabled
- Local database instance

### Production
- Optimized builds (minification, tree-shaking)
- Production database
- Encrypted builds (code signing)

### Environment Variables
All sensitive data stored in `.env` (gitignored)
Template provided in `.env.example`

## Build and Deployment

### Build Process
```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

### Distribution
- **Windows:** NSIS installer and portable exe
- **macOS:** DMG and app bundle
- **Linux:** AppImage and deb

### Server Deployment
- **Platform:** VPS or cloud provider (AWS, DigitalOcean, etc.)
- **Process Manager:** PM2 or systemd
- **Reverse Proxy:** Nginx
- **SSL:** Let's Encrypt

## Testing Strategy

### Unit Testing
- Jest for Node.js modules
- Mock Electron APIs in renderer tests
- Test coverage: 80%+ minimum

### Integration Testing
- Test IPC communication between main and renderer
- Test API endpoints with Express
- Test database operations

### End-to-End Testing
- Playwright for Electron UI automation
- Test complete user flows (login, chat relay, settings)
- Test Roblox detection scenarios

## Code Style and Linting

### ESLint Configuration
```json
{
  "extends": ["eslint:recommended"],
  "env": {
    "browser": true,
    "node": true,
    "es2021": true
  },
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  }
}
```

### Prettier Configuration
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### Naming Conventions
- Files: camelCase (JavaScript modules)
- Components: PascalCase (if React added later)
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- CSS: kebab-case for classes/IDs

## Version Control

### Git Workflow
- `main` - Production releases
- `develop` - Integration branch
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches

### Commit Messages
```
feat: add Roblox OAuth authentication
fix: resolve memory scanner crash
docs: update README with setup instructions
style: format code with Prettier
refactor: optimize log parser performance
test: add unit tests for token manager
chore: update dependencies
```

## Environment Details
- **Operating System:** Windows 11
- **IDE:** Visual Studio Code
- **Shell:** C:\Windows\system32\cmd.exe
- **Home Directory:** C:\Users\moham
- **Working Directory:** d:\RoChat

## Available CLI Tools
- git
- docker
- kubectl
- npm
- pip
- cargo
- curl
- python
- node
- code
- dotnet

## Future Considerations
- **TypeScript:** Consider migration for type safety
- **Framework:** React or Vue for complex UI (if needed)
- **State Management:** Redux or Zustand if state becomes complex
- **Real-time:** Socket.io for WebSocket support
- **Database:** Final choice between MongoDB and PostgreSQL
- **Testing:** Add E2E testing framework once core features complete
- **CI/CD:** GitHub Actions or GitLab CI for automated testing/deployment
