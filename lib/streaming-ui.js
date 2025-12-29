// ============================================
// STREAMING UI MANAGER
// Handles real-time streaming display
// ============================================

export class StreamingSummarizer {
    constructor(outputElement) {
        this.outputElement = outputElement;
        this.currentText = '';
        this.isStreaming = false;
    }

    appendText(text) {
        this.currentText += text;
        this.render();
    }

    render() {
        const cursor = this.isStreaming ? '<span class="streaming-cursor">▌</span>' : '';
        this.outputElement.innerHTML = `
            <div class="summary-content">
                ${this.formatText(this.currentText)}${cursor}
            </div>
        `;
        
        // Auto-scroll to bottom
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }

    formatText(text) {
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^•\s+(.*)$/gm, '<li>$1</li>')
            .replace(/^#\s+(.*)$/gm, '<h3>$1</h3>')
            .replace(/^##\s+(.*)$/gm, '<h4>$1</h4>')
            .replace(/\n/g, '<br>');
        
        if (html.includes('<li>')) {
            html = `<ul>${html.replace(/<br>/g, '')}</ul>`;
        }
        
        return html;
    }

    clear() {
        this.currentText = '';
        this.outputElement.innerHTML = '<p class="placeholder">Your summary will appear here...</p>';
    }
}