# Project Brief: RoChat

## Project Overview
**Project Name:** RoChat
**Status:** Structure Created - January 20, 2026
**Type:** Desktop Application (Electron) with Backend Server

## Core Requirements
- [x] Create project structure
- [ ] Implement Roblox process detection (log monitoring + memory scanning)
- [ ] Implement Roblox authentication (OAuth/cookie login)
- [ ] Build secure token management
- [ ] Create chat relay functionality
- [ ] Build desktop UI (login, chat, settings)
- [ ] Implement theme support
- [ ] Set up backend API with authentication middleware
- [ ] Configure database (MongoDB/PostgreSQL)

## Project Goals
- Create a desktop chat application for Roblox
- Provide secure authentication via Roblox OAuth/cookies
- Enable in-game chat detection and relay
- Maintain encrypted local storage for credentials
- Build scalable backend for chat routing
- Ensure clean, maintainable codebase

## Success Criteria
- Successfully detect Roblox game sessions
- Securely authenticate with Roblox
- Relay in-game chat to the application
- Persist user data securely
- Responsive and intuitive UI

## Technical Scope
- **Frontend:** Electron (Chromium + Node.js)
- **Backend:** Node.js/Express server
- **Database:** MongoDB or PostgreSQL
- **Storage:** electron-store (encrypted)
- **Platform:** Desktop (Windows initially)

## Target Users
Roblox players who want to:
- View in-game chat outside the game
- Have persistent chat history
- Use a dedicated desktop application for Roblox communication
- Manage multiple Roblox sessions

## Notes
Project structure has been established. All files are empty and ready for implementation.

## Questions Addressed
- **Type of chat:** Roblox in-game chat relay application
- **Platform:** Desktop application (Electron)
- **Target audience:** Roblox players
- **Key features:** Process detection, authentication, chat relay, secure storage
- **Technologies:** Electron, Node.js, MongoDB/PostgreSQL, electron-store
