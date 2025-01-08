# Electron MCP Client for Rijksmuseum API

An Electron-based desktop application that integrates with the Rijksmuseum API using the Model Context Protocol (MCP). This client enables AI-powered interactions with the Rijksmuseum's art collection through a chat interface.

## Features

- 🎨 Search and explore Rijksmuseum's art collection
- 💬 Chat interface with AI-powered responses
- 🖼️ Image display support for artworks
- 🔄 Real-time API integration
- 🛠️ Built with Electron and TypeScript
- 🤖 Model Context Protocol (MCP) integration

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- Git
- [Rijksmuseum MCP Server](https://github.com/r-huijts/rijksmuseum-mcp) - Required for API integration

## Dependencies

This client is designed to work with the [Rijksmuseum MCP Server](https://github.com/r-huijts/rijksmuseum-mcp.git). You'll need to:

1. Clone and set up the Rijksmuseum MCP Server:
```bash
git clone https://github.com/r-huijts/rijksmuseum-mcp.git
cd rijksmuseum-mcp
npm install
npm run build
```

2. Configure the server path in your `.env` file (see Environment Variables section)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd electron-mcp-client
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your API keys:
```
RIJKSMUSEUM_API_KEY=your-rijksmuseum-api-key
MCP_SERVER_PATH=/path/to/rijksmuseum-mcp/build/index.js
```

## Development

Start the development server:
```bash
npm run dev
```

Build the application:
```bash
npm run build
```

## Project Structure

```
electron-mcp-client/
├── src/               # Source code
│   ├── main.ts       # Main process code
│   └── index.html    # Renderer process entry
├── dist/             # Build output
├── .env.example      # Environment variables example
└── package.json      # Project configuration
```

## Environment Variables

- `RIJKSMUSEUM_API_KEY`: Your Rijksmuseum API key
- `MCP_SERVER_PATH`: Path to the Rijksmuseum MCP server executable

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Rijksmuseum API](https://data.rijksmuseum.nl/object-metadata/api/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Electron](https://www.electronjs.org/)
- [Rijksmuseum MCP Server](https://github.com/r-huijts/rijksmuseum-mcp)