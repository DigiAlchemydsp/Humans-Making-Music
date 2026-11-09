(() => {
  'use strict';
  const config = window.HMM_CONFIG || {};
  const session = config.session || {};
  let opener = null;

  function openDialog(id, trigger) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    // Keep the original focus target when moving between workshop dialogs.
    if (!document.querySelector('dialog[open]')) opener = trigger || document.activeElement;
    document.querySelectorAll('dialog[open]').forEach(item => item.close());
    dialog.showModal();
    dialog.querySelector('[data-close]')?.focus();
  }

  document.querySelectorAll('[data-dialog]').forEach(button => {
    button.addEventListener('click', () => openDialog(button.dataset.dialog, button));
  });

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.querySelectorAll('video').forEach(video => video.pause());
      // close events are queued; do not steal focus from a newly opened dialog.
      if (!document.querySelector('dialog[open]') && opener?.isConnected) opener.focus();
    });
  });

  const setText = (id, value) => {
    if (typeof value === 'string' && value.trim()) document.getElementById(id).textContent = value;
  };
  setText('session-title', session.title);
  setText('session-dialog-title', session.title);
  setText('session-artists', session.artists);
  setText('session-dialog-artists', session.artists);

  function httpsUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch { return null; }
  }

  function mediaUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return ['https:', 'http:', 'file:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  const posterUrl = mediaUrl(session.poster);
  if (posterUrl) {
    const poster = document.getElementById('session-poster');
    const photo = poster.querySelector('img');
    const fallbackSrc = photo.src;
    photo.addEventListener('error', () => {
      photo.src = fallbackSrc;
      poster.classList.remove('custom-poster');
      poster.querySelector('.custom-play')?.remove();
    }, { once: true });
    photo.src = posterUrl;
    poster.classList.add('custom-poster');
    const play = document.createElement('span');
    play.className = 'custom-play';
    play.setAttribute('aria-hidden', 'true');
    poster.append(play);
  }

  const trigger = document.getElementById('session-trigger');
  const title = document.getElementById('session-title').textContent;
  const videoUrl = httpsUrl(session.videoUrl);
  const videoFile = mediaUrl(session.videoFile);
  if (videoFile || videoUrl) {
    document.getElementById('session-status').textContent = 'Watch now';
    trigger.setAttribute('aria-label', `Watch ${title}`);
    const content = document.getElementById('session-content');
    content.replaceChildren();
    if (videoFile) {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      video.src = videoFile;
      video.setAttribute('aria-label', title);
      content.append(video);
    } else {
      const link = document.createElement('a');
      link.className = 'arrow-link watch-link';
      link.href = videoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Watch the session ↗';
      content.append(link);
    }
  } else {
    trigger.setAttribute('aria-label', `${title} — coming soon. View session details.`);
  }
  trigger.addEventListener('click', () => openDialog('session-dialog', trigger));

  const channels = {
    contact: { title: 'Contact', message: 'Our contact details will be shared here soon.' },
    instagram: { title: 'Instagram', message: 'The HMM Instagram page is coming soon.', url: httpsUrl(config.instagramUrl) },
    youtube: { title: 'YouTube', message: 'The HMM YouTube channel is coming soon.', url: httpsUrl(config.youtubeUrl) }
  };
  document.querySelectorAll('[data-channel]').forEach(button => {
    button.addEventListener('click', () => {
      const channel = button.dataset.channel;
      const item = channels[channel];
      if (channel === 'contact' && typeof config.contactEmail === 'string' && /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(config.contactEmail)) {
        window.location.href = `mailto:${encodeURIComponent(config.contactEmail)}`;
        return;
      }
      if (item.url) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
        return;
      }
      setText('channel-dialog-title', item.title);
      setText('channel-dialog-message', item.message);
      openDialog('channel-dialog', button);
    });
  });
})();
