import { ipcRenderer } from 'electron';

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

class ArtworkRenderer {
    private container: HTMLElement;
    private searchInput: HTMLInputElement;
    private searchButton: HTMLButtonElement;
    private detailsContainer: HTMLElement;

    constructor() {
        this.container = document.getElementById('artworkContainer')!;
        this.detailsContainer = document.getElementById('artworkDetails')!;
        this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
        this.searchButton = document.getElementById('searchButton') as HTMLButtonElement;
        
        this.setupMCPListeners();
        this.setupUIHandlers();
    }

    private setupMCPListeners() {
        ipcRenderer.on('mcp-message', (event, message) => {
            switch (message.type) {
                case 'artworks_list':
                    this.displayArtworksList(message.artworks);
                    break;
                case 'artwork_details':
                    this.displayArtworkDetails(message.artwork);
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        });
    }

    private setupUIHandlers() {
        this.searchButton.addEventListener('click', () => {
            const query = this.searchInput.value.trim();
            if (query) {
                ipcRenderer.send('search-artworks', query);
            }
        });

        // Handle enter key in search input
        this.searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const query = this.searchInput.value.trim();
                if (query) {
                    ipcRenderer.send('search-artworks', query);
                }
            }
        });
    }

    private displayArtworksList(artworks: Artwork[]) {
        this.container.innerHTML = '';
        
        if (artworks.length === 0) {
            this.container.innerHTML = '<p>No artworks found</p>';
            return;
        }

        artworks.forEach(artwork => {
            const artworkElement = document.createElement('div');
            artworkElement.className = 'artwork-item';
            
            const imageHtml = artwork.imageUrl 
                ? `<img src="${artwork.imageUrl}" alt="${artwork.title}" class="artwork-thumbnail">` 
                : '';
            
            artworkElement.innerHTML = `
                ${imageHtml}
                <div class="artwork-info">
                    <h3>${artwork.title}</h3>
                    <p class="artist">${artwork.artist}</p>
                    ${artwork.description ? `<p class="description">${artwork.description}</p>` : ''}
                    <div class="artwork-actions">
                        <button onclick="requestArtworkDetails('${artwork.objectNumber}')">View Details</button>
                        ${artwork.imageUrl ? `<button onclick="openImageInBrowser('${artwork.imageUrl}')">Open Image</button>` : ''}
                    </div>
                </div>
            `;
            
            this.container.appendChild(artworkElement);
        });
    }

    private displayArtworkDetails(artwork: Artwork) {
        this.detailsContainer.innerHTML = `
            <div class="artwork-details">
                <h2>${artwork.title}</h2>
                <h3>${artwork.artist}</h3>
                ${artwork.imageUrl ? `
                    <div class="artwork-image">
                        <img src="${artwork.imageUrl}" alt="${artwork.title}">
                        <button onclick="openImageInBrowser('${artwork.imageUrl}')">Open in Browser</button>
                    </div>
                ` : ''}
                ${artwork.date ? `<p class="date">Date: ${artwork.date}</p>` : ''}
                ${artwork.description ? `<p class="description">${artwork.description}</p>` : ''}
                ${artwork.materials?.length ? `
                    <div class="materials">
                        <h4>Materials:</h4>
                        <ul>${artwork.materials.map(m => `<li>${m}</li>`).join('')}</ul>
                    </div>
                ` : ''}
                ${artwork.dimensions?.length ? `
                    <div class="dimensions">
                        <h4>Dimensions:</h4>
                        <ul>${artwork.dimensions.map(d => `<li>${d}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

// Initialize renderer
new ArtworkRenderer();

// Global functions for button click handlers
(window as any).requestArtworkDetails = (objectNumber: string) => {
    ipcRenderer.send('get-artwork-details', objectNumber);
};

(window as any).openImageInBrowser = (imageUrl: string) => {
    ipcRenderer.send('open-image-in-browser', imageUrl);
}; 