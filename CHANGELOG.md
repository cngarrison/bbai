# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]



## [0.0.7-alpha] - 2024-08-05

### Changed

- Added websocket support for live updates of conversation logging
- Added event manager
- Added manager for project editors
- Improved typescript type handling
- Refactored terminal console handling


## [0.0.6-alpha] - 2024-08-03

### Changed

- Move tools to a ToolManager class
- Migrate each tool to dedicated class
- Fixes for gathering ProjectDetails
- Improved conversation logging
- More reliable file hydration in messages
- Better tool input validation and handling


## [0.0.5a-alpha] - 2024-08-01

### Changed

- Hot fix for multiple tool result blocks
- Hot fix for undefined usage tokens


## [0.0.5-alpha] - 2024-08-01

### Changed

- Added terminal support for multi-turn conversations
- Applied formatting to chat logs for easier reading


## [0.0.4-alpha] - 2024-07-28

### Changed

- Add workflow to automatically create a Github release and deploy to package managers
- Implement git commit after patching
- Create a class for a "fast" conversation with haiku (for git commit messages, semantic conversation titles, etc.)
- Use haiku to create semantic names for conversations based on initial prompts
- Use haiku to write commit messages


## [0.0.3-alpha] - 2024-07-27

### Changed

- Add support for Homebrew on macOS
- Lots of refactoring improvements for 
  - tool use
  - conversations
  - stateless requests (data persists across API restarts)
  - file searching, adding to conversation, and patching
  - project editor to handle different data sources (only local filesystem so far)


## [0.0.2-alpha] - 2024-07-23

### Added
- Initial project setup
- Basic CLI and API functionality
- File handling capabilities
- Conversation management features


## [0.0.1-alpha] - 2023-07-20
- Initial alpha release
