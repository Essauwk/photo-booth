/**
 * print-handler.js
 * Handles printing the composited photo booth image.
 *
 * CSS for print is in style.css (@media print block).
 * The hidden <img id="print-target"> is set to the composited
 * data URL and then window.print() is triggered.
 */

const PrintHandler = (() => {
  /**
   * Trigger browser print dialog for the composited image.
   * @param {string} compositedDataURL — the full data URL of the composited image
   */
  function triggerPrint(compositedDataURL) {
    const printTarget = document.getElementById('print-target');
    if (!printTarget) {
      console.error('PrintHandler: #print-target element not found.');
      return;
    }
    printTarget.src = compositedDataURL;
    // Small delay to ensure image is loaded before print dialog opens
    setTimeout(() => {
      window.print();
    }, 150);
  }

  return { triggerPrint };
})();
