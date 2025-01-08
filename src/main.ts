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
import { 
  CallToolRequest, 
  CallToolResultSchema, 
  ListToolsResult, 
  ListToolsResultSchema 
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Define interfaces and schemas first
interface Artwork {
  id: string;
  objectNumber: string;
  title: string;
  artist: string;
  imageUrl?: string;
  description?: string;
  date?: string;
  materials?: string[];
  dimensions?: string[];
}

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
});

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, unknown>;
  };
}

// Then the MCPClient class
class MCPClient {
  private client: Client;
  private llm: LLMService;
  private recentArtworks: Artwork[] = [];
  private availableTools: MCPTool[] = [];
  
  constructor() {
    this.client = new Client({
      name: "rijksmuseum-electron-client",
      version: "1.0.0"
    }, {
      capabilities: {
        protocols: ['mcp1'],
        tools: {}  // Simplified capabilities
      }
    });

    // Initialize LLM service based on environment variables
    const provider = process.env.LLM_PROVIDER as 'ollama' | 'claude' || 'ollama';
    this.llm = createLLMService(provider, {
      model: process.env.OLLAMA_MODEL || 'mistral',
      apiKey: process.env.CLAUDE_API_KEY
    });

    this.initializeClient().catch(error => {
      console.error('Failed to initialize client:', error);
      throw error;
    });
  }

