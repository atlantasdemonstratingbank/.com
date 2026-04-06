// ── ATLANTAS i18n ─────────────────────────────────────────────
// Auto-detects browser language, allows manual override stored in localStorage
(function(){
  var SUPPORTED = ['en','fr','es','pt-BR','pt-PT'];
  var DEFAULT   = 'en';
  var _strings  = {};
  var _lang     = DEFAULT;

  // Detect best language from browser
  function _detect(){
    var saved = localStorage.getItem('atl_lang');
    if(saved && SUPPORTED.indexOf(saved) > -1) return saved;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    var code = nav.toLowerCase();
    // Exact match first
    for(var i=0;i<SUPPORTED.length;i++){
      if(code === SUPPORTED[i].toLowerCase()) return SUPPORTED[i];
    }
    // pt-br / pt-pt
    if(code.startsWith('pt-br') || code === 'pt') return 'pt-BR';
    if(code.startsWith('pt')) return 'pt-PT';
    // es
    if(code.startsWith('es')) return 'es';
    // fr
    if(code.startsWith('fr')) return 'fr';
    return DEFAULT;
  }

  function _apply(){
    // Apply data-i18n attributes
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      var key = el.getAttribute('data-i18n');
      if(_strings[key]) el.textContent = _strings[key];
    });
    // Apply data-i18n-ph (placeholder)
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
      var key = el.getAttribute('data-i18n-ph');
      if(_strings[key]) el.placeholder = _strings[key];
    });
    // Update html lang attribute
    document.documentElement.lang = _lang.split('-')[0];
  }

  function _load(lang, cb){
    var path = lang + '.json';
    var done = false;
    // Timeout — if fetch takes >4s, just proceed without translation
    var timer = setTimeout(function(){ if(!done){done=true;if(cb)cb();} }, 4000);
    fetch(path).then(function(r){ return r.json(); }).then(function(data){
      if(done) return; done=true; clearTimeout(timer);
      _strings = data;
      _lang = lang;
      _apply();
      if(cb) cb();
    }).catch(function(){
      if(done) return; done=true; clearTimeout(timer);
      if(lang !== DEFAULT){
        _load(DEFAULT, cb);
      } else {
        if(cb) cb();
      }
    });
  }

  // Re-apply when DOM is fully ready
  document.addEventListener('DOMContentLoaded', function(){ if(Object.keys(_strings).length) _apply(); });

  // Public API
  window.i18n = {
    t: function(key, fallback){
      return _strings[key] || fallback || key;
    },
    lang: function(){ return _lang; },
    set: function(lang, cb){
      localStorage.setItem('atl_lang', lang);
      _load(lang, cb || _apply);
    },
    init: function(cb){
      _lang = _detect();
      _load(_lang, cb);
    },
    apply: _apply,
    supported: SUPPORTED
  };
})();
