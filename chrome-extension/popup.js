/* ─────────────────────────────────────────────────────────────
   Agent OnBoard — Chrome Extension Popup Script
   ───────────────────────────────────────────────────────────── */

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toggleBtn = document.getElementById('toggleBtn');
const approvalSection = document.getElementById('approvalSection');
const approvalAction = document.getElementById('approvalAction');
const approvalDetail = document.getElementById('approvalDetail');
const btnApprove = document.getElementById('btnApprove');
const btnDeny = document.getElementById('btnDeny');
const inputUrl = document.getElementById('inputUrl');
const inputKey = document.getElementById('inputKey');
const inputAgentId = document.getElementById('inputAgentId');
const btnSave = document.getElementById('btnSave');
const toast = document.getElementById('toast');

// ─── Load saved config into inputs ──────────────────────────────

function loadConfig() {
  chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'agentId'], (config) => {
    inputUrl.value = config.supabaseUrl || '';
    inputKey.value = config.supabaseKey || '';
    inputAgentId.value = config.agentId || '';
  });
}

// ─── Update status display ──────────────────────────────────────

function updateStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusDot.classList.remove('active');
      statusText.textContent = 'Disconnected';
      return;
    }

    if (response.monitoring) {
      statusDot.classList.add('active');
      statusText.textContent = 'Monitoring for triggers...';
      toggleBtn.textContent = 'Stop Monitoring';
      toggleBtn.classList.add('active');
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = response.configured ? 'Ready (not monitoring)' : 'Not configured';
      toggleBtn.textContent = 'Start Monitoring';
      toggleBtn.classList.remove('active');
    }

    // Show approval section if there's a pending action
    if (response.pending) {
      approvalSection.classList.add('visible');
      approvalAction.textContent = response.pending.action;
      approvalDetail.textContent = `Session: ${response.pending.sessionId?.slice(0, 12)}...`;
    } else {
      approvalSection.classList.remove('visible');
    }
  });
}

// ─── Toast helper ───────────────────────────────────────────────

function showToast(message, duration = 2000) {
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}

// ─── Toggle monitoring ──────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    if (response && response.monitoring) {
      chrome.runtime.sendMessage({ type: 'stop_monitoring' }, () => {
        updateStatus();
        showToast('Monitoring stopped');
      });
    } else {
      chrome.runtime.sendMessage({ type: 'start_monitoring' }, () => {
        updateStatus();
        showToast('Monitoring started');
      });
    }
  });
});

// ─── Approval buttons ───────────────────────────────────────────

btnApprove.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'approval_response', approved: true }, () => {
    approvalSection.classList.remove('visible');
    showToast('Action approved');
  });
});

btnDeny.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'approval_response', approved: false }, () => {
    approvalSection.classList.remove('visible');
    showToast('Action denied');
  });
});

// ─── Save settings ──────────────────────────────────────────────

btnSave.addEventListener('click', () => {
  const supabaseUrl = inputUrl.value.trim();
  const supabaseKey = inputKey.value.trim();
  const agentId = inputAgentId.value.trim();

  if (!supabaseUrl || !supabaseKey) {
    showToast('URL and Key are required');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'save_config',
    supabaseUrl,
    supabaseKey,
    agentId
  }, () => {
    showToast('Settings saved');
    updateStatus();
  });
});

// ─── Listen for approval requests from background ───────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'approval_request') {
    approvalSection.classList.add('visible');
    approvalAction.textContent = message.trigger.action;
    approvalDetail.textContent = `Session: ${message.sessionId?.slice(0, 12)}...`;
  }
});

// ─── Initialize ─────────────────────────────────────────────────

loadConfig();
updateStatus();

// Refresh status every 3 seconds while popup is open
setInterval(updateStatus, 3000);
