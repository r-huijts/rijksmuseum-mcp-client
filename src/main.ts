import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import isDev from 'electron-is-dev';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import * as dotenv from 'dotenv';
import { createLLMService } from './services/llm/factory.js';
import type { LLMService } from './services/llm/types.js';
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Define the schemas for the Rijksmuseum API responses
const ArtworkSchema = z.object({
  id: z.string(),
  objectNumber: z.string(),
  title: z.string(),
  artist: z.string(),
  imageUrl: z.string().optional(),
  description: z.string().optional()
});

const ArtworksListSchema = z.array(ArtworkSchema);

const ArtworkDetailsSchema = ArtworkSchema.extend({
  date: z.string().optional(),
  materials: z.array(z.string()).optional(),
  dimensions: z.array(z.string()).optional(),
  // Add other detailed fields as needed
});

// MCP Client Implementation
class MCPClient {
  private client: Client;
  private llm: LLMService;
  
  constructor() {
    this.client = new Client({
      name: "rijksmuseum-electron-client",
      version: "1.0.0"
    }, {
      capabilities: {
        protocols: ['mcp1']
      }
    });

    // Initialize LLM service based on environment variables
    const provider = process.env.LLM_PROVIDER as 'ollama' | 'claude' || 'ollama';
    this.llm = createLLMService(provider, {
      model: process.env.OLLAMA_MODEL || 'mistral',
      apiKey: process.env.CLAUDE_API_KEY
    });

    this.initializeClient();
  }

  private async initializeClient() {
    try {
      if (!process.env.RIJKSMUSEUM_API_KEY) {
        throw new Error('RIJKSMUSEUM_API_KEY environment variable is not set');
      }

      if (!process.env.MCP_SERVER_PATH) {
        throw new Error('MCP_SERVER_PATH environment variable is not set');
      }

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [process.env.MCP_SERVER_PATH],
        env: {
          RIJKSMUSEUM_API_KEY: process.env.RIJKSMUSEUM_API_KEY
        }
      });
      
      await this.client.connect(transport);
      console.log('Connected to Rijksmuseum MCP server');
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
    }
  }

  public async searchArtworks(query: string) {
    try {
      const response = await this.client.request(
        {
          method: "search_artwork",
          params: { query }
        },
        ArtworksListSchema
      );
      
      mainWindow?.webContents.send('mcp-message', {
        type: 'artworks_list',
        artworks: response
      });
    } catch (error) {
      console.error('Failed to search artworks:', error);
    }
  }

  public async getArtworkDetails(objectNumber: string) {
    try {
      const response = await this.client.request(
        {
          method: "get_artwork_details",
          params: { objectNumber }
        },
        ArtworkDetailsSchema
      );
      
      mainWindow?.webContents.send('mcp-message', {
        type: 'artwork_details',
        artwork: response
      });
    } catch (error) {
      console.error('Failed to get artwork details:', error);
    }
  }

  public async openImageInBrowser(imageUrl: string) {
    try {
      await this.client.request(
        {
          method: "open_image_in_browser",
          params: { imageUrl }
        },
        z.object({ success: z.boolean() })
      );
    } catch (error) {
      console.error('Failed to open image in browser:', error);
    }
  }

  public async processMessage(message: string) {
    try {
      console.log('Processing message:', message);
      
      const context = await this.getRelevantContext(message);
      console.log('Got context:', context);
      
      // Use streaming
      await this.llm.streamChat(
        message,
        {
          onToken: (token) => {
            mainWindow?.webContents.send('chat-token', {
              type: 'assistant',
              content: token
            });
          },
          onComplete: (fullResponse) => {
            mainWindow?.webContents.send('chat-complete', {
              type: 'assistant',
              content: fullResponse
            });
          },
          onError: (error) => {
            mainWindow?.webContents.send('chat-error', {
              error: error.message
            });
          }
        },
        context
      );
    } catch (error) {
      console.error('Failed to process message:', error);
      mainWindow?.webContents.send('chat-error', {
        error: 'Failed to process message'
      });
    }
  }

  private async getRelevantContext(message: string) {
    // This method would interact with your MCP server to get relevant context
    // based on the user's message
    try {
      const response = await this.client.request(
        {
          method: "get_context",
          params: { message }
        },
        z.object({ context: z.string() })
      );
      return response.context;
    } catch (error) {
      console.error('Failed to get context:', error);
      return undefined;
    }
  }

  public clearChatHistory() {
    this.llm.clearHistory();
  }
}

// Create window and set up app lifecycle
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Only for development
      allowRunningInsecureContent: true // Only for development
    }
  });

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, './index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const mcpClient = new MCPClient();

// Handle IPC messages from renderer
ipcMain.on('search-artworks', (event, query: string) => {
  mcpClient.searchArtworks(query);
});

ipcMain.on('get-artwork-details', (event, objectNumber: string) => {
  mcpClient.getArtworkDetails(objectNumber);
});

ipcMain.on('open-image-in-browser', (event, imageUrl: string) => {
  mcpClient.openImageInBrowser(imageUrl);
});

ipcMain.on('chat-message', async (event, message: string) => {
  console.log('Main process received message:', message);
  
  try {
    await mcpClient.processMessage(message);
  } catch (error) {
    console.error('Error processing message:', error);
    event.reply('chat-response', {
      type: 'assistant',
      content: 'Sorry, I encountered an error processing your message.'
    });
  }
});

ipcMain.on('clear-chat', () => {
  mcpClient.clearChatHistory();
}); 