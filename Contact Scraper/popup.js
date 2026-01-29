document.addEventListener('DOMContentLoaded', async function() {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const status = document.getElementById('status');
  const emailCount = document.getElementById('emailCount');
  const phoneCount = document.getElementById('phoneCount');
  const emailList = document.getElementById('emailList');
  const phoneList = document.getElementById('phoneList');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn = document.getElementById('clearBtn');

  function updateEmailList(contacts) {
    if (!contacts || contacts.length === 0) {
      emailList.innerHTML = '<div class="no-contacts">No emails found yet</div>';
      return;
    }

    const emailItems = contacts.flatMap(contact => {
      if (contact.emails.length === 0) return [];
      return contact.emails.map(email => {
        const relatedPhones = contact.phones.length > 0 
          ? `<div class="related-contacts">Related phones: ${contact.phones.map(formatPhoneNumber).join(', ')}</div>` 
          : '';
        return `
          <div class="contact-item">
            <div class="contact-email">${email}</div>
            ${relatedPhones}
            <div class="contact-url">${contact.url}</div>
          </div>`;
      });
    });

    emailList.innerHTML = emailItems.join('') || '<div class="no-contacts">No emails found yet</div>';
  }

  function updatePhoneList(contacts) {
    if (!contacts || contacts.length === 0) {
      phoneList.innerHTML = '<div class="no-contacts">No phone numbers found yet</div>';
      return;
    }

    const phoneItems = contacts.flatMap(contact => {
      if (contact.phones.length === 0) return [];
      return contact.phones.map(phone => {
        const relatedEmails = contact.emails.length > 0 
          ? `<div class="related-contacts">Related emails: ${contact.emails.join(', ')}</div>` 
          : '';
        return `
          <div class="contact-item">
            <div class="contact-phone">${formatPhoneNumber(phone)}</div>
            ${relatedEmails}
            <div class="contact-url">${contact.url}</div>
          </div>`;
      });
    });

    phoneList.innerHTML = phoneItems.join('') || '<div class="no-contacts">No phone numbers found yet</div>';
  }

  function formatPhoneNumber(phone) {
    if (phone.length === 10) {
      return `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;
    } else if (phone.length > 10 && phone.startsWith('+')) {
      return phone;
    } else {
      return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    }
  }

  // Load initial state
  const result = await browser.storage.local.get(['isEnabled', 'contacts']);
  toggleSwitch.checked = result.isEnabled || false;
  status.textContent = result.isEnabled ? 'ON' : 'OFF';
  
  const contacts = result.contacts || [];
  const totalEmails = new Set(contacts.flatMap(contact => contact.emails));
  const totalPhones = new Set(contacts.flatMap(contact => contact.phones));
  
  emailCount.textContent = totalEmails.size;
  phoneCount.textContent = totalPhones.size;
  updateEmailList(contacts);
  updatePhoneList(contacts);

  // Toggle switch handler
  toggleSwitch.addEventListener('change', async function() {
    const isEnabled = toggleSwitch.checked;
    status.textContent = isEnabled ? 'ON' : 'OFF';
    
    await browser.storage.local.set({ isEnabled: isEnabled });
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    await browser.tabs.sendMessage(tabs[0].id, {
      action: 'toggleScraping',
      isEnabled: isEnabled
    });
  });

  // Listen for contact updates from content script
  browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'updateContactCount') {
      const result = await browser.storage.local.get(['contacts']);
      emailCount.textContent = request.emailCount;
      phoneCount.textContent = request.phoneCount;
      updateEmailList(result.contacts);
      updatePhoneList(result.contacts);
    }
  });

  // Download button handler
  downloadBtn.addEventListener('click', async function() {
    const result = await browser.storage.local.get(['contacts']);
    if (!result.contacts || result.contacts.length === 0) {
      alert('No contacts found to download!');
      return;
    }

    // Create CSV with headers
    const csvRows = ['URL,Email,Phone'];
    
    // Process each contact and create rows
    result.contacts.forEach(contact => {
      // If we have both emails and phones that are related
      if (contact.emails.length > 0 && contact.phones.length > 0) {
        // Create a row for each email-phone pair
        contact.emails.forEach(email => {
          contact.phones.forEach(phone => {
            csvRows.push(`"${contact.url}","${email}","${formatPhoneNumber(phone)}"`);
          });
        });
      } else {
        // Handle cases where we only have emails or only phones
        if (contact.emails.length > 0) {
          contact.emails.forEach(email => {
            csvRows.push(`"${contact.url}","${email}",""`);
          });
        }
        if (contact.phones.length > 0) {
          contact.phones.forEach(phone => {
            csvRows.push(`"${contact.url}","","${formatPhoneNumber(phone)}"`);
          });
        }
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    await browser.downloads.download({
      url: encodedUri,
      filename: `scraped_contacts_${timestamp}.csv`
    });
  });

  // Clear history button handler
  clearBtn.addEventListener('click', async function() {
    if (confirm('Are you sure you want to clear all scraped contacts?')) {
      await browser.storage.local.set({ 
        contacts: [],
        processedUrls: []
      });
      emailCount.textContent = '0';
      phoneCount.textContent = '0';
      updateEmailList([]);
      updatePhoneList([]);
      
      // Notify content script to clear its state
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      await browser.tabs.sendMessage(tabs[0].id, {
        action: 'clearHistory'
      });
    }
  });
}); 