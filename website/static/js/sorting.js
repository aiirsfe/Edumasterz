// Sorting functionality
let currentSortBy = 'date';
let currentSortOrder = 'desc';

document.addEventListener('DOMContentLoaded', function() {
    const sortBySelect = document.getElementById('sort-by');
    const sortOrderBtn = document.getElementById('sort-order');
    
    if (sortBySelect && sortOrderBtn) {
        // Load saved sort preferences
        const savedSortBy = localStorage.getItem('sortBy') || 'date';
        const savedSortOrder = localStorage.getItem('sortOrder') || 'desc';
        
        currentSortBy = savedSortBy;
        currentSortOrder = savedSortOrder;
        
        sortBySelect.value = savedSortBy;
        sortOrderBtn.setAttribute('data-order', savedSortOrder);
        updateSortOrderButton();
        
        // Event listeners
        sortBySelect.addEventListener('change', function() {
            currentSortBy = this.value;
            localStorage.setItem('sortBy', currentSortBy);
            refreshDirectoryWithSort();
        });
        
        sortOrderBtn.addEventListener('click', function() {
            currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
            this.setAttribute('data-order', currentSortOrder);
            localStorage.setItem('sortOrder', currentSortOrder);
            updateSortOrderButton();
            refreshDirectoryWithSort();
        });
    }
});

function updateSortOrderButton() {
    const sortOrderBtn = document.getElementById('sort-order');
    if (sortOrderBtn) {
        const title = currentSortOrder === 'desc' ? 'Descending' : 'Ascending';
        sortOrderBtn.setAttribute('title', title);
    }
}

async function refreshDirectoryWithSort() {
    let path = getCurrentPath();
    if (path === 'redirect') {
        return;
    }
    
    try {
        const auth = getFolderAuthFromPath();
        const data = { 
            'path': path, 
            'auth': auth,
            'sort_by': currentSortBy,
            'sort_order': currentSortOrder
        };
        
        const json = await postJson('/api/getDirectory', data);
        
        if (json.status === 'ok') {
            if (getCurrentPath().startsWith('/share')) {
                const sections = document.querySelector('.sidebar-menu').getElementsByTagName('a');
                
                if (removeSlash(json['auth_home_path']) === removeSlash(path.split('_')[1])) {
                    sections[0].setAttribute('class', 'selected-item');
                } else {
                    sections[0].setAttribute('class', 'unselected-item');
                }
                sections[0].href = `/?path=/share_${removeSlash(json['auth_home_path'])}&auth=${auth}`;
            }
            
            showDirectory(json['data']);
        } else {
            alert('404 Current Directory Not Found');
        }
    } catch (err) {
        console.log(err);
        alert('404 Current Directory Not Found');
    }
}

// Update the getCurrentDirectory function to use sorting
async function getCurrentDirectoryWithSort() {
    let path = getCurrentPath();
    if (path === 'redirect') {
        return;
    }
    
    try {
        const auth = getFolderAuthFromPath();
        const data = { 
            'path': path, 
            'auth': auth,
            'sort_by': currentSortBy,
            'sort_order': currentSortOrder
        };
        
        const json = await postJson('/api/getDirectory', data);
        
        if (json.status === 'ok') {
            if (getCurrentPath().startsWith('/share')) {
                const sections = document.querySelector('.sidebar-menu').getElementsByTagName('a');
                
                if (removeSlash(json['auth_home_path']) === removeSlash(path.split('_')[1])) {
                    sections[0].setAttribute('class', 'selected-item');
                } else {
                    sections[0].setAttribute('class', 'unselected-item');
                }
                sections[0].href = `/?path=/share_${removeSlash(json['auth_home_path'])}&auth=${auth}`;
            }
            
            showDirectory(json['data']);
        } else {
            alert('404 Current Directory Not Found');
        }
    } catch (err) {
        console.log(err);
        alert('404 Current Directory Not Found');
    }
}
