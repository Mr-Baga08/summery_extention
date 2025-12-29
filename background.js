// ============================================
// BACKGROUND SERVICE WORKER
// Handles extension lifecycle and events
// ============================================

// Clear storage on extension install/update
chrome.runtime.onInstalled.addListener(() => {
    console.log('Universal Summarizer installed');
    chrome.storage.local.clear();
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'contentExtracted') {
        // Store content temporarily for popup access
        chrome.storage.local.set({ 
            lastExtractedContent: message.content,
            extractionTime: Date.now()
        });
    }
    return true;
});

// Clean up old storage (stateless policy)
setInterval(() => {
    chrome.storage.local.get(['extractionTime'], (result) => {
        if (result.extractionTime) {
            const age = Date.now() - result.extractionTime;
            if (age > 30 * 60 * 1000) { // 30 minutes
                chrome.storage.local.remove(['lastExtractedContent', 'extractionTime']);
            }
        }
    });
}, 5 * 60 * 1000); // Check every 5 minutes