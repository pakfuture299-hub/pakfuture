/* Job Portal Chat widget embed — creates the widget iframe on the page.
 * This file lives on GitHub Pages; the Shopify theme only needs one
 * <script src=".../embed.js"> tag. Nothing else on the store is touched.
 */
(function () {
  if (document.getElementById('jpc-frame')) return; // already loaded
  var frame = document.createElement('iframe');
  frame.id = 'jpc-frame';
  frame.src = 'https://pakfuture299-hub.github.io/pakfuture/widget.html';
  frame.title = 'Job Portal Chat';
  frame.setAttribute('scrolling', 'no');
  frame.style.cssText =
    'position:fixed;bottom:0;left:0;width:70px;height:70px;' +
    'border:0;z-index:99999;background:transparent;';
  document.body.appendChild(frame);

  // The widget announces its desired size when it opens/closes.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'jpc-resize') return;
    frame.style.width = data.width + 'px';
    frame.style.height = data.height + 'px';
  });
})();
