// Api Fuctions
async function postJson(url, data) {
    data['password'] = getPassword()
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    return await response.json()
}

document.getElementById('pass-login').addEventListener('click', async () => {
    const password = document.getElementById('auth-pass').value
    const data = { 'pass': password }
    const json = await postJson('/api/checkPassword', data)
    if (json.status === 'ok') {
        localStorage.setItem('password', password)
        alert('Logged In Successfully')
        window.location.reload()
    }
    else {
        alert('Wrong Password')
    }

})

async function getCurrentDirectory() {
    let path = getCurrentPath()
    if (path === 'redirect') {
        return
    }
    try {
        const auth = getFolderAuthFromPath()
        console.log(path)

        const data = { 'path': path, 'auth': auth }
        const json = await postJson('/api/getDirectory', data)

        if (json.status === 'ok') {
            if (getCurrentPath().startsWith('/share')) {
                const sections = document.querySelector('.sidebar-menu').getElementsByTagName('a')
                console.log(path)

                if (removeSlash(json['auth_home_path']) === removeSlash(path.split('_')[1])) {
                    sections[0].setAttribute('class', 'selected-item')

                } else {
                    sections[0].setAttribute('class', 'unselected-item')
                }
                sections[0].href = `/?path=/share_${removeSlash(json['auth_home_path'])}&auth=${auth}`
                console.log(`/?path=/share_${removeSlash(json['auth_home_path'])}&auth=${auth}`)
            }

            console.log(json)
            showDirectory(json['data'])
        } else {
            alert('404 Current Directory Not Found')
        }
    }
    catch (err) {
        console.log(err)
        alert('404 Current Directory Not Found')
    }
}

async function createNewFolder() {
    const folderName = document.getElementById('new-folder-name').value;
    const path = getCurrentPath()
    if (path === 'redirect') {
        return
    }
    if (folderName.length > 0) {
        const data = {
            'name': folderName,
            'path': path
        }
        try {
            const json = await postJson('/api/createNewFolder', data)

            if (json.status === 'ok') {
                window.location.reload();
            } else {
                alert(json.status)
            }
        }
        catch (err) {
            alert('Error Creating Folder')
        }
    } else {
        alert('Folder Name Cannot Be Empty')
    }
}


async function getFolderShareAuth(path) {
    const data = { 'path': path }
    const json = await postJson('/api/getFolderShareAuth', data)
    if (json.status === 'ok') {
        return json.auth
    } else {
        alert('Error Getting Folder Share Auth')
    }
}

// File Uploader Start

const MAX_FILE_SIZE = MAX_FILE_SIZE__SDGJDG // Will be replaced by the python

const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progress-bar');
const cancelButton = document.getElementById('cancel-file-upload');
const uploadPercent = document.getElementById('upload-percent');
let uploadRequest = null;
let uploadStep = 0;
let uploadID = null;

fileInput.addEventListener('change', async (e) => {
    const file = fileInput.files[0];

    if (file.size > MAX_FILE_SIZE) {
        alert(`File size exceeds ${(MAX_FILE_SIZE / (1024 * 1024 * 1024)).toFixed(2)} GB limit`);
        return;
    }

    // Showing file uploader
    document.getElementById('bg-blur').style.zIndex = '2';
    document.getElementById('bg-blur').style.opacity = '0.1';
    document.getElementById('file-uploader').style.zIndex = '3';
    document.getElementById('file-uploader').style.opacity = '1';

    document.getElementById('upload-filename').innerText = 'Filename: ' + file.name;
    document.getElementById('upload-filesize').innerText = 'Filesize: ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    document.getElementById('upload-status').innerText = 'Status: Uploading To Backend Server';


    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', getCurrentPath());
    formData.append('password', getPassword());
    const id = getRandomId();
    formData.append('id', id);
    formData.append('total_size', file.size);

    uploadStep = 1;
    uploadRequest = new XMLHttpRequest();
    uploadRequest.open('POST', '/api/upload', true);

    uploadRequest.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressBar.style.width = percentComplete + '%';
            uploadPercent.innerText = 'Progress : ' + percentComplete.toFixed(2) + '%';
        }
    });

    uploadRequest.upload.addEventListener('load', async () => {
        await updateSaveProgress(id)
    });

    uploadRequest.upload.addEventListener('error', () => {
        alert('Upload failed');
        window.location.reload();
    });

    uploadRequest.send(formData);
});

