// Breadcrumb navigation functionality
let folderNameCache = {};

// Function to build breadcrumb navigation
async function buildBreadcrumb(currentPath) {
    const breadcrumbContainer = document.getElementById('breadcrumb');
    if (!breadcrumbContainer) return;

    // Clear existing breadcrumb
    breadcrumbContainer.innerHTML = '';

    // Handle special paths
    if (currentPath === '/trash') {
        breadcrumbContainer.innerHTML = `
            <div class="breadcrumb-item current">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Archive</span>
            </div>
        `;
        return;
    }

    if (currentPath.startsWith('/search_')) {
        const query = decodeURIComponent(currentPath.split('_')[1]);
        breadcrumbContainer.innerHTML = `
            <div class="breadcrumb-item current">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
                <span>Search: ${query}</span>
            </div>
        `;
        return;
    }

    if (currentPath.startsWith('/share_')) {
        const sharePath = currentPath.split('_')[1];
        await buildShareBreadcrumb(sharePath);
        return;
    }

    // Build normal path breadcrumb
    await buildNormalBreadcrumb(currentPath);
}

// Build breadcrumb for shared folders
async function buildShareBreadcrumb(sharePath) {
    const breadcrumbContainer = document.getElementById('breadcrumb');
    
    // Add shared folder indicator
    const sharedItem = document.createElement('div');
    sharedItem.className = 'breadcrumb-item';
    sharedItem.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16,6 12,2 8,6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        <span>Shared Content</span>
    `;
    breadcrumbContainer.appendChild(sharedItem);

    // Add separator
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '/';
    breadcrumbContainer.appendChild(separator);

    // Build the rest of the path
    await buildNormalBreadcrumb(sharePath, true);
}

// Build breadcrumb for normal paths
async function buildNormalBreadcrumb(currentPath, isShared = false) {
    const breadcrumbContainer = document.getElementById('breadcrumb');
    
    // Add home/root item if not shared
    if (!isShared) {
        const homeItem = document.createElement('div');
        homeItem.className = 'breadcrumb-item';
        homeItem.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
            <span>Learning Hub</span>
        `;
        
        if (currentPath === '/') {
            homeItem.classList.add('current');
        } else {
            homeItem.addEventListener('click', () => {
                window.location.href = '/?path=/';
            });
        }
        
        breadcrumbContainer.appendChild(homeItem);
    }

    // If we're at root, we're done
    if (currentPath === '/') return;

    // Split path and build breadcrumb items
    const pathParts = currentPath.split('/').filter(part => part !== '');
    let currentBuildPath = '/';

    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentBuildPath += part;

        // Add separator
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '/';
        breadcrumbContainer.appendChild(separator);

        // Get folder name
        const folderName = await getFolderName(currentBuildPath, part);
        
        // Create breadcrumb item
        const item = document.createElement('div');
        item.className = 'breadcrumb-item';
        item.innerHTML = `<span>${folderName}</span>`;
        item.title = folderName; // Full name on hover
        
        // If this is the current folder, mark it as current
        if (i === pathParts.length - 1) {
            item.classList.add('current');
        } else {
            // Make it clickable
            const clickPath = currentBuildPath;
            item.addEventListener('click', () => {
                const auth = getFolderAuthFromPath();
                let url = `/?path=${clickPath}`;
                if (auth && isShared) {
                    url += `&auth=${auth}`;
                }
                window.location.href = url;
            });
        }
        
        breadcrumbContainer.appendChild(item);
        currentBuildPath += '/';
    }
}

// Get folder name from cache or fetch from server
async function getFolderName(folderPath, folderId) {
    // Check cache first
    if (folderNameCache[folderId]) {
        return folderNameCache[folderId];
    }

    try {
        // Get parent directory to find folder name
        const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/')) || '/';
        const auth = getFolderAuthFromPath();
        
        const data = { 
            'path': parentPath, 
            'auth': auth,
            'sort_by': 'name',
            'sort_order': 'asc'
        };
        
        const json = await postJson('/api/getDirectory', data);
        
        if (json.status === 'ok') {
            const contents = json.data.contents;
            
            // Find the folder with matching ID
            for (const [key, item] of Object.entries(contents)) {
                if (item.type === 'folder' && item.id === folderId) {
                    folderNameCache[folderId] = item.name;
                    return item.name;
                }
            }
        }
    } catch (error) {
        console.error('Error fetching folder name:', error);
    }

    // Fallback to folder ID if name not found
    return folderId;
}

// Clear folder name cache when needed
function clearFolderNameCache() {
    folderNameCache = {};
}

// Update breadcrumb when directory changes
function updateBreadcrumb() {
    const currentPath = getCurrentPath();
    if (currentPath !== 'redirect') {
        buildBreadcrumb(currentPath);
    }
}

// Initialize breadcrumb on page load
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure other scripts are loaded
    setTimeout(updateBreadcrumb, 100);
});

// Export functions for use in other scripts
window.updateBreadcrumb = updateBreadcrumb;
window.clearFolderNameCache = clearFolderNameCache;