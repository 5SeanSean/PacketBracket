// Improved Phishing detection logic with better error handling
class PhishingDetector {
  constructor() {
    this.suspiciousKeywords = [
      'urgent', 'immediate', 'verify', 'suspended', 'expires',
      'click here', 'act now', 'limited time', 'confirm identity',
      'security alert', 'account locked', 'unusual activity'
    ];
    
    this.suspiciousDomains = [
      'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly',
      'short.link', 'rebrand.ly', 'is.gd'
    ];
    
    this.legitimateDomains = [
      'microsoft.com', 'office.com', 'outlook.com', 'live.com',
      'google.com', 'amazon.com', 'apple.com', 'facebook.com'
    ];
  }

  analyzeEmail(emailData) {
    let score = 0;
    let reasons = [];

    try {
      // Check sender
      if (this.isSuspiciousSender(emailData.sender)) {
        score += 30;
        reasons.push('Suspicious sender domain');
      }

      // Check subject
      if (this.hasSuspiciousSubject(emailData.subject)) {
        score += 20;
        reasons.push('Suspicious subject line');
      }

      // Check body content
      const bodyScore = this.analyzeBody(emailData.body);
      score += bodyScore.score;
      reasons.push(...bodyScore.reasons);

      // Check links
      const linkScore = this.analyzeLinks(emailData.links);
      score += linkScore.score;
      reasons.push(...linkScore.reasons);

      // Check attachments
      if (emailData.attachments && emailData.attachments.length > 0) {
        const attachmentScore = this.analyzeAttachments(emailData.attachments);
        score += attachmentScore.score;
        reasons.push(...attachmentScore.reasons);
      }

      return {
        score: Math.min(score, 100),
        level: this.getScoreLevel(score),
        reasons: reasons.filter(reason => reason) // Remove empty reasons
      };
    } catch (error) {
      console.error('Error analyzing email:', error);
      return {
        score: 0,
        level: 'safe',
        reasons: ['Analysis error']
      };
    }
  }

  isSuspiciousSender(sender) {
    if (!sender || typeof sender !== 'string') return false;
    
    try {
      const email = sender.toLowerCase();
      const domain = email.split('@')[1];
      
      if (!domain) return true;
      
      // Check for typosquatting of legitimate domains
      for (const legit of this.legitimateDomains) {
        if (domain !== legit && this.isSimilarDomain(domain, legit)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking sender:', error);
      return false;
    }
  }

  hasSuspiciousSubject(subject) {
    if (!subject || typeof subject !== 'string') return false;
    
    try {
      const lowerSubject = subject.toLowerCase();
      return this.suspiciousKeywords.some(keyword => 
        lowerSubject.includes(keyword)
      );
    } catch (error) {
      console.error('Error checking subject:', error);
      return false;
    }
  }

  analyzeBody(body) {
    if (!body || typeof body !== 'string') return { score: 0, reasons: [] };
    
    try {
      let score = 0;
      let reasons = [];
      const lowerBody = body.toLowerCase();

      // Check for urgency words
      const urgencyCount = this.suspiciousKeywords.filter(keyword => 
        lowerBody.includes(keyword)
      ).length;
      
      if (urgencyCount > 0) {
        score += urgencyCount * 10;
        reasons.push(`Contains ${urgencyCount} urgency indicators`);
      }

      // Check for spelling errors (simple heuristic)
      if (this.hasSpellingErrors(body)) {
        score += 15;
        reasons.push('Potential spelling errors');
      }

      // Check for impersonation
      if (this.hasImpersonationSignals(body)) {
        score += 25;
        reasons.push('Potential impersonation attempt');
      }

      return { score, reasons };
    } catch (error) {
      console.error('Error analyzing body:', error);
      return { score: 0, reasons: [] };
    }
  }

  analyzeLinks(links) {
    if (!links || !Array.isArray(links) || links.length === 0) {
      return { score: 0, reasons: [] };
    }
    
    let score = 0;
    let reasons = [];

    try {
      for (const link of links) {
        try {
          const url = new URL(link);
          const domain = url.hostname.toLowerCase();

          // Check for suspicious domains
          if (this.suspiciousDomains.includes(domain)) {
            score += 20;
            reasons.push('Contains shortened URLs');
          }

          // Check for suspicious URL patterns
          if (this.hasSuspiciousUrlPattern(link)) {
            score += 15;
            reasons.push('Suspicious URL pattern');
          }

          // Check for misleading links
          if (this.isMisleadingLink(link)) {
            score += 30;
            reasons.push('Potentially misleading link');
          }
        } catch (e) {
          score += 10;
          reasons.push('Malformed URL');
        }
      }

      return { score, reasons };
    } catch (error) {
      console.error('Error analyzing links:', error);
      return { score: 0, reasons: [] };
    }
  }

  analyzeAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments)) {
      return { score: 0, reasons: [] };
    }