cancelButton.addEventListener('click', () => {
    if (uploadStep === 1) {
        uploadRequest.abort();
    } else if (uploadStep === 2) {
        const data = { 'id': uploadID }
        postJson('/api/cancelUpload', data)
    }
    alert('Upload canceled');
    window.location.reload();
});

async function updateSaveProgress(id) {
    console.log('save progress')
    progressBar.style.width = '0%';
    uploadPercent.innerText = 'Progress : 0%'
    document.getElementById('upload-status').innerText = 'Status: Processing File On Backend Server';

    const interval = setInterval(async () => {
        const response = await postJson('/api/getSaveProgress', { 'id': id })
        const data = response['data']

        if (data[0] === 'running') {
            const current = data[1];
            const total = data[2];
            document.getElementById('upload-filesize').innerText = 'Filesize: ' + (total / (1024 * 1024)).toFixed(2) + ' MB';

            const percentComplete = (current / total) * 100;
            progressBar.style.width = percentComplete + '%';
            uploadPercent.innerText = 'Progress : ' + percentComplete.toFixed(2) + '%';
        }
        else if (data[0] === 'completed') {
            clearInterval(interval);
            uploadPercent.innerText = 'Progress : 100%'
            progressBar.style.width = '100%';

            await handleUpload2(id)
        }
    }, 3000)

}

async function handleUpload2(id) {
    console.log(id)
    document.getElementById('upload-status').innerText = 'Status: Uploading To Telegram Server';
    progressBar.style.width = '0%';
    uploadPercent.innerText = 'Progress : 0%';

    const interval = setInterval(async () => {
        const response = await postJson('/api/getUploadProgress', { 'id': id })
        const data = response['data']

        if (data[0] === 'running') {
            const current = data[1];
            const total = data[2];
            document.getElementById('upload-filesize').innerText = 'Filesize: ' + (total / (1024 * 1024)).toFixed(2) + ' MB';

            let percentComplete
            if (total === 0) {
                percentComplete = 0
            }
            else {
                percentComplete = (current / total) * 100;
            }
            progressBar.style.width = percentComplete + '%';
            uploadPercent.innerText = 'Progress : ' + percentComplete.toFixed(2) + '%';
        }
        else if (data[0] === 'completed') {
            clearInterval(interval);
            alert('Upload Completed')
            window.location.reload();
        }
    }, 3000)
}

// File Uploader End


// URL Uploader Start

async function get_file_info_from_url(url) {
    const data = { 'url': url }
    const json = await postJson('/api/getFileInfoFromUrl', data)
    if (json.status === 'ok') {
        return json.data
    } else {
        throw new Error(`Error Getting File Info : ${json.status}`)
    }

}

async function start_file_download_from_url(url, filename, singleThreaded) {
    const data = { 'url': url, 'path': getCurrentPath(), 'filename': filename, 'singleThreaded': singleThreaded }
    const json = await postJson('/api/startFileDownloadFromUrl', data)
    if (json.status === 'ok') {
        return json.id
    } else {
        throw new Error(`Error Starting File Download : ${json.status}`)
    }
}

async function download_progress_updater(id, file_name, file_size) {
    uploadID = id;
    uploadStep = 2
    // Showing file uploader
    document.getElementById('bg-blur').style.zIndex = '2';
    document.getElementById('bg-blur').style.opacity = '0.1';
    document.getElementById('file-uploader').style.zIndex = '3';
    document.getElementById('file-uploader').style.opacity = '1';

    document.getElementById('upload-filename').innerText = 'Filename: ' + file_name;
    document.getElementById('upload-filesize').innerText = 'Filesize: ' + (file_size / (1024 * 1024)).toFixed(2) + ' MB';

    const interval = setInterval(async () => {
        const response = await postJson('/api/getFileDownloadProgress', { 'id': id })
        const data = response['data']

        if (data[0] === 'error') {
            clearInterval(interval);
            alert('Failed To Download File From URL To Backend Server')
            window.location.reload()
        }
        else if (data[0] === 'completed') {
            clearInterval(interval);
            uploadPercent.innerText = 'Progress : 100%'
            progressBar.style.width = '100%';
            await handleUpload2(id)
        }
        else {
            const current = data[1];
            const total = data[2];

            const percentComplete = (current / total) * 100;
            progressBar.style.width = percentComplete + '%';
            uploadPercent.innerText = 'Progress : ' + percentComplete.toFixed(2) + '%';

            if (data[0] === 'Downloading') {
                document.getElementById('upload-status').innerText = 'Status: Downloading File From Url To Backend Server';
            }
            else {
                document.getElementById('upload-status').innerText = `Status: ${data[0]}`;
            }
        }
    }, 3000)
}


