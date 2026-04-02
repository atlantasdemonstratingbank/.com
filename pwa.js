// PWA.JS — Universal Install Prompt (iOS + Android)
// Works with beforeinstallprompt (Android/Chrome) and iOS Safari detection
(function(){
  'use strict';

  var _deferredPrompt = null;
  var _bannerShown = false;
  var STORAGE_KEY = 'atl_pwa_dismissed';
  var DISMISS_DAYS = 7;

  // Check if already installed
  function _isInstalled(){
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  // Check if dismissed recently
  function _wasDismissed(){
    var ts = localStorage.getItem(STORAGE_KEY);
    if(!ts) return false;
    return (Date.now() - parseInt(ts)) < DISMISS_DAYS * 86400000;
  }

  function _dismiss(){
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    _hideBanner();
  }

  // Detect iOS
  function _isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  // Detect Android
  function _isAndroid(){
    return /android/i.test(navigator.userAgent);
  }

  // Detect Safari (not Chrome on iOS)
  function _isSafari(){
    var ua = navigator.userAgent;
    return /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  }

  // Build and inject banner CSS
  function _injectStyles(){
    if(document.getElementById('pwa-styles')) return;
    var style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = [
      '#pwa-banner{position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:0 16px 16px;pointer-events:none;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);}',
      '#pwa-banner.show{transform:translateY(0);}',
      '#pwa-inner{background:#ffffff;border-radius:20px 20px 16px 16px;box-shadow:0 -2px 40px rgba(0,0,0,0.18),0 8px 32px rgba(0,0,0,0.12);padding:18px 18px 20px;pointer-events:all;position:relative;}',
      '#pwa-inner::before{content:"";position:absolute;inset:0;border-radius:20px 20px 16px 16px;border:1.5px solid rgba(30,63,206,0.15);pointer-events:none;}',
      '.pwa-glow{position:absolute;top:-1px;left:50%;transform:translateX(-50%);width:60%;height:3px;background:linear-gradient(90deg,transparent,#1e3fce,transparent);border-radius:0 0 4px 4px;}',
      '.pwa-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;}',
      '.pwa-app-icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#1e3fce,#5b4fcf);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 4px 12px rgba(30,63,206,0.35);}',
      '.pwa-app-name{font-size:16px;font-weight:800;color:#0d1117;letter-spacing:-0.3px;}',
      '.pwa-app-sub{font-size:13px;color:#6b7280;margin-top:2px;}',
      '.pwa-close{position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;background:#f2f4f7;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#6b7280;font-weight:700;}',
      '.pwa-steps{background:#f8f9ff;border-radius:12px;padding:12px 14px;margin-bottom:14px;}',
      '.pwa-step{display:flex;align-items:center;gap:10px;font-size:13px;color:#374151;padding:5px 0;}',
      '.pwa-step:not(:last-child){border-bottom:1px solid #e8eaed;}',
      '.pwa-step-ico{width:30px;height:30px;border-radius:8px;background:#fff;border:1px solid #e4e6eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;}',
      '.pwa-step-txt strong{display:block;font-weight:700;color:#0d1117;font-size:13px;}',
      '.pwa-step-txt span{font-size:12px;color:#6b7280;}',
      '.pwa-btn{display:block;width:100%;background:linear-gradient(135deg,#1e3fce,#2d52e6);color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(30,63,206,0.3);}',
      '.pwa-btn:active{opacity:0.9;}',
      '.pwa-skip{display:block;text-align:center;margin-top:10px;font-size:13px;color:#9ca3af;cursor:pointer;background:none;border:none;width:100%;font-family:inherit;}',
      '@media(prefers-color-scheme:dark){#pwa-inner{background:#1a1f2e;}#pwa-inner::before{border-color:rgba(30,63,206,0.3);}.pwa-app-name{color:#f0eeff;}.pwa-step-txt strong{color:#f0eeff;}.pwa-steps{background:rgba(30,63,206,0.08);}}'
    ].join('');
    document.head.appendChild(style);
  }

  // Build banner HTML
  function _buildBanner(type){
    var appName = (window._cfg && window._cfg.appName) || document.title || 'Atlantas';
    var appIcon = (window._cfg && window._cfg.appLogoUrl) ? '<img src="'+window._cfg.appLogoUrl+'" style="width:52px;height:52px;border-radius:14px;object-fit:cover;" alt="">' : '<div class="pwa-app-icon">'+appName.charAt(0)+'</div>';

    var stepsHTML = '';
    if(type === 'ios'){
      stepsHTML = '<div class="pwa-steps">' +
        '<div class="pwa-step"><div class="pwa-step-ico">&#9166;</div><div class="pwa-step-txt"><strong>Tap the Share button</strong><span>The box with an arrow at the bottom of Safari</span></div></div>' +
        '<div class="pwa-step"><div class="pwa-step-ico">&#43;</div><div class="pwa-step-txt"><strong>Tap "Add to Home Screen"</strong><span>Scroll down in the share menu to find it</span></div></div>' +
        '<div class="pwa-step"><div class="pwa-step-ico">&#10003;</div><div class="pwa-step-txt"><strong>Tap "Add"</strong><span>'+appName+' will appear on your home screen</span></div></div>' +
        '</div>';
    } else {
      stepsHTML = '<div class="pwa-steps">' +
        '<div class="pwa-step"><div class="pwa-step-ico">&#128241;</div><div class="pwa-step-txt"><strong>Works like a real app</strong><span>No App Store needed — installs directly</span></div></div>' +
        '<div class="pwa-step"><div class="pwa-step-ico">&#9889;</div><div class="pwa-step-txt"><strong>Fast & offline-ready</strong><span>Loads instantly, even on slow connections</span></div></div>' +
        '</div>';
    }

    return '<div class="pwa-glow"></div>' +
      '<div class="pwa-header">' + appIcon +
        '<div><div class="pwa-app-name">'+appName+'</div><div class="pwa-app-sub">Free · Install now</div></div>' +
      '</div>' +
      '<button class="pwa-close" onclick="PWA.dismiss()" aria-label="Close">&times;</button>' +
      stepsHTML +
      (type === 'ios'
        ? '<button class="pwa-btn" onclick="PWA.dismiss()">Got it, I\'ll add it now</button>'
        : '<button class="pwa-btn" onclick="PWA.install()">Add to Home Screen</button>') +
      '<button class="pwa-skip" onclick="PWA.dismiss()">Not now</button>';
  }

  function _showBanner(type){
    if(_bannerShown || _isInstalled() || _wasDismissed()) return;
    _injectStyles();
    var banner = document.getElementById('pwa-banner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'pwa-banner';
      banner.innerHTML = '<div id="pwa-inner"></div>';
      document.body.appendChild(banner);
    }
    document.getElementById('pwa-inner').innerHTML = _buildBanner(type);
    _bannerShown = true;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ banner.classList.add('show'); });
    });
  }

  function _hideBanner(){
    var banner = document.getElementById('pwa-banner');
    if(banner){
      banner.classList.remove('show');
      setTimeout(function(){ if(banner.parentNode) banner.parentNode.removeChild(banner); _bannerShown = false; }, 400);
    }
  }

  // ── ANDROID / Chrome: beforeinstallprompt ──────────────────
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    _deferredPrompt = e;
    if(!_isInstalled() && !_wasDismissed()){
      var delay = (window._cfg && window._cfg.pwaPromptDelay) ? parseInt(window._cfg.pwaPromptDelay) : 4000;
      setTimeout(function(){ _showBanner('android'); }, delay);
    }
  });

  // ── iOS Safari detection ───────────────────────────────────
  window.addEventListener('load', function(){
    if(_isIOS() && _isSafari() && !_isInstalled() && !_wasDismissed()){
      var delay = (window._cfg && window._cfg.pwaPromptDelay) ? parseInt(window._cfg.pwaPromptDelay) : 5000;
      setTimeout(function(){ _showBanner('ios'); }, delay);
    }
    // Android fallback — if beforeinstallprompt didn't fire but we're on Android
    if(_isAndroid() && !_deferredPrompt && !_isInstalled() && !_wasDismissed()){
      setTimeout(function(){
        if(!_deferredPrompt) _showBanner('android-manual');
      }, 8000);
    }
  });

  // ── appinstalled event ─────────────────────────────────────
  window.addEventListener('appinstalled', function(){
    _hideBanner(); _deferredPrompt = null;
    localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_DAYS * 86400000 * 365));
  });

  // ── Public API ─────────────────────────────────────────────
  window.PWA = {
    install: function(){
      if(_deferredPrompt){
        _deferredPrompt.prompt();
        _deferredPrompt.userChoice.then(function(result){
          _deferredPrompt = null;
          if(result.outcome === 'accepted') _hideBanner();
          else _dismiss();
        });
      } else {
        // Fallback: show manual instructions
        alert('To install:\n1. Tap the browser menu (⋮ or Share)\n2. Select "Add to Home Screen"\n3. Tap "Add"');
        _dismiss();
      }
    },
    dismiss: _dismiss,
    show: function(){ _showBanner(_isIOS()?'ios':'android'); },
    reset: function(){ localStorage.removeItem(STORAGE_KEY); }
  };

})();
