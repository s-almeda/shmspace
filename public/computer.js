// Interactive computer on the home page: shows a random drawing/photo of shm on
// the screen, click to switch, and the frame acts like a button (hover + press).
(function () {
  var frame = document.getElementById('computer-frame');
  var base = document.getElementById('computer-base');
  var pressed = document.getElementById('computer-pressed');
  var drawing = document.getElementById('computer-drawing');
  var photo = document.getElementById('computer-photo');
  var BASE = 'images/computer_blank.svg';
  var HOVER = 'images/computer_blank_hover.svg';
  // preload so the frame doesn't flash on first hover
  new Image().src = HOVER;
  function show(showPhoto) {
    drawing.style.display = showPhoto ? 'none' : 'block';
    photo.style.display = showPhoto ? 'block' : 'none';
  }
  // randomly pick one on load
  show(Math.random() < 0.5);
  // click the screen to switch between drawing and photo
  frame.addEventListener('click', function () {
    show(photo.style.display === 'none');
  });
  // hover swaps the frame's power LED
  frame.addEventListener('mouseenter', function () { base.src = HOVER; });
  frame.addEventListener('mouseleave', function () { base.src = BASE; });
  // press: show pressed frame instantly, hold, then fade it out.
  // (base stays underneath, so it looks a little darker mid-fade — that's fine.)
  var fadeTimer;
  frame.addEventListener('mousedown', function () {
    clearTimeout(fadeTimer);
    pressed.style.transition = 'none';
    pressed.style.opacity = '1';
  });
  frame.addEventListener('mouseup', function () {
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      pressed.style.transition = 'opacity 0.2s ease';
      pressed.style.opacity = '0';
    }, 100);
  });
})();