async function Start_URL_Upload() {
    try {
        document.getElementById('new-url-upload').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('new-url-upload').style.zIndex = '-1';
        }, 300)

        const file_url = document.getElementById('remote-url').value
        const singleThreaded = document.getElementById('single-threaded-toggle').checked

        const file_info = await get_file_info_from_url(file_url)
        const file_name = file_info.file_name
        const file_size = file_info.file_size

        if (file_size > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds ${(MAX_FILE_SIZE / (1024 * 1024 * 1024)).toFixed(2)} GB limit`)
        }

        const id = await start_file_download_from_url(file_url, file_name, singleThreaded)

        await download_progress_updater(id, file_name, file_size)

    }
    catch (err) {
        alert(err)
        window.location.reload()
    }


}

// URL Uploader End

// Smart Bulk Import Start

async function checkChannelAdmin(channel) {
    const data = { 'channel': channel }
    const json = await postJson('/api/checkChannelAdmin', data)
    return json
}

async function Start_Smart_Bulk_Import() {
    try {
        document.getElementById('smart-bulk-import-modal').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('smart-bulk-import-modal').style.zIndex = '-1';
        }, 300)

        const channel = document.getElementById('smart-bulk-channel').value.trim()
        const startMsg = document.getElementById('smart-bulk-start-msg').value.trim()
        const endMsg = document.getElementById('smart-bulk-end-msg').value.trim()
        const importMode = document.querySelector('input[name="import-mode"]:checked').value

        if (!channel) {
            throw new Error('Channel identifier is required')
        }

        // Parse message link if provided
        let channelIdentifier = channel
        if (channel.includes('t.me/')) {
            const match = channel.match(/t\.me\/([^\/]+)/)
            if (match) {
                channelIdentifier = match[1]
            }
        }

        const data = {
            'channel': channelIdentifier,
            'path': getCurrentPath(),
            'import_mode': importMode
        }

        // Add message range if provided
        if (startMsg && endMsg) {
            const startMsgId = parseInt(startMsg)
            const endMsgId = parseInt(endMsg)
            
            if (isNaN(startMsgId) || isNaN(endMsgId)) {
                throw new Error('Message IDs must be valid numbers')
            }
            
            if (startMsgId >= endMsgId) {
                throw new Error('Start message ID must be less than end message ID')
            }
            
            data.start_msg_id = startMsgId
            data.end_msg_id = endMsgId
        }

        // Show progress
        document.getElementById('bg-blur').style.zIndex = '2';
        document.getElementById('bg-blur').style.opacity = '0.1';
        document.getElementById('file-uploader').style.zIndex = '3';
        document.getElementById('file-uploader').style.opacity = '1';

        document.getElementById('upload-filename').innerText = 'Channel: ' + channelIdentifier;
        document.getElementById('upload-filesize').innerText = 'Smart Bulk Import in progress...';
        document.getElementById('upload-status').innerText = `Status: ${importMode === 'auto' ? 'Auto-detecting best method' : importMode === 'fast' ? 'Fast importing (direct reference)' : 'Regular importing (copying to storage)'}`;
        document.getElementById('upload-percent').innerText = 'Progress: Starting...';
        progressBar.style.width = '50%';

        const json = await postJson('/api/smartBulkImport', data)

        if (json.status === 'ok') {
            progressBar.style.width = '100%';
            document.getElementById('upload-percent').innerText = 'Progress: 100%';
            
            const methodText = json.method === 'fast_import' ? 'Fast Import (Direct Reference)' : 'Regular Import (Copied to Storage)'
            document.getElementById('upload-status').innerText = `Status: Completed using ${methodText}!`;
            
            setTimeout(() => {
                alert(`🧠 Smart Bulk Import Completed!\n\nMethod: ${methodText}\nImported: ${json.imported} files\nTotal: ${json.total} files\n\nFiles are now available on your drive!`)
                window.location.reload();
            }, 1000)
        } else {
            throw new Error(json.status)
        }

    } catch (err) {
        alert(`Smart Bulk Import Error: ${err.message || err}`)
        window.location.reload()
    }
}

async function checkChannel() {
    const channel = document.getElementById('smart-bulk-channel').value.trim()
    
    if (!channel) {
        alert('Please enter a channel identifier')
        return
    }

    // Parse message link if provided
    let channelIdentifier = channel
    if (channel.includes('t.me/')) {
        const match = channel.match(/t\.me\/([^\/]+)/)
        if (match) {
            channelIdentifier = match[1]
        }
    }

    try {
        const result = await checkChannelAdmin(channelIdentifier)
        const statusDiv = document.getElementById('channel-status')
        
        if (result.status === 'ok') {
            statusDiv.innerHTML = `
                <div class="channel-status-success">
                    <strong>✅ Channel Found: ${result.channel_name}</strong><br>
                    <span>Bot Admin Status: ${result.is_admin ? '✅ Admin (Fast Import Available)' : '❌ Not Admin (Regular Import Only)'}</span><br>
                    <span>Recommended: ${result.is_admin ? '⚡ Fast Import or 🧠 Auto-Detect' : '📦 Regular Import or 🧠 Auto-Detect'}</span>
                </div>
            `
        } else {
            statusDiv.innerHTML = `
                <div class="channel-status-error">
                    <strong>❌ Error: ${result.message}</strong><br>
                    <span>Please check the channel identifier and try again.</span>
                </div>
            `
        }
        
        statusDiv.style.display = 'block'
        
    } catch (err) {
        const statusDiv = document.getElementById('channel-status')
        statusDiv.innerHTML = `
            <div class="channel-status-error">
                <strong>❌ Error checking channel</strong><br>
                <span>${err.message || err}</span>
            </div>
        `
        statusDiv.style.display = 'block'
    }
}

// Smart Bulk Import End

// Video Encoding Start

async function showVideoEncodingModal(filePath, fileName) {
    // Check encoding support first
    try {
        const supportData = { password: getPassword() };
        const supportResponse = await postJson('/api/checkVideoEncodingSupport', supportData);
        
        if (supportResponse.status !== 'ok' || !supportResponse.ffmpeg_available) {
            alert('❌ Video encoding is not available on this server.\n\nFFmpeg is required for video encoding but is not installed or not working properly.');
            return;
        }
        
        const availableQualities = supportResponse.supported_qualities || [];
        
        // Create encoding modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'video-encoding-modal';
        modal.style.zIndex = '1000';
        modal.style.opacity = '1';
        
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>🎬 Encode Video</h3>
                    <p>Select quality levels to encode for better streaming performance</p>
                </div>
                <div class="modal-body">
                    <div class="encoding-file-info">
                        <div class="file-info-item">
                            <span class="info-label">File:</span>
                            <span class="info-value">${fileName}</span>
                        </div>
                        <div class="file-info-item">
                            <span class="info-label">Purpose:</span>
                            <span class="info-value">Optimize for different internet speeds</span>
                        </div>
                    </div>
                    
                    <div class="quality-selection">
                        <label class="quality-selection-label">Select Quality Levels to Encode:</label>
                        <div class="quality-options">
                            ${availableQualities.map(quality => `
                                <label class="quality-option">
                                    <input type="checkbox" name="encoding-quality" value="${quality}">
                                    <span class="quality-checkbox"></span>
                                    <div class="quality-info">
                                        <span class="quality-title">${quality.toUpperCase()}</span>
                                        <span class="quality-desc">${getQualityDescription(quality)}</span>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="encoding-note">
                        <div class="note-icon">ℹ️</div>
                        <div class="note-content">
                            <strong>Note:</strong> Encoding will create optimized versions for streaming on slow internet connections. 
                            This process may take several minutes depending on video length and selected qualities.
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="encoding-cancel" class="btn btn-secondary">Cancel</button>
                    <button id="encoding-start" class="btn btn-primary">🚀 Start Encoding</button>
                </div>
            </div>
        `;
        
        // Add styles for encoding modal
        const style = document.createElement('style');
        style.textContent = `
            .encoding-file-info {
                background: var(--secondary-50);
                border-radius: var(--radius-lg);
                padding: var(--space-4);
                margin-bottom: var(--space-5);
                border: 1px solid var(--secondary-200);
            }
            
            .file-info-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: var(--space-2);
            }
            
            .file-info-item:last-child {
                margin-bottom: 0;
            }
            
            .quality-selection {
                margin-bottom: var(--space-5);
            }
            
            .quality-selection-label {
                display: block;
                font-weight: 600;
                color: var(--secondary-800);
                margin-bottom: var(--space-3);
                font-size: 0.9rem;
            }
            
            .quality-options {
                display: flex;
                flex-direction: column;
                gap: var(--space-3);
            }
            
            .quality-option {
                display: flex;
                align-items: center;
                gap: var(--space-3);
                padding: var(--space-4);
                border: 2px solid var(--secondary-200);
                border-radius: var(--radius-lg);
                cursor: pointer;
                transition: all var(--transition-fast);
                background: white;
            }
            
            .quality-option:hover {
                border-color: var(--primary-300);
                background: var(--primary-50);
            }
            
            .quality-option input[type="checkbox"] {
                display: none;
            }
            
            .quality-checkbox {
                width: 20px;
                height: 20px;
                border: 2px solid var(--secondary-300);
                border-radius: var(--radius-md);
                position: relative;
                flex-shrink: 0;
                transition: all var(--transition-fast);
            }
            
            .quality-option input[type="checkbox"]:checked + .quality-checkbox {
                border-color: var(--primary-500);
                background: var(--primary-500);
            }
            
            .quality-option input[type="checkbox"]:checked + .quality-checkbox::after {
                content: '✓';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                font-weight: bold;
                font-size: 12px;
            }
            
            .quality-info {
                flex: 1;
            }
            
            .quality-title {
                display: block;
                font-weight: 600;
                color: var(--secondary-800);
                margin-bottom: var(--space-1);
            }
            
            .quality-desc {
                font-size: 0.85rem;
                color: var(--secondary-600);
            }
            
            .encoding-note {
                display: flex;
                gap: var(--space-3);
                padding: var(--space-4);
                background: var(--warning-50);
                border: 1px solid var(--warning-200);
                border-radius: var(--radius-lg);
                font-size: 0.9rem;
            }
            
            .note-icon {
                font-size: 1.2rem;
                flex-shrink: 0;
            }
            
            .note-content {
                line-height: 1.5;
                color: var(--warning-800);
            }
            
            @media (max-width: 768px) {
                .quality-options {
                    gap: var(--space-2);
                }
                
                .quality-option {
                    padding: var(--space-3);
                }
                
                .encoding-note {
                    padding: var(--space-3);
                    font-size: 0.8rem;
                }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        // Show background blur
        document.getElementById('bg-blur').style.zIndex = '999';
        document.getElementById('bg-blur').style.opacity = '0.5';
        
        // Add event listeners
        document.getElementById('encoding-cancel').addEventListener('click', closeEncodingModal);
        document.getElementById('encoding-start').addEventListener('click', () => startVideoEncoding(filePath));
        
    } catch (error) {
        alert('Error checking encoding support: ' + error.message);
    }
}

