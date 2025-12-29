import { StreamingSummarizer } from './lib/streaming-ui.js';


class UniversalSummarizer {
    constructor() {
        this.apiKey = 'ADD'; 
        this.streamer = new StreamingSummarizer(document.getElementById('summary-output'));
        
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.streamer.clear();
    }

    setupEventListeners() {
        document.getElementById('summarize-btn').addEventListener('click', () => {
            this.generateSummary();
        });

        document.getElementById('export-pdf').addEventListener('click', () => {
            this.exportToPDF();
        });
    }

    async generateSummary() {
        if (this.apiKey === 'YOUR_API_KEY' || this.apiKey.trim() === '') {
            this.showStatus('Please replace YOUR_API_KEY in popup.js', 'error');
            return;
        }

        this.showStatus('Extracting content from page...', 'info');
        this.showProgress(true);
        this.streamer.clear();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            const extraction = await chrome.tabs.sendMessage(tab.id, { 
                action: 'extractContent' 
            });
            
            if (!extraction.success) {
                throw new Error(extraction.error || 'Failed to extract content');
            }
            
            this.currentContent = extraction.content;
            this.updateTokenInfo(extraction.content.content);
            this.showStatus('Generating AI summary...', 'info');
            
            await this.callGeminiAPIStreaming(extraction.content);
            
            document.getElementById('export-pdf').disabled = false;
            this.showStatus('Summary generated successfully!', 'success');
            
        } catch (error) {
            console.error('Summary generation failed:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showProgress(false);
        }
    }

    async callGeminiAPIStreaming(content) {
        const summaryLength = document.getElementById('summary-length').value;
        const prompt = this.buildPrompt(content, summaryLength);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:streamGenerateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1024,
                    }
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullSummary = ''; 

        this.streamer.isStreaming = true;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let startIdx = buffer.indexOf('{');
            while (startIdx !== -1) {
                let bracketCount = 0;
                let endIdx = -1;

                for (let i = startIdx; i < buffer.length; i++) {
                    if (buffer[i] === '{') bracketCount++;
                    else if (buffer[i] === '}') bracketCount--;

                    if (bracketCount === 0) {
                        endIdx = i;
                        break;
                    }
                }

                if (endIdx !== -1) {
                    const jsonStr = buffer.substring(startIdx, endIdx + 1);
                    try {
                        const jsonObj = JSON.parse(jsonStr);
                        const text = jsonObj.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        fullSummary += text; 
                        this.streamer.appendText(text);
                    } catch (e) {
                        console.error("Partial JSON parse error", e);
                    }
                    buffer = buffer.substring(endIdx + 1);
                    startIdx = buffer.indexOf('{');
                } else {
                    break;
                }
            }
        }

        this.streamer.isStreaming = false;
        this.currentSummary = fullSummary; // Now correctly assigned
        this.streamer.render();

        if (this.currentContent.type === 'youtube') {
            const outputElement = document.getElementById('summary-output');
            const finalHtmlWithTimestamps = this.addTimestampLinks(outputElement.innerHTML);
            outputElement.innerHTML = finalHtmlWithTimestamps;
            this.addTimestampHandlers();
        }
       
    }
        
        

    
    

    buildPrompt(content, length) {
        let prompt = `Please summarize the following ${content.type === 'youtube' ? 'YouTube video content' : 'web page'}:\n\n`;
        prompt += `"${content.content.substring(0, 50000)}"\n\n`;
        
        if (length === '5') {
            prompt += 'Provide the summary in exactly 5 bullet points.\n';
        } else if (length === '10') {
            prompt += 'Provide the summary in exactly 10 bullet points.\n';
        } else {
            prompt += 'Provide a comprehensive, detailed summary with sections.\n';
        }
        
        if (content.type === 'youtube' && content.hasTranscript) {
            prompt += 'Include relevant timestamps from the transcript in format [MM:SS].\n';
        }
        
        if (content.type === 'youtube' && !content.hasTranscript) {
            prompt += 'Note: No transcript was found. This summary is based on video description and comments.\n';
        }
        
        return prompt;
    }

    addTimestampLinks(text) {
        return text.replace(/\`\[(\d{1,2}):(\d{2})\]/g, 
            '<span class="timestamp" data-minutes="$1" data-seconds="$2">[$1:$2]</span>');
    }

    addTimestampHandlers() {
        document.querySelectorAll('.timestamp').forEach(timestamp => {
            timestamp.addEventListener('click', async (e) => {
                const minutes = parseInt(e.target.dataset.minutes, 10);
                const seconds = parseInt(e.target.dataset.seconds, 10);
                const totalSeconds = (minutes * 60) + seconds;
                
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                chrome.tabs.sendMessage(tab.id, {
                    action: 'seekToTime',
                    time: totalSeconds
                });
            });
        });
    }

    async exportToPDF() {
        if (!this.currentSummary) {
            this.showStatus('No summary to export', 'error');
            return;
        }
        
        try {
            const { jsPDF } = await import('./lib/jspdf.umd.min.js');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            
            doc.setFontSize(18);
            doc.text('AI Summary Report', pageWidth / 2, 20, { align: 'center' });
            
            doc.setFontSize(10);
            doc.text(`Source: ${this.currentContent.url}`, margin, 35);
            doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 42);
            doc.text(`Content Type: ${this.currentContent.type.toUpperCase()}`, margin, 49);
            
            const lines = doc.splitTextToSize(this.currentSummary, pageWidth - 2 * margin);
            doc.setFontSize(12);
            doc.text(lines, margin, 65);
            
            const filename = `summary_${Date.now()}.pdf`;
            doc.save(filename);
            
            this.showStatus(`PDF exported as ${filename}`, 'success');
            
        } catch (error) {
            console.error('PDF export error:', error);
            this.showStatus('PDF export failed.', 'error');
        }
    }

    updateTokenInfo(text) {
        const tokenInfo = document.getElementById('token-info');
        if (!tokenInfo) return;
        const wordCount = text.split(/\s+/).length;
        const estimatedTokens = Math.ceil(wordCount * 1.3);
        
        tokenInfo.innerHTML = `
            📊 ${wordCount.toLocaleString()} words | 
            ~${estimatedTokens.toLocaleString()} tokens
        `;
    }

    showStatus(message, type = 'info') {
        const statusBar = document.getElementById('status-bar');
        if (!statusBar) return;
        statusBar.textContent = message;
        statusBar.className = `status-bar ${type}`;
        
        if (type === 'success') {
            setTimeout(() => {
                statusBar.textContent = '';
                statusBar.className = 'status-bar';
            }, 3000);
        }
    }

    showProgress(show) {
        const progressBar = document.getElementById('progress-bar');
        if (!progressBar) return;
        progressBar.style.display = show ? 'block' : 'none';
        
        if (show) {
            progressBar.innerHTML = '<div class="progress-fill"></div>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new UniversalSummarizer();
});
