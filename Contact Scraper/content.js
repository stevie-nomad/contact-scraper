let isEnabled = false;
let foundContacts = new Map(); // Map to store contacts with their source URLs
let processedUrls = new Set(); // Track processed URLs to avoid duplicates

// Regex patterns
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Function to normalize phone number
function normalizePhone(phone) {
  return phone.replace(/[-.\s()]/g, '');
}

// Function to find related contacts in the same container
function findRelatedContacts(element) {
  const containerElement = element.closest('div, tr, li, article');
  if (!containerElement) return null;

  const containerText = containerElement.innerText;
  const emails = containerText.match(emailRegex) || [];
  const phones = (containerText.match(phoneRegex) || []).map(normalizePhone);

  if (emails.length > 0 || phones.length > 0) {
    return {
      emails: [...new Set(emails)],
      phones: [...new Set(phones)],
      url: window.location.href
    };
  }
  return null;
}

// Function to scrape contacts from text content
function scrapeContacts(rootElement = document.body) {
  const currentUrl = window.location.href;
  if (processedUrls.has(currentUrl)) return false;

  let newContactsFound = false;
  const elements = rootElement.querySelectorAll('*');

  // First pass: find elements with both email and phone
  elements.forEach(element => {
    const relatedContacts = findRelatedContacts(element);
    if (relatedContacts && relatedContacts.emails.length > 0 && relatedContacts.phones.length > 0) {
      const key = `${relatedContacts.emails.join(',')}|${relatedContacts.phones.join(',')}`;
      if (!foundContacts.has(key)) {
        foundContacts.set(key, relatedContacts);
        newContactsFound = true;
      }
    }
  });

  // Second pass: find remaining individual contacts
  const remainingEmails = new Set();
  const remainingPhones = new Set();

  // Get emails from mailto: links
  const mailtoLinks = rootElement.querySelectorAll('a[href^="mailto:"]');
  mailtoLinks.forEach(link => {
    const email = link.href.replace('mailto:', '').split('?')[0];
    if (email.match(emailRegex)) {
      remainingEmails.add(email);
      newContactsFound = true;
    }
  });

  // Get phone numbers from tel: links
  const telLinks = rootElement.querySelectorAll('a[href^="tel:"]');
  telLinks.forEach(link => {
    const phone = normalizePhone(link.href.replace('tel:', ''));
    if (phone.match(/^\+?\d{10,}$/)) {
      remainingPhones.add(phone);
      newContactsFound = true;
    }
  });

  // Get remaining text content
  const textContent = rootElement.innerText;
  const emails = textContent.match(emailRegex) || [];
  const phones = (textContent.match(phoneRegex) || []).map(normalizePhone);

  emails.forEach(email => remainingEmails.add(email));
  phones.forEach(phone => remainingPhones.add(phone));

  // Add individual contacts
  if (remainingEmails.size > 0 || remainingPhones.size > 0) {
    const key = `individual_${currentUrl}`;
    foundContacts.set(key, {
      emails: Array.from(remainingEmails),
      phones: Array.from(remainingPhones),
      url: currentUrl
    });
    newContactsFound = true;
  }

  if (newContactsFound) {
    processedUrls.add(currentUrl);
    updateStorage();
  }

  return newContactsFound;
}

// Function to update storage with found contacts
async function updateStorage() {
  const contactsArray = Array.from(foundContacts.values());
  const totalEmails = new Set(contactsArray.flatMap(contact => contact.emails));
  const totalPhones = new Set(contactsArray.flatMap(contact => contact.phones));

  await browser.storage.local.set({
    contacts: contactsArray,
    processedUrls: Array.from(processedUrls)
  });

  // Notify popup of the update
  await browser.runtime.sendMessage({
    action: 'updateContactCount',
    emailCount: totalEmails.size,
    phoneCount: totalPhones.size,
    urlCount: processedUrls.size
  });
}

// Function to scrape the entire page
function scrapePage() {
  if (!isEnabled) return;
  scrapeContacts();
}

// Initialize scraping when the page loads
async function initializeScraping() {
  const result = await browser.storage.local.get(['isEnabled', 'contacts', 'processedUrls']);
  isEnabled = result.isEnabled || false;
  
  if (result.contacts) {
    result.contacts.forEach(contact => {
      const key = `${contact.emails.join(',')}|${contact.phones.join(',')}`;
      foundContacts.set(key, contact);
    });
  }

  if (result.processedUrls) {
    result.processedUrls.forEach(url => processedUrls.add(url));
  }

  if (isEnabled) {
    scrapePage();
  }
}

// Listen for DOM changes to catch dynamically loaded content
const observer = new MutationObserver(function(mutations) {
  if (isEnabled) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // ELEMENT_NODE
            scrapeContacts(node);
          }
        });
      }
    });
  }
});

// Initialize observer
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Listen for messages from popup
browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'toggleScraping') {
    isEnabled = request.isEnabled;
    if (isEnabled) {
      scrapePage();
    }
  } else if (request.action === 'clearHistory') {
    foundContacts.clear();
    processedUrls.clear();
  }
});

// Handle dynamic content loading
document.addEventListener('DOMContentLoaded', initializeScraping);
window.addEventListener('load', scrapePage);

// Handle dynamic navigation (for single-page applications)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (isEnabled) {
      setTimeout(scrapePage, 1000); // Small delay to ensure content is loaded
    }
  }
}).observe(document, { subtree: true, childList: true }); 