function getQualityDescription(quality) {
    const descriptions = {
        '240p': 'Low quality - Perfect for very slow internet (400kbps)',
        '360p': 'Medium quality - Good for moderate internet (800kbps)',
        '480p': 'Standard quality - Balanced quality/bandwidth (1.2Mbps)',
        '720p': 'HD quality - High quality streaming (2.5Mbps)',
        '1080p': 'Full HD quality - Maximum quality (5Mbps)'
    };
    return descriptions[quality] || 'Custom quality level';
}

function closeEncodingModal() {
    const modal = document.getElementById('video-encoding-modal');
    if (modal) {
        modal.remove();
    }
    
    // Hide background blur
    document.getElementById('bg-blur').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('bg-blur').style.zIndex = '-1';
    }, 300);
}

async function startVideoEncoding(filePath) {
    try {
        // Get selected qualities
        const selectedQualities = [];
        document.querySelectorAll('input[name="encoding-quality"]:checked').forEach(checkbox => {
            selectedQualities.push(checkbox.value);
        });
        
        if (selectedQualities.length === 0) {
            alert('Please select at least one quality level to encode.');
            return;
        }
        
        // Close encoding modal
        closeEncodingModal();
        
        // Start encoding
        const data = {
            password: getPassword(),
            file_path: filePath,
            qualities: selectedQualities
        };
        
        const response = await postJson('/api/encodeVideo', data);
        
        if (response.status === 'ok') {
            const encodingId = response.encoding_id;
            
            // Show encoding progress modal
            showEncodingProgressModal(encodingId, selectedQualities);
        } else {
            alert('Failed to start encoding: ' + response.status);
        }
        
    } catch (error) {
        alert('Error starting encoding: ' + error.message);
    }
}

