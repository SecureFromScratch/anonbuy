'use strict';
/**
 * bulk-upload.js
 * Sends the raw file to the server — no client-side parsing.
 * Server handles CSV parsing, validation, and mass assignment.
 */

export function initBulkUpload() {
  const fileInput = document.getElementById('bulk-file-input');
  const dropzone  = document.getElementById('bulk-dropzone');
  const clearBtn  = document.getElementById('bulk-clear');
  const uploadBtn = document.getElementById('bulk-upload-btn');

  if (!fileInput) return;

  dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', (e) => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) setFile(file);
    fileInput.value = '';
  });

  clearBtn?.addEventListener('click', reset);
  uploadBtn?.addEventListener('click', uploadFile);

  document.getElementById('bulk-sample-btn')?.addEventListener('click', downloadSample);
  document.getElementById('bulk-sample-2-btn')?.addEventListener('click', downloadSampleExploit);
}

// ── File picked ────────────────────────────────────────────────
let currentFile = null;

function setFile(file) {
  currentFile = file;
  const ready    = document.getElementById('bulk-ready');
  const nameEl   = document.getElementById('bulk-file-name');
  const uploadBtn = document.getElementById('bulk-upload-btn');
  if (nameEl)    nameEl.textContent = file.name;
  if (ready)     ready.hidden = false;
  if (uploadBtn) uploadBtn.disabled = false;
  hideStatus();
}

// ── Upload raw file ────────────────────────────────────────────
async function uploadFile() {
  if (!currentFile) return;

  const uploadBtn = document.getElementById('bulk-upload-btn');
  if (uploadBtn) uploadBtn.disabled = true;
  showStatus('Uploading…', 'loading');

  // Send as multipart/form-data — server gets the raw file
  const formData = new FormData();
  formData.append('file', currentFile);

  try {
    const response = await fetch('/api/v1/order/bulk', {
      method: 'POST',
      body:   formData,   // no Content-Type header — browser sets it with boundary
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${response.status}`);
    }

    const result  = await response.json();
    const created = result.created ?? 0;
    const failed  = result.errors?.length ?? 0;

    showStatus(
      failed ? `✓ ${created} uploaded, ✕ ${failed} failed.` : `✓ ${created} order(s) uploaded.`,
      failed ? 'error' : 'success'
    );

    if (!failed) {
      window.dispatchEvent(new CustomEvent('bulk-upload-complete'));
      setTimeout(reset, 3000);
    } else {
      const errList = document.getElementById('bulk-error-list');
      if (errList) {
        errList.innerHTML = result.errors.map(e => `<span>⚠ ${e.error} (wallet: ${e.walletCode})</span>`).join('');
        errList.hidden    = false;
      }
      if (uploadBtn) uploadBtn.disabled = false;
    }

  } catch (err) {
    showStatus(`Upload failed: ${err.message}`, 'error');
    if (uploadBtn) uploadBtn.disabled = false;
  }
}

// ── Sample CSVs ────────────────────────────────────────────────
function downloadSample() {
  const csv = [
    'walletCode,itemId,quantity',
    'demo,1,2',
    'demo,3,1',
    'demo,2,5',
  ].join('\n');
  triggerDownload(csv, 'sample.csv');
}

function downloadSampleExploit() {
  // unitPrice column — server parses it and spreads it into the DB row
  // if not properly whitelisted, unitPrice:0 overwrites the computed price
  const csv = [
    'walletCode,itemId,quantity,unitPrice, totalPrice',
    'demo,1,1,0,0',
    'demo,3,1,0,0',
    'demo,2,5,0,0',
  ].join('\n');
  triggerDownload(csv, 'sample2.csv');
}

function triggerDownload(csv, filename) {
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Helpers ────────────────────────────────────────────────────
function reset() {
  currentFile = null;
  const ready   = document.getElementById('bulk-ready');
  const errList = document.getElementById('bulk-error-list');
  if (ready)   ready.hidden   = true;
  if (errList) errList.hidden = true;
  hideStatus();
}

function showStatus(message, type = 'loading') {
  const el = document.getElementById('bulk-status');
  if (!el) return;
  el.textContent = message;
  el.className   = `bulk-status ${type}`;
  el.hidden      = false;
}

function hideStatus() {
  const el = document.getElementById('bulk-status');
  if (el) el.hidden = true;
}