  private async initializeClient() {
    try {
      if (!process.env.MCP_SERVER_PATH) {
        throw new Error('MCP_SERVER_PATH environment variable is not set');
      }

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [process.env.MCP_SERVER_PATH],
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1'
        }
      });
      
      await this.client.connect(transport);
      console.log('Connected to Rijksmuseum MCP server');
      
      // Get tools using the correct method and schema
      try {
        const toolsResponse = await this.client.request(
          { method: "tools/list" },
          ListToolsResultSchema
        );
        
        this.availableTools = toolsResponse.tools;
        console.log('Available tools:', this.availableTools);
      } catch (error) {
        console.error('Failed to get tools:', error);
        throw error;  // Don't use fallback tools, fail fast
      }
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  private async callTool(name: string, args: any, retryCount = 0): Promise<any> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second

    try {
        console.log(`🛠️ Using tool: ${name} with arguments:`, args);

        // Log the available tools and their schemas
        console.log('Available tools:', this.availableTools);
        const toolSchema = this.availableTools.find(t => t.name === name)?.inputSchema;
        console.log(`Tool schema for ${name}:`, toolSchema);

        const request: CallToolRequest = {
            method: "tools/call",
            params: {
                name: name,
                arguments: args
            }
        };

        console.log('📤 Sending request:', JSON.stringify(request, null, 2));
        
        const response = await this.client.request(
            request,
            CallToolResultSchema
        );

        console.log('📥 Received response:', JSON.stringify(response, null, 2));
        
        // Extract text content from response
        if (response.content && Array.isArray(response.content)) {
            const textContent = response.content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
                
            if (textContent) {
                try {
                    return JSON.parse(textContent);
                } catch (parseError) {
                    console.error('Failed to parse response:', parseError);
                    return textContent; // Return raw text if not JSON
                }
            }
        }
        
        throw new Error('Invalid response format from server');
    } catch (error) {
        console.error(`Failed to call tool ${name}:`, error);
        
        // Log detailed error information
        if (error instanceof Error) {
            const errorDetails = {
                name: error.name,
                message: error.message,
                stack: error.stack,
                cause: (error as any).cause,
                response: (error as any).response,
                status: (error as any).status,
                statusText: (error as any).statusText
            };
            console.error('Error details:', errorDetails);

            // Check if it's a 500 error and we can retry
            if (errorDetails.status === 500 && retryCount < MAX_RETRIES) {
                console.log(`Retrying tool call (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return this.callTool(name, args, retryCount + 1);
            }

            // If it's a 500 error but we're out of retries, throw a more specific error
            if (errorDetails.status === 500) {
                throw new Error(`Server error (500) after ${MAX_RETRIES} retries. The Rijksmuseum API might be experiencing issues.`);
            }
        }
        
        throw error;
    }
  }

  public async searchArtworks(query: string) {
    try {
      const response = await this.callTool('search_artwork', { 
        query,
        pageSize: 10
      });
      
      // Store recent artworks
      this.recentArtworks = response;
      
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
      const response = await this.callTool('get_artwork_details', { 
        objectNumber 
      });
      
      // Update recent artworks with detailed info
      const index = this.recentArtworks.findIndex(a => a.objectNumber === objectNumber);
      if (index !== -1) {
        this.recentArtworks[index] = response;
      } else {
        this.recentArtworks.push(response);
      }
      
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
      await this.callTool('open_image_in_browser', { imageUrl });
    } catch (error) {
      console.error('Failed to open image in browser:', error);
    }
  }

  private async extractAndExecuteActions(message: string): Promise<string | undefined> {
    const lowerMessage = message.toLowerCase();

    // Check for direct image requests
    const imageMatch = lowerMessage.match(/(?:show|open|view|display)\s+(?:the\s+)?image\s+(?:of\s+)?(.+)/i);
    if (imageMatch) {
      const artworkName = imageMatch[1];
      const artwork = this.recentArtworks.find(a => 
        a.title.toLowerCase().includes(artworkName) || 
        a.artist.toLowerCase().includes(artworkName)
      );
      
      if (artwork?.imageUrl) {
        await this.openImageInBrowser(artwork.imageUrl);
        return `I've opened the image of "${artwork.title}" by ${artwork.artist} in your browser.`;
      }
    }

    // Check for artwork detail requests
    const detailsMatch = lowerMessage.match(/(?:tell|show|give)\s+(?:me\s+)?(?:more\s+)?(?:details|information)\s+(?:about\s+)?(.+)/i);
    if (detailsMatch) {
      const artworkName = detailsMatch[1];
      const artwork = this.recentArtworks.find(a => 
        a.title.toLowerCase().includes(artworkName) || 
        a.artist.toLowerCase().includes(artworkName)
      );
      
      if (artwork) {
        await this.getArtworkDetails(artwork.objectNumber);
        return `I've retrieved the details for "${artwork.title}" by ${artwork.artist}.`;
      }
    }

    return undefined;
  }

  public async processMessage(message: string) {
    try {
      console.log('Processing message:', message);
      
      // First try to execute any direct actions
      const actionResult = await this.extractAndExecuteActions(message);
      
      // Get additional context
      const context = await this.getRelevantContext(message);

      // If we got an error context, send that directly to the user
      if (context?.includes("apologize") || context?.includes("encountered an error")) {
        mainWindow?.webContents.send('chat-token', {
          type: 'assistant',
          content: context
        });
        mainWindow?.webContents.send('chat-complete', {
          type: 'assistant',
          content: context
        });
        return;
      }
      
      // Only proceed with LLM if we have context or it's a general query
      const fullContext = `
Assistant: I am an AI assistant with access to the Rijksmuseum's art collection. When showing artwork details, I should include both the artwork information and its image URLs directly in my response without any prefixes or labels.
${actionResult ? `\nLast action: ${actionResult}` : ''}
${context ? `\nContext from Rijksmuseum: ${context}` : ''}

User's message: ${message}

I should respond to the user's message using the context above when relevant. If there are image URLs in the context, I should include them in my response exactly as they appear, without adding any labels or prefixes like "Image URL:".`;
      
      console.log('Full context being sent to LLM:', fullContext);
      
      // Use streaming with combined context
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
            console.log('Complete LLM response:', fullResponse);
            mainWindow?.webContents.send('chat-complete', {
              type: 'assistant',
              content: fullResponse
            });
          },
          onError: (error) => {
            console.error('LLM error:', error);
            mainWindow?.webContents.send('chat-error', {
              error: error.message
            });
          }
        },
        fullContext
      );
    } catch (error) {
      console.error('Failed to process message:', error);
      mainWindow?.webContents.send('chat-error', {
        error: 'Failed to process message'
      });
    }
  }

  private async getRelevantContext(message: string): Promise<string | undefined> {
    try {
      // First check if any tool matches the message intent
      for (const tool of this.availableTools) {
        console.log('🔍 Checking tool:', tool.name);
        if (this.matchesToolIntent(message, tool)) {
          console.log('✅ Tool matched:', tool.name);
          const args = this.extractToolArgs(message, tool);
          console.log('📝 Extracted args:', args);
          
          try {
            const result = await this.callTool(tool.name, args);
            console.log('📊 Tool result:', result);
            
            // Format the result based on the tool
            switch (tool.name) {
              case 'search_artwork':
                return this.formatArtworkSearchResult(result);
              case 'get_artwork_details':
                return this.formatArtworkDetails(result);
              case 'get_artist_timeline':
                return this.formatArtistTimeline(result);
              default:
                return `Result from ${tool.name}: ${JSON.stringify(result, null, 2)}`;
            }
          } catch (error) {
            console.error(`Failed to execute tool ${tool.name}:`, error);
            return `I apologize, but I couldn't fetch the current, accurate information from the Rijksmuseum API at the moment. I can share what I know about this topic from my general knowledge, but please note that this information might not be completely up-to-date or accurate. Would you like me to proceed with what I know?`;
          }
        }
      }

      console.log('❌ No matching tool found for message:', message);
      return undefined;
    } catch (error) {
      console.error('Failed to get context:', error);
      return `I encountered an error while trying to fetch information from the Rijksmuseum. Would you like me to share what I know about this topic from my general knowledge?`;
    }
  }

  private matchesToolIntent(message: string, tool: { name: string; description?: string }): boolean {
    const msg = message.toLowerCase();
    
    // Map of tool names to trigger phrases
    const toolTriggers: Record<string, string[]> = {
      'search_artwork': ['search', 'find', 'look for', 'show me', 'info on', 'information on', 'tell me about'],
      'get_artwork_details': ['details', 'tell me about', 'information about', 'more about'],
      'get_artwork_image': ['show image', 'display image', 'view image'],
      'get_user_sets': ['show collections', 'user collections', 'sets'],
      'get_user_set_details': ['collection details', 'set details'],
      'open_image_in_browser': ['open image', 'open in browser'],
      'get_artist_timeline': ['timeline', 'chronological', 'artist history']
    };

    const triggers = toolTriggers[tool.name] || [];
    const matches = triggers.some(trigger => msg.includes(trigger));
    console.log(`🎯 Tool ${tool.name} ${matches ? 'matches' : 'does not match'} message: "${message}"`);
    console.log(`   Triggers checked:`, triggers);
    return matches;
  }

  private extractToolArgs(message: string, tool: { name: string; description?: string }): any {
    const msg = message.toLowerCase();
    
    switch (tool.name) {
      case 'search_artwork':
        // Clean up the query by removing all trigger phrases and quotes
        const searchQuery = message
          .toLowerCase()
          .replace(/^(?:search|find|show|display|get)\s*/i, '')
          .replace(/(?:tell me about|info on|information on|information about)\s*/gi, '')
          .replace(/["']/g, '')
          .replace(/\s+/g, ' ')  // normalize spaces
          .trim();
        
        console.log('🔍 Cleaned search query:', searchQuery);
        
        // Try to extract the object number if it matches the format (e.g., SK-C-5)
        const objectNumberMatch = searchQuery.match(/[A-Z]+-[A-Z]-\d+/i);
        if (objectNumberMatch) {
          console.log('📝 Found object number:', objectNumberMatch[0]);
          return {
            query: objectNumberMatch[0],
            pageSize: 10
          };
        }
        
        return {
          query: searchQuery,
          pageSize: 10,
          imgonly: true,  // Only return results with images
          s: 'relevance'  // Sort by relevance
        };
        
      case 'get_artwork_details':
        const detailsMatch = msg.match(/(?:details|about|information)\s+(?:about\s+)?(.+)/i);
        const detailsQuery = detailsMatch ? 
          detailsMatch[1].replace(/["']/g, '').trim() : 
          message.replace(/["']/g, '').trim();
        return {
          objectNumber: detailsQuery
        };
        
      case 'get_artwork_image':
        const imageMatch = msg.match(/image\s+(?:of\s+)?(.+)/i);
        return {
          objectNumber: imageMatch ? imageMatch[1] : message
        };
        
      case 'get_user_sets':
        return {
          page: 0,
          pageSize: 10
        };
        
      case 'get_user_set_details':
        const setMatch = msg.match(/collection\s+(?:details\s+)?(.+)/i);
        return {
          setId: setMatch ? setMatch[1] : message
        };
        
      case 'get_artist_timeline':
        const artistMatch = msg.match(/timeline\s+(?:of\s+)?(.+)/i) || 
                           msg.match(/(?:show|get)\s+(.+?)(?:\s+timeline)/i);
        return {
          artist: artistMatch ? artistMatch[1] : message,
          maxWorks: 10
        };
        
      case 'open_image_in_browser':
        return {
          imageUrl: message
        };
        
      default:
        return {};
    }
  }

  private formatArtworkDetails(result: any): string {
    if (!result) return 'Artwork details not found';
    
    const imageUrl = result.webImage?.url;
    return `Here are the details of the artwork:

Title: ${result.title}
Artist: ${result.principalOrFirstMaker || result.artist}
${result.longTitle ? `Full Title: ${result.longTitle}\n` : ''}
${result.description ? `Description: ${result.description}\n` : ''}
${result.materials?.length ? `Materials: ${result.materials.join(', ')}\n` : ''}
${result.dimensions?.length ? `Dimensions: ${result.dimensions.join(', ')}\n` : ''}
${imageUrl ? `${imageUrl}` : ''}

You can view more details on the Rijksmuseum website: ${result.links?.web}`;
  }

  private formatArtistTimeline(result: any): string {
    if (!result || !Array.isArray(result)) return 'No timeline available';
    
    return `Artist Timeline:\n\n${result.map(item =>
      `${item.date}: ${item.title}`
    ).join('\n')}`;
  }

  private formatArtworkSearchResult(result: any): string {
    if (!result || !Array.isArray(result.artworks) || result.artworks.length === 0) {
      return 'No artworks found';
    }
    
    return `I found ${result.artworks.length} artworks by ${result.artworks[0].principalOrFirstMaker} in the Rijksmuseum collection:

${result.artworks.map((artwork: { 
  title: string; 
  objectNumber: string; 
  longTitle: string; 
  productionPlaces?: string[];
  webImage?: {
    url: string;
  }
}, index: number) => 
      `${index + 1}. "${artwork.title}" (${artwork.objectNumber})
         Created: ${artwork.longTitle.split(', ').pop()}
         ${artwork.productionPlaces?.length ? `Location: ${artwork.productionPlaces.join(', ')}` : ''}
         ${artwork.webImage?.url ? `\n${artwork.webImage.url}` : ''}`
    ).join('\n\n')}

I can provide more details about any of these artworks if you're interested. Just ask about a specific artwork by its title or number.`;
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
    fullscreen: true,
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

// Initialize MCP client
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