function showEncodingProgressModal(encodingId, qualities) {
    // Show file uploader modal for encoding progress
    document.getElementById('bg-blur').style.zIndex = '2';
    document.getElementById('bg-blur').style.opacity = '0.1';
    document.getElementById('file-uploader').style.zIndex = '3';
    document.getElementById('file-uploader').style.opacity = '1';

    document.getElementById('upload-filename').innerText = '🎬 Video Encoding';
    document.getElementById('upload-filesize').innerText = `Qualities: ${qualities.join(', ').toUpperCase()}`;
    document.getElementById('upload-status').innerText = 'Status: Preparing for encoding...';
    document.getElementById('upload-percent').innerText = 'Progress: 0%';
    
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = '0%';
    
    // Update cancel button for encoding
    const cancelBtn = document.getElementById('cancel-file-upload');
    cancelBtn.textContent = 'Cancel Encoding';
    
    // Monitor encoding progress
    monitorEncodingProgress(encodingId);
}

async function monitorEncodingProgress(encodingId) {
    const interval = setInterval(async () => {
        try {
            const response = await postJson('/api/getEncodingProgress', { 
                password: getPassword(),
                encoding_id: encodingId 
            });
            
            if (response.status === 'ok') {
                const data = response.data;
                const progressBar = document.getElementById('progress-bar');
                
                if (data.status === 'downloading') {
                    document.getElementById('upload-status').innerText = 'Status: Downloading video from storage...';
                    progressBar.style.width = '10%';
                    document.getElementById('upload-percent').innerText = 'Progress: 10%';
                    
                } else if (data.status === 'encoding') {
                    document.getElementById('upload-status').innerText = 'Status: Encoding video...';
                    const progress = Math.max(10, Math.min(90, 10 + (data.progress * 0.8)));
                    progressBar.style.width = progress + '%';
                    document.getElementById('upload-percent').innerText = `Progress: ${progress.toFixed(1)}%`;
                    
                } else if (data.status === 'completed') {
                    clearInterval(interval);
                    progressBar.style.width = '100%';
                    document.getElementById('upload-percent').innerText = 'Progress: 100%';
                    
                    const encodedCount = data.encoded_count || 0;
                    const totalRequested = data.total_requested || 0;
                    
                    document.getElementById('upload-status').innerText = `Status: Encoding completed! (${encodedCount}/${totalRequested} qualities)`;
                    
                    setTimeout(() => {
                        alert(`🎬 Video Encoding Completed!\n\n✅ Successfully encoded: ${encodedCount}/${totalRequested} quality levels\n\nThe encoded versions are now available for streaming and will provide better performance on slow internet connections.`);
                        window.location.reload();
                    }, 1000);
                    
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    document.getElementById('upload-status').innerText = 'Status: Encoding failed';
                    alert('❌ Encoding failed: ' + (data.error || 'Unknown error'));
                    window.location.reload();
                }
            }
        } catch (error) {
            clearInterval(interval);
            alert('Error monitoring encoding progress: ' + error.message);
            window.location.reload();
        }
    }, 3000);
}

// Video Encoding End