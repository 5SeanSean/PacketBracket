// Phishing detection logic
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
      reasons: reasons
    };
  }

  isSuspiciousSender(sender) {
    if (!sender) return false;
    
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
  }

  hasSuspiciousSubject(subject) {
    if (!subject) return false;
    
    const lowerSubject = subject.toLowerCase();
    return this.suspiciousKeywords.some(keyword => 
      lowerSubject.includes(keyword)
    );
  }

  analyzeBody(body) {
    if (!body) return { score: 0, reasons: [] };
    
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
  }

  analyzeLinks(links) {
    if (!links || links.length === 0) return { score: 0, reasons: [] };
    
    let score = 0;
    let reasons = [];

    for (const link of links) {
      try {
        const url = new URL(link);
        const domain = url.hostname;

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
  }

  analyzeAttachments(attachments) {
    let score = 0;
    let reasons = [];

    for (const attachment of attachments) {
      const extension = attachment.split('.').pop().toLowerCase();
      
      if (['exe', 'scr', 'bat', 'cmd', 'pif', 'vbs', 'js'].includes(extension)) {
        score += 40;
        reasons.push('Suspicious file attachment');
      } else if (['zip', 'rar', '7z'].includes(extension)) {
        score += 15;
        reasons.push('Compressed file attachment');
      }
    }

    return { score, reasons };
  }

  isSimilarDomain(domain1, domain2) {
    // Simple Levenshtein distance check
    const distance = this.levenshteinDistance(domain1, domain2);
    return distance <= 2 && distance > 0;
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
    // Simple heuristic for common misspellings
    const commonErrors = ['recieve', 'seperate', 'occured', 'untill', 'goverment'];
    return commonErrors.some(error => text.toLowerCase().includes(error));
  }

  hasImpersonationSignals(body) {
    const impersonationPatterns = [
      'microsoft support', 'apple support', 'google security',
      'bank security', 'paypal security', 'amazon security'
    ];
    const lowerBody = body.toLowerCase();
    return impersonationPatterns.some(pattern => lowerBody.includes(pattern));
  }

  hasSuspiciousUrlPattern(url) {
    // Check for IP addresses instead of domains
    const ipPattern = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
    
    // Check for excessive subdomains
    const subdomainPattern = /https?:\/\/[^\/]*\.[^\/]*\.[^\/]*\.[^\/]*\./;
    
    return ipPattern.test(url) || subdomainPattern.test(url);
  }

  isMisleadingLink(url) {
    // Check if display text doesn't match actual URL
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

// Email extraction and UI injection
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
    this.init();
  }

  init() {
    this.injectStyles();
    this.startScanning();
    this.observeChanges();
  }

  getStats() {
    return this.stats;
  }

  updateStats(level) {
    this.stats.scanned++;
    this.stats[level]++;
  }

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .phishing-score {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        margin-left: 8px;
        cursor: pointer;
      }
      .phishing-score.high {
        background-color: #ff4444;
        color: white;
      }
      .phishing-score.medium {
        background-color: #ff9944;
        color: white;
      }
      .phishing-score.low {
        background-color: #ffdd44;
        color: black;
      }
      .phishing-score.safe {
        background-color: #44ff44;
        color: black;
      }
      .phishing-tooltip {
        position: absolute;
        background: #333;
        color: white;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        max-width: 250px;
        z-index: 10000;
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  startScanning() {
    setTimeout(() => {
      this.scanEmails();
    }, 2000);
  }

  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldScan = true;
        }
      });
      
      if (shouldScan) {
        setTimeout(() => this.scanEmails(), 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  scanEmails() {
    console.log('Starting email scan...');
    
    // Try different selectors for various Outlook versions
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
      const emailId = this.getEmailId(email, index);
      if (!this.scannedEmails.has(emailId)) {
        this.scannedEmails.add(emailId);
        this.scanEmail(email);
        newScans++;
      }
    });

    console.log(`Scanned ${newScans} new emails`);
  }

  getEmailId(emailElement, index) {
    // Try to get a unique identifier for the email
    return emailElement.getAttribute('data-convid') || 
           emailElement.getAttribute('data-testid') || 
           emailElement.id || 
           `email-${index}`;
  }

  scanEmail(emailElement) {
    const emailData = this.extractEmailData(emailElement);
    if (!emailData) {
      console.log('Could not extract email data');
      return;
    }

    console.log('Scanning email:', emailData.subject || 'No subject');

    const analysis = this.detector.analyzeEmail(emailData);
    this.updateStats(analysis.level);
    this.displayScore(emailElement, analysis);
  }

  extractEmailData(emailElement) {
    try {
      // Extract sender
      const senderElement = emailElement.querySelector('[data-testid="sender-name"], .ms-Persona-primaryText, [title*="@"]');
      const sender = senderElement ? senderElement.textContent.trim() : '';

      // Extract subject
      const subjectElement = emailElement.querySelector('[data-testid="message-subject"], .ms-List-cell [role="heading"], .subject');
      const subject = subjectElement ? subjectElement.textContent.trim() : '';

      // Extract preview text as body
      const bodyElement = emailElement.querySelector('[data-testid="message-preview"], .ms-List-cell .preview, .preview-text');
      const body = bodyElement ? bodyElement.textContent.trim() : '';

      // Extract links (limited in email list view)
      const linkElements = emailElement.querySelectorAll('a[href]');
      const links = Array.from(linkElements).map(link => link.href);

      return {
        sender,
        subject,
        body,
        links,
        attachments: [] // Not available in list view
      };
    } catch (error) {
      console.error('Error extracting email data:', error);
      return null;
    }
  }

  displayScore(emailElement, analysis) {
    // Remove existing score if any
    const existingScore = emailElement.querySelector('.phishing-score');
    if (existingScore) {
      existingScore.remove();
    }

    // Find the best place to insert the score
    const insertPoint = this.findInsertPoint(emailElement);
    if (!insertPoint) return;

    // Create score element
    const scoreElement = document.createElement('span');
    scoreElement.className = `phishing-score ${analysis.level}`;
    scoreElement.textContent = `${analysis.score}%`;
    scoreElement.title = analysis.reasons.join(', ');

    // Add click handler for detailed tooltip
    scoreElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTooltip(e, analysis);
    });

    // Insert the score
    insertPoint.appendChild(scoreElement);
  }

  findInsertPoint(emailElement) {
    // Try to find the sender or subject area
    const candidates = [
      emailElement.querySelector('[data-testid="sender-name"]'),
      emailElement.querySelector('.ms-Persona-primaryText'),
      emailElement.querySelector('[data-testid="message-subject"]'),
      emailElement.querySelector('.ms-List-cell [role="heading"]'),
      emailElement.querySelector('.subject')
    ];

    for (const candidate of candidates) {
      if (candidate) {
        return candidate.parentElement || candidate;
      }
    }

    return emailElement;
  }

  showTooltip(event, analysis) {
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
      ${analysis.reasons.map(reason => `• ${reason}`).join('<br>')}
    `;

    // Position tooltip
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
    tooltip.style.display = 'block';

    document.body.appendChild(tooltip);

    // Remove tooltip on click elsewhere
    setTimeout(() => {
      document.addEventListener('click', function removeTooltip() {
        tooltip.remove();
        document.removeEventListener('click', removeTooltip);
      });
    }, 100);
  }
}

// Global scanner instance
let scannerInstance = null;

// Message listener for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
  return true; // Keep message channel open for async response
});

// Initialize the scanner
function initializeScanner() {
  if (!scannerInstance) {
    scannerInstance = new OutlookPhishingScanner();
    console.log('Outlook Phishing Scanner initialized');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeScanner);
} else {
  initializeScanner();
}