    let score = 0;
    let reasons = [];

    try {
      for (const attachment of attachments) {
        if (typeof attachment !== 'string') continue;
        
        const extension = attachment.split('.').pop()?.toLowerCase();
        if (!extension) continue;
        
        if (['exe', 'scr', 'bat', 'cmd', 'pif', 'vbs', 'js'].includes(extension)) {
          score += 40;
          reasons.push('Suspicious file attachment');
        } else if (['zip', 'rar', '7z'].includes(extension)) {
          score += 15;
          reasons.push('Compressed file attachment');
        }
      }

      return { score, reasons };
    } catch (error) {
      console.error('Error analyzing attachments:', error);
      return { score: 0, reasons: [] };
    }
  }

  isSimilarDomain(domain1, domain2) {
    if (!domain1 || !domain2 || typeof domain1 !== 'string' || typeof domain2 !== 'string') {
      return false;
    }
    
    try {
      const distance = this.levenshteinDistance(domain1, domain2);
      return distance <= 2 && distance > 0;
    } catch (error) {
      console.error('Error comparing domains:', error);
      return false;
    }
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  hasSpellingErrors(text) {
    if (!text || typeof text !== 'string') return false;
    
    try {
      const commonErrors = ['recieve', 'seperate', 'occured', 'untill', 'goverment'];
      return commonErrors.some(error => text.toLowerCase().includes(error));
    } catch (error) {
      console.error('Error checking spelling:', error);
      return false;
    }
  }

  hasImpersonationSignals(body) {
    if (!body || typeof body !== 'string') return false;
    
    try {
      const impersonationPatterns = [
        'microsoft support', 'apple support', 'google security',
        'bank security', 'paypal security', 'amazon security'
      ];
      const lowerBody = body.toLowerCase();
      return impersonationPatterns.some(pattern => lowerBody.includes(pattern));
    } catch (error) {
      console.error('Error checking impersonation:', error);
      return false;
    }
  }

  hasSuspiciousUrlPattern(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      // Check for IP addresses instead of domains
      const ipPattern = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
      
      // Check for excessive subdomains
      const subdomainPattern = /https?:\/\/[^\/]*\.[^\/]*\.[^\/]*\.[^\/]*\./;
      
      return ipPattern.test(url) || subdomainPattern.test(url);
    } catch (error) {
      console.error('Error checking URL pattern:', error);
      return false;
    }
  }

  isMisleadingLink(url) {
    // This would need more context from the email HTML
    return false;
  }

  getScoreLevel(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
  }
}

// Enhanced Email extraction and UI injection
class OutlookPhishingScanner {
  constructor() {
    this.detector = new PhishingDetector();
    this.scannedEmails = new Set();
    this.stats = {
      scanned: 0,
      high: 0,
      medium: 0,
      low: 0,
      safe: 0
    };
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.init();
  }

  init() {
    try {
      console.log('Initializing Outlook Phishing Scanner...');
      this.injectStyles();
      this.waitForOutlook();
      this.observeChanges();
    } catch (error) {
      console.error('Error initializing scanner:', error);
    }
  }

  waitForOutlook() {
    let retries = 0;
    const checkOutlook = () => {
      if (retries >= this.maxRetries) {
        console.log('Max retries reached. Outlook may not be fully loaded.');
        return;
      }

      if (this.isOutlookLoaded()) {
        console.log('Outlook detected, starting scan...');
        this.startScanning();
      } else {
        retries++;
        console.log(`Waiting for Outlook to load... (${retries}/${this.maxRetries})`);
        setTimeout(checkOutlook, this.retryDelay);
      }
    };

    checkOutlook();
  }

  isOutlookLoaded() {
    // Check for common Outlook elements
    const outlookIndicators = [
      '[data-testid="message-list-item"]',
      '[role="listitem"][data-convid]',
      '.ms-List-cell[data-automationid="MessageListItem"]',
      '[data-testid="message-item"]'
    ];

    return outlookIndicators.some(selector => document.querySelector(selector));
  }

  getStats() {
    return this.stats;
  }

  updateStats(level) {
    this.stats.scanned++;
    this.stats[level]++;
    console.log(`Stats updated: ${level} risk detected. Total scanned: ${this.stats.scanned}`);
  }

