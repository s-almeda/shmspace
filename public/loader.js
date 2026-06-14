// Shows #loading-body (a progress bar) inside the main window while assets load,
// then swaps in the real #main-body once everything is in.
// Loaded with `defer`, so it runs after the DOM is parsed (all <img> exist).
(function () {
  var bar = document.getElementById('loader-progress');
  var loadingBody = document.getElementById('loading-body');
  var mainBody = document.getElementById('main-body');
  if (!loadingBody || !mainBody) return;

  // fill the bar as images load (capped at 95%; window.load finishes it)
  var imgs = Array.prototype.slice.call(document.images);
  var total = imgs.length || 1;
  var loaded = 0;
  function bump() {
    loaded++;
    if (bar) bar.value = Math.min(95, Math.round((loaded / total) * 100));
  }
  imgs.forEach(function (img) {
    if (img.complete) {
      bump();
    } else {
      img.addEventListener('load', bump);
      img.addEventListener('error', bump);
    }
  });

  var swapped = false;
  function finish() {
    if (swapped) return;
    swapped = true;
    if (bar) bar.value = 100;
    // fade the loading bar out...
    loadingBody.style.transition = 'opacity 0.35s ease';
    loadingBody.style.opacity = '0';
    setTimeout(function () {
      loadingBody.style.display = 'none';
      // ...then fade the real content in
      mainBody.style.opacity = '0';
      mainBody.style.display = '';
      void mainBody.offsetWidth; // force reflow so the transition runs
      mainBody.style.transition = 'opacity 0.5s ease';
      mainBody.style.opacity = '1';
    }, 350);
  }
  window.addEventListener('load', finish);
  // safety net: never trap the user on the loading screen if an asset hangs
  setTimeout(finish, 8000);
})();
