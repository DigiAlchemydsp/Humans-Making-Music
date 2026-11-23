(() => {
  const viewer = document.querySelector('.gallery-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  const items = Array.from(document.querySelectorAll('.gallery-item'));
  const stage = document.getElementById('media-stage');
  const title = document.getElementById('media-title');
  const count = document.getElementById('media-count');
  let current = 0;
  let opener;
  let touch;

  function clearStage() {
    const video = stage.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    stage.replaceChildren();
  }

  function show(index) {
    current = (index + items.length) % items.length;
    const item = items[current];
    const cover = item.querySelector('img');
    clearStage();
    title.textContent = item.querySelector('h2').textContent;
    count.textContent = (current + 1) + ' / ' + items.length;
    if (item.dataset.kind === 'video') {
      const video = document.createElement('video');
      video.playsInline = true;
      video.controls = true;
      video.poster = cover.src;
      video.src = item.href;
      video.setAttribute('aria-label', title.textContent + ', HMM live performance');
      stage.append(video);
      video.play().catch(() => { /* The native play button remains available. */ });
    } else {
      const photo = new Image();
      photo.alt = cover.alt;
      photo.src = item.href;
      stage.append(photo);
    }
  }

  items.forEach((item, index) => {
    item.setAttribute('aria-haspopup', 'dialog');
    item.addEventListener('click', event => {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      opener = item;
      viewer.showModal();
      show(index);
    });
  });
  document.getElementById('prev-media').onclick = () => show(current - 1);
  document.getElementById('next-media').onclick = () => show(current + 1);
  document.getElementById('close-viewer').onclick = () => viewer.close();
  viewer.addEventListener('close', () => { clearStage(); touch = undefined; opener?.focus(); });
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('keydown', event => {
    if (event.target.tagName === 'VIDEO') return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  stage.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 ? event.touches[0] : undefined;
    const video = stage.querySelector('video');
    if (video && touch && touch.clientY >= video.getBoundingClientRect().bottom - 68) touch = undefined;
  }, { passive: true });
  stage.addEventListener('touchcancel', () => { touch = undefined; });
  stage.addEventListener('touchend', event => {
    if (!touch) return;
    const end = event.changedTouches[0];
    const dy = end.clientY - touch.clientY;
    const dx = end.clientX - touch.clientX;
    touch = undefined;
    if (Math.abs(dy) > 65 && Math.abs(dy) > Math.abs(dx) * 1.4) show(current + (dy < 0 ? 1 : -1));
  }, { passive: true });
})();