  injectStyles() {
    // Check if styles already injected
    if (document.querySelector('#phishing-scanner-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'phishing-scanner-styles';
    style.textContent = `
      .phishing-score {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
        margin: 2px 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-shadow: 0 1px 1px rgba(0,0,0,0.2);
        z-index: 1000;
        position: relative;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      .phishing-score:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      }
      .phishing-score.high {
        background: linear-gradient(135deg, #ff4444, #cc0000);
        color: white;
        animation: pulse-red 2s infinite;
        border: 1px solid #ff6666;
      }
      .phishing-score.medium {
        background: linear-gradient(135deg, #ff9944, #ff6600);
        color: white;
        border: 1px solid #ffaa66;
      }
      .phishing-score.low {
        background: linear-gradient(135deg, #ffdd44, #ffaa00);
        color: #333;
        border: 1px solid #ffee66;
      }
      .phishing-score.safe {
        background: linear-gradient(135deg, #44ff44, #00cc00);
        color: #333;
        border: 1px solid #66ff66;
      }
      @keyframes pulse-red {
        0% { opacity: 1; }
        50% { opacity: 0.8; }
        100% { opacity: 1; }
      }
      .phishing-tooltip {
        position: absolute;
        background: linear-gradient(135deg, #2c3e50, #34495e);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        max-width: 280px;
        z-index: 10000;
        display: none;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
        line-height: 1.4;
      }
      .phishing-tooltip::before {
        content: '';
        position: absolute;
        top: -8px;
        left: 20px;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid #2c3e50;
      }
      .phishing-tooltip strong {
        color: #e74c3c;
        font-weight: 600;
      }
      
      /* Email preview container styling */
      .email-preview-container {
        position: relative;
      }
      
      .email-preview-container .phishing-score {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 1001;
      }
    `;
    document.head.appendChild(style);
    console.log('Styles injected successfully');
  }

  startScanning() {
    setTimeout(() => {
      this.scanEmails();
    }, 1000);
  }

  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new nodes contain email elements
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const hasEmailElements = node.querySelector && (
                node.querySelector('[data-testid="message-list-item"]') ||
                node.querySelector('[role="listitem"][data-convid]') ||
                node.querySelector('.ms-List-cell[data-automationid="MessageListItem"]')
              );
              
              if (hasEmailElements) {
                shouldScan = true;
              }
            }
          });
        }
      });
      
      if (shouldScan) {
        setTimeout(() => this.scanEmails(), 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('Mutation observer started');
  }

  scanEmails() {
    try {
      console.log('Starting email scan...');
      
      const emailSelectors = [
        '[data-testid="message-list-item"]',
        '[role="listitem"][data-convid]',
        '.ms-List-cell[data-automationid="MessageListItem"]',
        '[data-testid="message-item"]',
        '[role="row"]',
        '.ms-FocusZone [role="button"]'
      ];

      let emails = [];
      for (const selector of emailSelectors) {
        emails = document.querySelectorAll(selector);
        if (emails.length > 0) {
          console.log(`Found ${emails.length} emails using selector: ${selector}`);
          break;
        }
      }

      if (emails.length === 0) {
        console.log('No emails found with any selector');
        return;
      }

      let newScans = 0;
      emails.forEach((email, index) => {
        try {
          const emailId = this.getEmailId(email, index);
          if (!this.scannedEmails.has(emailId)) {
            this.scannedEmails.add(emailId);
            this.scanEmail(email);
            newScans++;
          }
        } catch (error) {
          console.error('Error scanning individual email:', error);
        }
      });

      console.log(`Scanned ${newScans} new emails`);
    } catch (error) {
      console.error('Error in scanEmails:', error);
    }
  }

  getEmailId(emailElement, index) {
    try {
      return emailElement.getAttribute('data-convid') || 
             emailElement.getAttribute('data-testid') || 
             emailElement.id || 
             emailElement.getAttribute('aria-label') ||
             `email-${index}-${Date.now()}`;
    } catch (error) {
      console.error('Error getting email ID:', error);
      return `email-${index}-${Date.now()}`;
    }
  }

  scanEmail(emailElement) {
    try {
      const emailData = this.extractEmailData(emailElement);
      if (!emailData) {
        console.log('Could not extract email data');
        return;
      }

      console.log('Scanning email:', emailData.subject || 'No subject');

      const analysis = this.detector.analyzeEmail(emailData);
      this.updateStats(analysis.level);
      this.displayScore(emailElement, analysis);
    } catch (error) {
      console.error('Error scanning email:', error);
    }
  }

  extractEmailData(emailElement) {
    try {
      // Extract sender with multiple selectors
      const senderSelectors = [
        '[data-testid="sender-name"]',
        '.ms-Persona-primaryText',
        '[title*="@"]',
        '[data-automation-id="sender-name"]',
        '.sender-name'
      ];
      
      let sender = '';
      for (const selector of senderSelectors) {
        const element = emailElement.querySelector(selector);
        if (element) {
          sender = element.textContent?.trim() || element.title?.trim() || '';
          if (sender) break;
        }
      }

      // Extract subject with multiple selectors
      const subjectSelectors = [
        '[data-testid="message-subject"]',
        '.ms-List-cell [role="heading"]',
        '.subject',
        '[data-automation-id="subject"]',
        '.message-subject'
      ];
      
      let subject = '';
      for (const selector of subjectSelectors) {
        const element = emailElement.querySelector(selector);
        if (element) {
          subject = element.textContent?.trim() || '';
          if (subject) break;
        }
      }

      // Extract preview text as body
      const bodySelectors = [
        '[data-testid="message-preview"]',
        '.ms-List-cell .preview',
        '.preview-text',
        '.message-preview'
      ];
      
      let body = '';
      for (const selector of bodySelectors) {
        const element = emailElement.querySelector(selector);
        if (element) {
          body = element.textContent?.trim() || '';
          if (body) break;
        }
      }

      // Extract links
      const linkElements = emailElement.querySelectorAll('a[href]');
      const links = Array.from(linkElements).map(link => link.href).filter(href => href);

      return {
        sender: sender || 'Unknown',
        subject: subject || 'No subject',
        body: body || '',
        links: links,
        attachments: [] // Not available in list view
      };
    } catch (error) {
      console.error('Error extracting email data:', error);
      return null;
    }
  }

displayScore(emailElement, analysis) {
  try {
    // Remove existing score
    const existingScore = emailElement.querySelector('.phishing-score');
    if (existingScore) existingScore.remove();

    // Create score element
    const scoreElement = document.createElement('div');
    scoreElement.className = `phishing-score ${analysis.level}`;
    scoreElement.textContent = `${analysis.score}%`;
    scoreElement.title = `Risk Level: ${analysis.level.toUpperCase()}\nClick for details`;
    
    // Add click handler for detailed tooltip
    scoreElement.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showTooltip(e, analysis);
    });

    // Add to email container
    const container = this.findEmailPreviewContainer(emailElement);
    container.appendChild(scoreElement);
    
  } catch (error) {
    console.error('Error displaying score:', error);
  }
}

