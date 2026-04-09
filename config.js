// CONFIG.JS — Atlantas Platform
// <!-- DEMO APPLICATION - FOR DEMONSTRATION PURPOSES ONLY -->
'use strict';

var FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDLPAktzLmpfNX9XUmw9i_B2P2I3XPwOLs',
  authDomain:        'viccybank.firebaseapp.com',
  databaseURL:       'https://viccybank-default-rtdb.firebaseio.com',
  projectId:         'viccybank',
  storageBucket:     'viccybank.firebasestorage.app',
  messagingSenderId: '328465601734',
  appId:             '1:328465601734:web:ae8d6bee3683be60629b32'
};

// DB paths
var DB = {
  users:      'users',
  topups:     'depositRequests',
  cashouts:   'withdrawalRequests',
  notifs:     'notifications',
  appConfig:  'atl_app_config',
  admins:     'atl_admins',
  locks:      'lockUnlockRequests',
  accNums:    'accountNumbers',
  pubDir:     'publicDirectory',
  kyc:        'atl_kyc',
  instSubs:   'atl_inst_submissions',
  fcmTokens:  'atl_fcm_tokens',
  loans:      'atl_loans',
  moneyReqs:  'atl_money_requests',
  countryReqs:'atl_country_requests'
};

var PLATFORM_URLS = { userApp:'https://atlantas.pages.dev', adminApp:'', devApp:'' };
var ADMIN_EMAIL     = 'admin@aaddmmiimn.com';
var SUBADMIN_DOMAIN = '@aaddmmiinn.com';
var INVITE_CODE     = 'ATLANTASINVITE2026';
var DEV_EMAIL       = 'developer@gmail.com';

// Cloudinary defaults — real values stored in Firebase by Dev portal
var CLOUDINARY_DEFAULTS = {
  cloudName:'dbgxllxdb',
  presets:{ profile:'efootball_screenshots', kyc:'efootball_screenshots', card:'efootball_screenshots', inst:'efootball_screenshots' },
  compression:{ maxW:1200, maxH:1200, quality:0.82 }
};

var SUPPORTED_LANGS = ['en','fr','es','pt'];
var LANG_NAMES = {en:'English',fr:'Français',es:'Español',pt:'Português'};

var DEV_RECOMMENDATIONS = {
  appNames:['Atlantas','VaultX','NovaPay','SwiftPay','TrustFlow','NexBank'],
  appSubtitles:['Secure · Reliable · Global','Fast · Safe · Simple','Your Money, Your Control'],
  themes:[
    {name:'Ocean Blue',primary:'#1e3fce',accent:'#4d7fff',balBg1:'#0d1117',balBg2:'#1a3a5c',bg:'#f2f4f7',dark:false},
    {name:'Midnight',  primary:'#7c3aed',accent:'#a855f7',balBg1:'#1a0533',balBg2:'#2d1b69',bg:'#0d0f14',dark:true},
    {name:'Emerald',   primary:'#059669',accent:'#34d399',balBg1:'#022c22',balBg2:'#065f46',bg:'#f0fdf4',dark:false},
    {name:'Crimson',   primary:'#dc2626',accent:'#f87171',balBg1:'#1a0505',balBg2:'#7f1d1d',bg:'#fff5f5',dark:false},
    {name:'Deep Space',primary:'#4f46e5',accent:'#818cf8',balBg1:'#0f0e26',balBg2:'#1e1b4b',bg:'#1e1b4b',dark:true}
  ],
  fonts:['DM Sans','Inter','Poppins','Sora','Nunito','Outfit'],
  otpTypes:[{label:'OTP Code (SMS)',value:'otp'},{label:'App Authorization',value:'app'},{label:'Auth Code',value:'auth'},{label:'OTP + App Auth',value:'both'},{label:'None',value:'none'}],
  fieldTypes:[{label:'Username + Password',value:'credentials'},{label:'Phone + PIN',value:'phone'},{label:'Email + Password',value:'email'},{label:'Account Number',value:'account'}],
  actionLabels:{
    topup:['Add Money','Add Funds','Top Up'],cashout:['Withdraw','Cash Out','Transfer Out'],
    send:['Send Money','Transfer','Pay'],request:['Request Money','Ask for Money'],
    balance:['Total Balance','Available Balance'],cards:['Cards','Accounts','Methods'],
    addCard:['Add Card','Link Card'],refer:['Refer & Earn','Invite Friends'],receipts:['Receipts','Statements']
  }
};
