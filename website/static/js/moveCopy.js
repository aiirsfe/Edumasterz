// Move and Copy functionality
let selectedDestinationPath = null;
let currentMoveCopyItem = null;
let folderTreeData = null;

// Get folder tree from server
async function getFolderTree() {
    const data = {};
    const json = await postJson('/api/getFolderTree', data);
    if (json.status === 'ok') {
        return json.data;
    } else {
        throw new Error('Failed to get folder tree');
    }
}

// Render folder tree in modal with expand/collapse functionality
function renderFolderTree(tree, container, level = 0, excludePath = null, isExpanded = true) {
    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    folderItem.setAttribute('data-level', level);
    
    // Add indentation for nested folders
    if (level > 0) {
        folderItem.style.paddingLeft = `${level * 20 + 10}px`;
    } else {
        folderItem.style.paddingLeft = '10px';
    }
    
    // Disable selection of the source folder and its children for move operations
    const isDisabled = excludePath && (tree.path === excludePath || tree.path.startsWith(excludePath + '/'));
    if (isDisabled) {
        folderItem.classList.add('disabled');
    }
    
    // Create expand/collapse button for folders with children
    const hasChildren = tree.children && tree.children.length > 0;
    const expandButton = hasChildren ? `
        <span class="folder-expand-btn" data-expanded="${isExpanded}">
            <svg class="expand-icon" viewBox="0 0 24 24" width="12" height="12">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
        </span>
    ` : '<span class="folder-expand-btn-spacer"></span>';
    
    folderItem.innerHTML = `
        ${expandButton}
        <svg class="folder-icon" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
        </svg>
        <span class="folder-name">${tree.name === '/' ? 'Root' : tree.name}</span>
    `;
    
    folderItem.setAttribute('data-path', tree.path);
    
    // Add click handler for folder selection (not for expand button)
    if (!isDisabled) {
        const folderNameSpan = folderItem.querySelector('.folder-name');
        const folderIcon = folderItem.querySelector('.folder-icon');
        
        [folderNameSpan, folderIcon].forEach(element => {
            element.addEventListener('click', function(e) {
                e.stopPropagation();
                
                // Remove previous selection
                container.querySelectorAll('.folder-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Select current item
                folderItem.classList.add('selected');
                selectedDestinationPath = folderItem.getAttribute('data-path');
                
                // Update selection display
                updateSelectionDisplay(tree.name === '/' ? 'Root' : tree.name, tree.path);
            });
        });
    }
    
    container.appendChild(folderItem);
    
    // Create container for children
    if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        childrenContainer.style.display = isExpanded ? 'block' : 'none';
        
        // Add expand/collapse functionality
        const expandBtn = folderItem.querySelector('.folder-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const isCurrentlyExpanded = this.getAttribute('data-expanded') === 'true';
                const newExpandedState = !isCurrentlyExpanded;
                
                this.setAttribute('data-expanded', newExpandedState);
                childrenContainer.style.display = newExpandedState ? 'block' : 'none';
                
                // Rotate the expand icon
                const icon = this.querySelector('.expand-icon');
                if (icon) {
                    icon.style.transform = newExpandedState ? 'rotate(90deg)' : 'rotate(0deg)';
                }
            });
        }
        
        // Render children
        tree.children.forEach(child => {
            renderFolderTree(child, childrenContainer, level + 1, excludePath, false); // Start collapsed for better UX
        });
        
        container.appendChild(childrenContainer);
    }
}

// Update selection display
function updateSelectionDisplay(folderName, folderPath) {
    const selectionDisplay = document.getElementById('selection-display');
    if (selectionDisplay) {
        selectionDisplay.innerHTML = `
            <div class="selected-folder-info">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                </svg>
                <span>Selected: <strong>${folderName}</strong></span>
            </div>
            <div class="selected-folder-path">${folderPath}</div>
        `;
    }
}

// Expand all folders function
function expandAllFolders() {
    const expandButtons = document.querySelectorAll('.folder-expand-btn[data-expanded="false"]');
    expandButtons.forEach(btn => {
        btn.click();
    });
}

// Collapse all folders function
function collapseAllFolders() {
    const expandButtons = document.querySelectorAll('.folder-expand-btn[data-expanded="true"]');
    expandButtons.forEach(btn => {
        btn.click();
    });
}

// Search folders function
function searchFolders(searchTerm) {
    const allFolders = document.querySelectorAll('.folder-item');
    const searchLower = searchTerm.toLowerCase();
    
    allFolders.forEach(folder => {
        const folderName = folder.querySelector('.folder-name').textContent.toLowerCase();
        const shouldShow = folderName.includes(searchLower) || searchTerm === '';
        
        folder.style.display = shouldShow ? 'block' : 'none';
        
        // If folder matches, show all its parents
        if (shouldShow && searchTerm !== '') {
            let parent = folder.parentElement;
            while (parent && parent.classList.contains('folder-children')) {
                parent.style.display = 'block';
                const parentFolder = parent.previousElementSibling;
                if (parentFolder && parentFolder.classList.contains('folder-item')) {
                    parentFolder.style.display = 'block';
                    // Expand parent
                    const expandBtn = parentFolder.querySelector('.folder-expand-btn');
                    if (expandBtn && expandBtn.getAttribute('data-expanded') === 'false') {
                        expandBtn.click();
                    }
                }
                parent = parent.parentElement;
            }
        }
    });
}