findEmailPreviewContainer(emailElement) {
  try {
    // Try several selectors to find the email header container
    const selectors = [
      '.oG5yj', // New Outlook header container
      '[data-testid="message-header"]', // Header test ID
      '[data-testid="message-container"]', // Container test ID
      '[role="listitem"] > div:first-child', // First child of list item
      '.ms-List-cell > div:first-child' // First child of list cell
    ];

    for (const selector of selectors) {
      const container = emailElement.querySelector(selector);
      if (container) {
        // Ensure the container has relative positioning
        if (window.getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
        return container;
      }
    }

    // Fallback to the email element itself
    if (window.getComputedStyle(emailElement).position === 'static') {
      emailElement.style.position = 'relative';
    }
    return emailElement;
  } catch (error) {
    console.error('Error finding email preview container:', error);
    return emailElement;
  }
}

  showTooltip(event, analysis) {
    try {
      // Remove existing tooltip
      const existingTooltip = document.querySelector('.phishing-tooltip');
      if (existingTooltip) {
        existingTooltip.remove();
      }

      // Create new tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'phishing-tooltip';
      tooltip.innerHTML = `
        <strong>Phishing Risk: ${analysis.level.toUpperCase()}</strong><br>
        Score: ${analysis.score}%<br><br>
        Reasons:<br>
        ${analysis.reasons.length > 0 ? analysis.reasons.map(reason => `• ${reason}`).join('<br>') : '• No specific indicators found'}
      `;

      // Position tooltip
      tooltip.style.left = event.pageX + 'px';
      tooltip.style.top = (event.pageY - 10) + 'px';
      tooltip.style.display = 'block';

      document.body.appendChild(tooltip);

      // Remove tooltip on click elsewhere
      setTimeout(() => {
        const removeTooltip = () => {
          if (tooltip.parentNode) {
            tooltip.remove();
          }
          document.removeEventListener('click', removeTooltip);
        };
        document.addEventListener('click', removeTooltip);
      }, 100);
    } catch (error) {
      console.error('Error showing tooltip:', error);
    }
  }
}

// Global scanner instance
let scannerInstance = null;

// Enhanced message listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'scan') {
        if (scannerInstance) {
          scannerInstance.scanEmails();
          sendResponse({success: true, message: 'Scan initiated'});
        } else {
          sendResponse({success: false, message: 'Scanner not initialized'});
        }
      } else if (request.action === 'getStats') {
        if (scannerInstance) {
          sendResponse({
            success: true,
            stats: scannerInstance.getStats()
          });
        } else {
          sendResponse({success: false, message: 'Scanner not initialized'});
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({success: false, message: 'Error processing request'});
    }
    
    return true; // Keep message channel open for async response
  });
}

// Initialize the scanner
function initializeScanner() {
  try {
    if (!scannerInstance) {
      scannerInstance = new OutlookPhishingScanner();
      console.log('Outlook Phishing Scanner initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing scanner:', error);
  }
}

// Initialize based on document state
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeScanner);
} else {
  initializeScanner();
}

// Fallback initialization
setTimeout(initializeScanner, 3000);