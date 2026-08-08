/* Job Portal Chat widget — same-origin injector.
 *
 * Loaded from a Shopify theme page so the widget runs ON the storefront
 * origin (CORS-friendly). No iframe, no postMessage: the bubble and chat
 * window are injected directly into the host page.
 *
 * Usage in a Shopify page body (one line, nothing else):
 *   <script src="https://pakfuture299-hub.github.io/pakfuture/widget.js"></script>
 *
 * When the backend tunnel restarts, update API_BASE below to the new
 * https://...trycloudflare.com URL and push to main (GitHub Pages
 * redeploys automatically).
 */
(function () {
  'use strict';
  if (window.__jpcWidgetLoaded) return; // already injected
  window.__jpcWidgetLoaded = true;

  // ---- THE ONE CONSTANT TO EDIT WHEN THE TUNNEL CHANGES ----
  var API_BASE = 'https://prophet-hidden-segment-speaker.trycloudflare.com';
  // ------------------------------------------------------------

  var HOST = 'https://job-portal-global-2.myshopify.com'; // expected origin

  if (window.location.origin !== HOST) {
    console.warn('jpc-widget: loaded outside the storefront origin', window.location.origin);
  }

  // --- DOM helpers ---
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  // --- Scoped styles: every rule is prefixed with #jpc-root so the
  //     theme's own CSS cannot leak into the widget (and vice versa). ---
  var style = el('style');
  style.textContent =
    '#jpc-root{all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#jpc-root *{box-sizing:border-box;margin:0;padding:0}' +
    '#jpc-launcher{display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:#25d366;color:#fff;border:none;cursor:pointer;font-size:30px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s ease}' +
    '#jpc-launcher:hover{transform:scale(1.08)}' +
    '#jpc-window{display:none;flex-direction:column;position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden;font-size:14px}' +
    '#jpc-window.open{display:flex}' +
    '#jpc-header{background:#25d366;color:#fff;padding:12px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}' +
    '#jpc-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1}' +
    '#jpc-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f5f7f9}' +
    '#jpc-messages .jpc-msg{max-width:82%;padding:8px 12px;border-radius:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}' +
    '#jpc-messages .jpc-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e2e5e8;border-bottom-left-radius:4px;color:#222}' +
    '#jpc-messages .jpc-msg.user{align-self:flex-end;background:#25d366;color:#fff;border-bottom-right-radius:4px}' +
    '#jpc-messages .jpc-msg a{color:#128c7e;font-weight:600}' +
    '#jpc-typing{color:#888;font-style:italic;padding:4px 2px}' +
    '#jpc-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e2e5e8;background:#fff}' +
    '#jpc-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 14px;font-size:14px;outline:none;color:#222}' +
    '#jpc-input:focus{border-color:#25d366}' +
    '#jpc-send{border:none;background:#25d366;color:#fff;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:18px}' +
    '#jpc-send:disabled{opacity:.5;cursor:default}';

  // --- Build the widget DOM ---
  var root = el('div', { id: 'jpc-root' });
  root.appendChild(style);

  var launcher = el('button', { id: 'jpc-launcher', 'aria-label': 'Open chat', html: '💬' });
  root.appendChild(launcher);

  var windowEl = el('div', { id: 'jpc-window' });
  var header = el('div', { id: 'jpc-header' });
  header.appendChild(el('span', { html: '💼 Job Portal Global' }));
  var closeBtn = el('button', { id: 'jpc-close', 'aria-label': 'Close chat', html: '×' });
  header.appendChild(closeBtn);
  windowEl.appendChild(header);

  var messagesEl = el('div', { id: 'jpc-messages' });
  messagesEl.appendChild(
    el('div', { class: 'jpc-msg bot', html: '👋 Hi! Ask us about our online jobs, or join our Telegram to get started.' })
  );
  windowEl.appendChild(messagesEl);

  var typingEl = el('div', { id: 'jpc-typing', html: 'typing…' });
  typingEl.style.display = 'none';
  windowEl.appendChild(typingEl);

  var inputRow = el('div', { id: 'jpc-input-row' });
  var inputEl = el('input', {
    id: 'jpc-input',
    type: 'text',
    placeholder: 'Type a message…',
    autocomplete: 'off',
  });
  var sendBtn = el('button', { id: 'jpc-send', 'aria-label': 'Send', html: '➤' });
  inputRow.appendChild(inputEl);
  inputRow.appendChild(sendBtn);
  windowEl.appendChild(inputRow);

  root.appendChild(windowEl);
  document.body.appendChild(root);

  // --- Toggle ---
  launcher.addEventListener('click', function () {
    windowEl.classList.add('open');
    inputEl.focus();
  });
  closeBtn.addEventListener('click', function () {
    windowEl.classList.remove('open');
  });

  // --- Render helpers ---
  function linkify(text) {
    return String(text).replace(/(https?:\/\/[^\s]+)/g, function (m) {
      return '<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + m + '</a>';
    });
  }

  function addMessage(text, who) {
    var msg = el('div', { class: 'jpc-msg ' + who });
    msg.innerHTML = linkify(text); // only our own replies/inputs; server text is trusted config
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // --- Backend discovery: ping the tunnel; fall back to a same-origin
  //     call so a dead tunnel shows a clear error instead of failing
  //     silently. ---
  var cachedApiBase = null;

  function ping(base) {
    return new Promise(function (resolve) {
      try {
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, 6000);
        fetch(base + '/health', { cache: 'no-store', signal: ctrl.signal })
          .then(function (r) { clearTimeout(t); resolve(r.ok); })
          .catch(function () { clearTimeout(t); resolve(false); });
      } catch (err) {
        resolve(false);
      }
    });
  }

  async function getApiBase() {
    if (cachedApiBase) return cachedApiBase;
    if (await ping(API_BASE)) {
      cachedApiBase = API_BASE;
      return API_BASE;
    }
    return window.location.origin; // 404s on the storefront → visible error below
  }

  // --- Send ---
  async function send() {
    var text = inputEl.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    inputEl.value = '';
    sendBtn.disabled = true;
    typingEl.style.display = 'block';
    try {
      var apiBase = await getApiBase();
      var res = await fetch(apiBase + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      var data = await res.json();
      addMessage(data.reply || 'Sorry, something went wrong. Please try again.', 'bot');
    } catch (err) {
      addMessage("Sorry, I couldn't reach the server. Please try again.", 'bot');
    } finally {
      typingEl.style.display = 'none';
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send();
  });
})();
