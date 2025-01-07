# Rijksmuseum MCP Client

An Electron-based client application that connects to the Rijksmuseum MCP server to explore the museum's art collection.

## Features

- Search artworks in the Rijksmuseum collection
- View detailed artwork information
- Open high-resolution images in browser
- Modern, responsive user interface

## Prerequisites

- Node.js v18 or higher
- npm v8 or higher
- A Rijksmuseum API key

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd electron-mcp-client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Rijksmuseum API key.

4. Build and start the application:
   ```bash
   npm run build
   npm start
   ```

## Development

- `npm run dev` - Start the application in development mode with hot reload
- `npm run build` - Build the application
- `npm run dist` - Create distributable packages

## License

ISC 