// Show move/copy modal
async function showMoveCopyModal(itemPath, itemName, operation = 'move') {
    try {
        currentMoveCopyItem = { path: itemPath, name: itemName };
        selectedDestinationPath = null;
        
        // Get folder tree
        folderTreeData = await getFolderTree();
        
        // Update modal title
        const title = operation === 'move' ? 'Move Item' : 'Copy Item';
        document.getElementById('move-copy-title').textContent = title;
        
        // Clear and populate folder tree
        const treeContainer = document.getElementById('folder-tree');
        treeContainer.innerHTML = '';
        
        // Add search and controls
        const controlsHtml = `
            <div class="folder-tree-controls">
                <div class="folder-search-container">
                    <input type="text" id="folder-search" placeholder="Search folders..." class="folder-search-input">
                    <button type="button" id="clear-search" class="clear-search-btn">×</button>
                </div>
                <div class="folder-tree-actions">
                    <button type="button" id="expand-all" class="tree-action-btn">Expand All</button>
                    <button type="button" id="collapse-all" class="tree-action-btn">Collapse All</button>
                </div>
            </div>
            <div id="selection-display" class="selection-display"></div>
            <div class="folder-tree-content" id="folder-tree-content"></div>
        `;
        
        treeContainer.innerHTML = controlsHtml;
        
        const treeContent = document.getElementById('folder-tree-content');
        
        // Exclude the source folder path for move operations to prevent moving into itself
        const excludePath = operation === 'move' ? itemPath : null;
        renderFolderTree(folderTreeData, treeContent, 0, excludePath, true);
        
        // Add event listeners for controls
        document.getElementById('folder-search').addEventListener('input', function(e) {
            searchFolders(e.target.value);
        });
        
        document.getElementById('clear-search').addEventListener('click', function() {
            document.getElementById('folder-search').value = '';
            searchFolders('');
        });
        
        document.getElementById('expand-all').addEventListener('click', expandAllFolders);
        document.getElementById('collapse-all').addEventListener('click', collapseAllFolders);
        
        // Show/hide appropriate buttons
        const moveBtn = document.getElementById('move-item-btn');
        const copyBtn = document.getElementById('copy-item-btn');
        
        if (operation === 'move') {
            moveBtn.style.display = 'block';
            copyBtn.style.display = 'none';
        } else {
            moveBtn.style.display = 'none';
            copyBtn.style.display = 'block';
        }
        
        // Show modal
        document.getElementById('bg-blur').style.zIndex = '2';
        document.getElementById('bg-blur').style.opacity = '0.1';
        document.getElementById('move-copy-modal').style.zIndex = '3';
        document.getElementById('move-copy-modal').style.opacity = '1';
        
    } catch (error) {
        alert('Failed to load folder tree: ' + error.message);
    }
}

// Close move/copy modal
function closeMoveCopyModal() {
    document.getElementById('bg-blur').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('bg-blur').style.zIndex = '-1';
    }, 300);
    document.getElementById('move-copy-modal').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('move-copy-modal').style.zIndex = '-1';
    }, 300);
    
    selectedDestinationPath = null;
    currentMoveCopyItem = null;
}

// Move item
async function moveItem() {
    if (!selectedDestinationPath || !currentMoveCopyItem) {
        alert('Please select a destination folder');
        return;
    }
    
    try {
        const data = {
            source_path: currentMoveCopyItem.path,
            destination_path: selectedDestinationPath
        };
        
        const response = await postJson('/api/moveFileFolder', data);
        
        if (response.status === 'ok') {
            alert('Item moved successfully');
            closeMoveCopyModal();
            window.location.reload();
        } else {
            alert('Failed to move item: ' + response.status);
        }
    } catch (error) {
        alert('Error moving item: ' + error.message);
    }
}

// Copy item
async function copyItem() {
    if (!selectedDestinationPath || !currentMoveCopyItem) {
        alert('Please select a destination folder');
        return;
    }
    
    try {
        const data = {
            source_path: currentMoveCopyItem.path,
            destination_path: selectedDestinationPath
        };
        
        const response = await postJson('/api/copyFileFolder', data);
        
        if (response.status === 'ok') {
            alert('Item copied successfully');
            closeMoveCopyModal();
            window.location.reload();
        } else {
            alert('Failed to copy item: ' + response.status);
        }
    } catch (error) {
        alert('Error copying item: ' + error.message);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Cancel button
    document.getElementById('move-copy-cancel').addEventListener('click', closeMoveCopyModal);
    
    // Move button
    document.getElementById('move-item-btn').addEventListener('click', moveItem);
    
    // Copy button
    document.getElementById('copy-item-btn').addEventListener('click', copyItem);
});

// Functions to be called from file click handler
function showMoveModal(itemPath, itemName) {
    showMoveCopyModal(itemPath, itemName, 'move');
}

function showCopyModal(itemPath, itemName) {
    showMoveCopyModal(itemPath, itemName, 'copy');
}