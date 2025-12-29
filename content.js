// ============================================
// UNIVERSAL CONTENT EXTRACTOR
// Merges logic from both repositories
// ============================================

class UniversalContentExtractor {
  constructor() {
    this.currentUrl = window.location.href;
    this.isYouTube = this.detectYouTube();
  }

  detectYouTube() {
    return this.currentUrl.includes('youtube.com/watch') || 
           this.currentUrl.includes('youtu.be/');
  }

  // FROM yt-summarizer: YouTube transcript extraction
  async extractYouTubeTranscript() {
    try {
      // Method 1: Extract from ytInitialPlayerResponse
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent.includes('ytInitialPlayerResponse')) {
          const regex = /ytInitialPlayerResponse\s*=\s*({.+?});/s;
          const match = script.textContent.match(regex);
          
          if (match) {
            const playerResponse = JSON.parse(match[1]);
            const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            
            if (captions && captions.length > 0) {
              const transcriptUrl = captions[0].baseUrl + '&fmt=json3';
              const response = await fetch(transcriptUrl);
              const data = await response.json();
              
              return this.formatYouTubeTranscript(data);
            }
          }
        }
      }

      // Method 2: Fallback to description and comments
      return await this.getYouTubeFallbackContent();
      
    } catch (error) {
      console.error('YouTube extraction error:', error);
      return await this.getYouTubeFallbackContent();
    }
  }

  formatYouTubeTranscript(data) {
    if (!data?.events) return '';
    
    let transcript = '';
    data.events.forEach(event => {
      if (event.segs) {
        const text = event.segs.map(seg => seg.utf8).join('');
        const startMs = event.tStartMs || 0;
        const seconds = Math.floor(startMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        transcript += `[${minutes}:${secs.toString().padStart(2, '0')}] ${text}\n`;
      }
    });
    
    return transcript;
  }

  async getYouTubeFallbackContent() {
    // Extract video description
    const descriptionSelectors = [
      '#description-inline-expander',
      '#description',
      'ytd-video-secondary-info-renderer #description'
    ];
    
    let description = '';
    for (const selector of descriptionSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        description = element.innerText;
        break;
      }
    }
    
    // Extract top comments (max 5)
    let comments = '';
    const commentElements = document.querySelectorAll('ytd-comment-thread-renderer');
    const maxComments = Math.min(5, commentElements.length);
    
    for (let i = 0; i < maxComments; i++) {
      const commentText = commentElements[i]?.querySelector('#content-text')?.innerText || '';
      if (commentText.trim()) {
        comments += `Comment ${i + 1}: ${commentText.substring(0, 150)}...\n`;
      }
    }
    
    return `VIDEO DESCRIPTION:\n${description}\n\nTOP COMMENTS:\n${comments}`;
  }

  // FROM WebSummarizer: Webpage text extraction
  extractWebPageText() {
    // Clone body to avoid modifying original DOM
    const bodyClone = document.body.cloneNode(true);
    
    // Remove unwanted elements (navbar, footer, ads, etc.)
    const unwantedSelectors = [
      'nav', 'footer', 'header', 'aside', 'script',
      'style', 'iframe', '.ad', '.advertisement',
      '.navbar', '.menu', '.sidebar', '.social-share',
      '.comments', '.related-posts', '.newsletter'
    ];
    
    unwantedSelectors.forEach(selector => {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Get clean text
    let text = bodyClone.innerText || bodyClone.textContent;
    
    // Clean up whitespace and limit tokens (~20,000 words)
    text = text.replace(/\s+/g, ' ').trim();
    const words = text.split(' ');
    const limitedText = words.slice(0, 20000).join(' ');
    
    return limitedText;
  }

  // Main extraction method
  async extractContent() {
    if (this.isYouTube) {
      const transcript = await this.extractYouTubeTranscript();
      return {
        type: 'youtube',
        content: transcript,
        url: this.currentUrl,
        title: document.title.replace(' - YouTube', ''),
        hasTranscript: !transcript.includes('VIDEO DESCRIPTION:')
      };
    } else {
      const text = this.extractWebPageText();
      return {
        type: 'webpage',
        content: text,
        url: this.currentUrl,
        title: document.title
      };
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    const extractor = new UniversalContentExtractor();
    
    extractor.extractContent().then(content => {
      sendResponse({ success: true, content });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'seekToTime' && extractor.isYouTube) {
    // Handle timestamp clicks for YouTube
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = request.time;
      video.play();
    }
  }
});