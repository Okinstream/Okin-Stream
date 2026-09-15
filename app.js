// OKIN STREAM v7.0 — Multi-stream + Cast
// ─── FIREBASE ────────────────────────────────────────
const DB = 'https://okin-stream-765b2-default-rtdb.firebaseio.com';
const FB_CONFIG = {
  apiKey: "AIzaSyDuaj__IpSgTeR0dh2EjM1kSxhCyAEk5iQ",
  authDomain: "okin-stream-765b2.firebaseapp.com",
  databaseURL: "https://okin-stream-765b2-default-rtdb.firebaseio.com",
  projectId: "okin-stream-765b2",
  storageBucket: "okin-stream-765b2.firebasestorage.app",
  messagingSenderId: "1021775528201",
  appId: "1:1021775528201:web:e3d949e45f9581d11e13d8"
};

let db = null;
let streams = {};

// PWA — vrai dès que le navigateur signale que l'app est installable
// (Chrome/Android/desktop, via beforeinstallprompt). iOS ne déclenche jamais
// cet événement, donc on initialise à true sur iOS pour proposer le guide
// manuel. Déclaré ici (et pas dans le bloc PWA en bas du fichier) car
// renderAccount() peut s'exécuter avant que ce bloc ne soit atteint.
let pwaCanInstall = /iphone|ipad|ipod/i.test(navigator.userAgent);

// ═══════════════════════════════════════════════════
// ── CONSOLE DE DÉBOGAGE INTÉGRÉE ──
// Sur téléphone, impossible d'ouvrir les outils développeur. Ce panneau
// capture tout ce qui passe par console.log/warn/error ainsi que les erreurs
// JavaScript non rattrapées, et les affiche dans l'app avec un bouton
// "Copier". Réservé aux admins, ou activable par n'importe qui via ?debug=1.
// ═══════════════════════════════════════════════════
const DBG_MAX = 300;
let _dbgLogs = [];
let _dbgOpen = false;
let _dbgForced = false;
try{ _dbgForced = new URLSearchParams(location.search).get('debug') === '1'; }catch(e){}

function dbgPush(level, args){
  let txt;
  try{
    txt = Array.from(args).map(function(a){
      if(a instanceof Error) return (a.message||'') + (a.stack ? ('\n' + a.stack.split('\n').slice(0,3).join('\n')) : '');
      if(typeof a === 'object' && a !== null){
        try{ return JSON.stringify(a).slice(0, 400); }catch(e){ return String(a); }
      }
      return String(a);
    }).join(' ');
  }catch(e){ txt = '[log illisible]'; }
  const t = new Date();
  const hh = String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0') + ':' + String(t.getSeconds()).padStart(2,'0');
  _dbgLogs.push({level: level, time: hh, txt: txt});
  if(_dbgLogs.length > DBG_MAX) _dbgLogs.shift();
  if(_dbgOpen) dbgRender();
  // Pastille rouge sur le bouton quand une erreur survient
  if(level === 'error' || level === 'warn'){
    const b = document.getElementById('dbg-fab');
    if(b) b.classList.add('dbg-has-err');
  }
}

// On enveloppe les méthodes natives sans les remplacer : la vraie console
// continue de fonctionner normalement sur ordinateur.
(function hookConsole(){
  ['log','warn','error','info'].forEach(function(lvl){
    const orig = console[lvl] ? console[lvl].bind(console) : function(){};
    console[lvl] = function(){ try{ dbgPush(lvl, arguments); }catch(e){} orig.apply(null, arguments); };
  });
  window.addEventListener('error', function(e){
    dbgPush('error', ['[JS] ' + (e.message||'erreur') + ' @ ' + (e.filename||'').split('/').pop() + ':' + (e.lineno||'?')]);
  });
  window.addEventListener('unhandledrejection', function(e){
    const r = e.reason;
    dbgPush('error', ['[Promise] ' + (r && (r.message || r.code) ? (r.message || r.code) : String(r))]);
  });
})();

function dbgVisible(){ return _dbgForced || (typeof isAdmin === 'function' && isAdmin()); }

function dbgRender(){
  const body = document.getElementById('dbg-body');
  if(!body) return;
  if(!_dbgLogs.length){ body.innerHTML = '<div class="dbg-empty">Aucun message pour l\'instant</div>'; return; }
  body.innerHTML = _dbgLogs.map(function(l){
    return '<div class="dbg-line dbg-' + l.level + '"><span class="dbg-time">' + l.time + '</span>'
      + '<span class="dbg-txt">' + escHtml(l.txt) + '</span></div>';
  }).join('');
  body.scrollTop = body.scrollHeight;
}

function dbgToggle(){
  const ov = document.getElementById('dbg-ov');
  if(!ov) return;
  _dbgOpen = !_dbgOpen;
  ov.style.display = _dbgOpen ? 'flex' : 'none';
  const b = document.getElementById('dbg-fab');
  if(b) b.classList.remove('dbg-has-err');
  if(_dbgOpen) dbgRender();
}
function dbgClear(){ _dbgLogs = []; dbgRender(); }
function dbgCopy(){
  const txt = _dbgLogs.map(function(l){ return '[' + l.time + '] ' + l.level.toUpperCase() + ' ' + l.txt; }).join('\n');
  const info = 'Okin Stream — logs\n' + navigator.userAgent + '\n' + location.href + '\n\n';
  const full = info + txt;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(full).then(function(){ toast('📋 Logs copiés'); })
      .catch(function(){ dbgFallbackCopy(full); });
  } else { dbgFallbackCopy(full); }
}
function dbgFallbackCopy(txt){
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); toast('📋 Logs copiés'); }
  catch(e){ toast('Copie impossible'); }
  document.body.removeChild(ta);
}

// Injecte le bouton flottant + le panneau dans la page
function dbgMount(){
  if(document.getElementById('dbg-fab') || !dbgVisible()) return;
  const fab = document.createElement('button');
  fab.id = 'dbg-fab';
  fab.className = 'dbg-fab';
  fab.title = 'Console de débogage';
  fab.onclick = dbgToggle;
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
  document.body.appendChild(fab);

  const ov = document.createElement('div');
  ov.id = 'dbg-ov';
  ov.className = 'dbg-ov';
  ov.style.display = 'none';
  ov.innerHTML =
      '<div class="dbg-panel">'
    +   '<div class="dbg-head">'
    +     '<span class="dbg-title">Console</span>'
    +     '<button class="dbg-btn" onclick="dbgCopy()">Copier</button>'
    +     '<button class="dbg-btn" onclick="dbgClear()">Vider</button>'
    +     '<button class="dbg-btn dbg-close" onclick="dbgToggle()">✕</button>'
    +   '</div>'
    +   '<div class="dbg-body" id="dbg-body"></div>'
    + '</div>';
  document.body.appendChild(ov);
}
// Montage : immédiat si ?debug=1, sinon on retente pendant 60s le temps que
// le statut admin remonte de Firebase (et attachAdminListener le fait aussi
// dès qu'il connaît le statut).
function dbgTryMount(){
  try{
    dbgMount();
    if(document.getElementById('dbg-fab')) return true;
  }catch(e){ console && console.warn && console.warn('[dbg]', e.message); }
  return false;
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', dbgTryMount);
} else {
  dbgTryMount();
}
(function(){
  let tries = 0;
  const it = setInterval(function(){
    tries++;
    if(dbgTryMount() || tries > 20) clearInterval(it);
  }, 3000);
})();

// ── Sécurité XSS — échapper le HTML dans les données externes ──
function escHtml(s){
  if(!s) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}



let auth = null;
let currentUser = null;

// ── Parrainage : capture ?ref=CODE dès l'arrivée sur le site, avant même
// la connexion — l'utilisateur peut créer son compte APRÈS avoir cliqué le
// lien, donc on garde le code en attente jusqu'à la connexion. ──
(function captureReferralParam(){
  try{
    const ref = new URLSearchParams(location.search).get('ref');
    if(ref) localStorage.setItem('pending_referral', ref.trim().toUpperCase());
  }catch(e){}
})();
function linkPendingReferral(uid){
  let ref;
  try{ ref = localStorage.getItem('pending_referral'); }catch(e){ return; }
  if(!ref) return;
  fetch('/api/referral/link', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({uid, ref}),
  }).finally(() => { try{ localStorage.removeItem('pending_referral'); }catch(e){} });
}
let referralInfo = null; // {code, paidCount, monthsEarned, progress} — mis en cache après 1er fetch
async function loadReferralInfo(){
  if(!currentUser) return null;
  try{
    const res = await fetch('/api/referral/me', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({uid: currentUser.uid}),
    });
    const data = await res.json();
    if(data.ok){ referralInfo = data; return data; }
  }catch(e){}
  return null;
}
function copyReferralLink(){
  if(!referralInfo?.code) return;
  const link = location.origin + '/?ref=' + referralInfo.code;
  navigator.clipboard?.writeText(link)
    .then(()=>toast('🔗 Lien de parrainage copié !'))
    .catch(()=>toast('Impossible de copier'));
}
function toggleRefHowto(){
  const el=$('pf-ref-howto'),chev=$('pf-ref-howto-chevron');
  if(!el)return;
  const open=el.style.display!=='none';
  el.style.display=open?'none':'block';
  if(chev)chev.style.transform=open?'':'rotate(180deg)';
}

function initFirebase(){
  try {
    const fbApp = firebase.initializeApp(FB_CONFIG);
    db = firebase.database();
    auth = firebase.auth();
    // Observer état connexion
    auth.onAuthStateChanged(user => {
      const prevUid = currentUser?.uid;
      if(prevUid && prevUid !== user?.uid){
        detachVIPListener(prevUid);
        detachAdminListener(prevUid);
        detachNameColorListener(prevUid);
        detachPhotoListener(prevUid);
      }
      currentUser = user;
      updateAuthUI();
      if(user){
        attachVIPListener(user.uid);
        attachAdminListener(user.uid);
        saveOwnProfile(user);
        attachNameColorListener(user.uid);
        attachPhotoListener(user.uid);
        linkPendingReferral(user.uid);
        loadReferralInfo().then(()=>{ if(page==='account') renderContent(); });
      } else {
        // Déconnecté : le VIP n'est plus garanti par Firebase → on repasse à "non VIP"
        vipLive = {active:false, exp:0, key:null};
        isAdminCache = false;
        myNameColor = null;
        myPhoto = null;
        try{ localStorage.removeItem('vip_key'); localStorage.removeItem('vip_exp'); localStorage.removeItem('name_color'); }catch(e){}
        updateVIPCard(); updateVIPOv();
      }
    });

    loadStreams();
  } catch(e) {
    console.warn('Firebase init error:', e);
  }
}

// Récupère le token Firebase pour les requêtes REST authentifiées
function getAuthToken(){
  return new Promise(function(resolve){
    if(!auth || !auth.currentUser){ resolve(null); return; }
    auth.currentUser.getIdToken(false)
      .then(function(t){ resolve(t); })
      .catch(function(){ resolve(null); });
  });
}

// fetch REST Firebase avec auth token automatique
function fbFetch(path, options){
  return getAuthToken().then(function(token){
    var sep = path.includes('?') ? '&' : '?';
    var url = DB + path + sep + 'ts=' + Date.now() + (token ? '&auth='+token : '');
    return fetch(url, options);
  });
}

// ── AUTH STATE UI ──
function updateAuthUI(){
  // Avant, ça ne re-rendait que la page Compte → la carte "Administration"
  // sur le Dashboard ne se mettait jamais à jour après une promotion admin.
  // renderContent() gère déjà le cas adminOpen (rend le panel admin) donc
  // on peut l'appeler sans condition.
  renderContent();
  updateVIPCard();
  chatUpdateAuthUI();
}

// ── VIP — Firebase est la SEULE source de vérité pour un compte connecté.
// localStorage ne sert plus que de cache d'affichage (jamais de preuve).
let vipLive = { active:false, exp:0, key:null };

// Applique un objet VIP brut (venu du temps réel OU du secours HTTPS)
function applyVipValue(v){
  if(!v || (!v.key && !v.exp)){
    vipLive = {active:false, exp:0, key:null};
    try{ localStorage.removeItem('vip_key'); localStorage.removeItem('vip_exp'); }catch(e){}
    updateVIPCard(); updateVIPOv();
    if(page==='account') renderContent();
    return;
  }
  const active = v.exp ? Date.now() < v.exp : true;
  vipLive = {active, exp: v.exp || Infinity, key: v.key || null};
  try{ localStorage.setItem('vip_key', v.key||''); localStorage.setItem('vip_exp', String(v.exp||'')); }catch(e){}
  updateVIPCard(); updateVIPOv();
  if(page==='account') renderContent();
}

// SECOURS : le listener temps réel ci-dessous passe par le WebSocket Firebase.
// Si celui-ci est bloqué (bloqueur de pub, réseau d'entreprise, proxy…), le
// statut VIP n'arrivait JAMAIS — l'utilisateur activait sa clé et ne voyait
// aucun changement, même après reconnexion. Cette lecture unique passe en
// HTTPS classique et débloque ces cas.
function vipRestFallback(uid){
  if(!uid) return;
  getAuthToken().then(function(token){
    const base = 'https://okin-stream-765b2-default-rtdb.firebaseio.com';
    const url = base + '/users/' + uid + '/vip.json' + (token ? ('?auth=' + token) : '');
    return fetch(url).then(r => r.ok ? r.json() : null);
  }).then(function(v){
    // On n'écrase pas une info temps réel déjà reçue et valide
    if(vipLive && vipLive.active) return;
    if(v) applyVipValue(v);
  }).catch(function(e){ console.warn('[vip] secours HTTPS échoué:', e && e.message); });
}

// Enregistre son propre profil (email + pseudo) dans la base, pour que le
// panel admin puisse identifier un utilisateur à partir de son ID. Firebase
// Auth ne permet pas de chercher un autre compte depuis le client, et les
// règles empêchent de lire le nœud d'un autre utilisateur — c'est donc le
// serveur qui lira ces champs, avec son secret.
function saveOwnProfile(user){
  if(!db || !user) return;
  const p = {
    email: user.email || null,
    pseudo: (user.displayName || (user.email||'').split('@')[0] || '').slice(0,40) || null,
    lastSeen: Date.now(),
  };
  db.ref('users/'+user.uid+'/profile').update(p).catch(function(e){
    console.warn('[profil] enregistrement refusé:', e && e.message);
  });
}

function attachVIPListener(uid){
  if(!db || !uid) return;
  // Filet de sécurité : si rien n'est arrivé par le temps réel au bout de 5s,
  // on tente la lecture HTTPS.
  setTimeout(function(){ if(!vipLive || !vipLive.active) vipRestFallback(uid); }, 5000);
  db.ref('users/'+uid+'/vip').on('value', function(snap){
    // Le champ "key" est absent du VIP offert par parrainage : on se base sur
    // la date d'expiration, seule chose qui compte réellement.
    applyVipValue(snap.val());
  }, function(err){
    console.warn('[vip] temps réel refusé:', err && err.message);
    vipRestFallback(uid);
  });
}
function detachVIPListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/vip').off();
}

// ── Couleur de pseudo VIP (1 à 6, façon "chrome" Brawl Stars) ──
// Réservé aux VIP : la sélection est ignorée côté rendu si l'utilisateur n'est plus VIP.
let myNameColor = null;
function attachNameColorListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/nameColor').on('value', snap=>{
    myNameColor = snap.val() || null;
    try{ localStorage.setItem('name_color', myNameColor ? String(myNameColor) : ''); }catch(e){}
    if(page==='account') renderContent();
  });
}
function detachNameColorListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/nameColor').off();
}

// ── Photo de profil VIP ──
// On N'UTILISE PLUS Firebase Storage : depuis fin 2024, Cloud Storage exige un
// plan payant (Blaze) sur les nouveaux projets, ce qui faisait échouer l'upload
// silencieusement. À la place on redimensionne l'image à 256px, on la compresse
// en JPEG, et on stocke la chaîne base64 directement dans la Realtime Database
// (gratuite). ~40 Ko par photo, largement acceptable.
let myPhoto = null;
function attachPhotoListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/photo').on('value', snap=>{
    myPhoto = snap.val() || null;
    if(page==='account') renderContent();
  });
}
function detachPhotoListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/photo').off();
}
function setNameColor(n){
  if(!isVIP()){ toast('Réservé aux membres VIP'); return; }
  if(!currentUser || !db) return;
  myNameColor = n || null;
  db.ref('users/'+currentUser.uid+'/nameColor').set(myNameColor);
  _pseudoColorsOpen = false; // le panneau se referme après le choix
  renderContent();
}

// Panneau de couleurs replié/déplié — l'état survit au re-render de la page
let _pseudoColorsOpen = false;
function togglePseudoColors(){
  _pseudoColorsOpen = !_pseudoColorsOpen;
  const pop = document.getElementById('pf-color-pop');
  if(pop) pop.style.display = _pseudoColorsOpen ? '' : 'none';
}

// ── CONNEXION GOOGLE ──
function signInWithGoogle(){
  if(!auth){ toast('Firebase non prêt'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  auth.signInWithPopup(provider)
    .then(result => {
      const first = (result.user.displayName || result.user.email || '').split(' ')[0];
      toast('Connecté — ' + first);
      closeAuthModal();
      if(page === 'account') renderContent();
    })
    .catch(err => {
      if(err.code === 'auth/popup-closed-by-user') return; // user cancelled
      if(err.code === 'auth/popup-blocked'){
        toast('Popup bloquée — autorise les popups pour ce site');
      } else if(err.code === 'auth/unauthorized-domain'){
        toast('Domaine non autorisé — ajoute-le dans Firebase Auth');
      } else {
        toast('Erreur Google : ' + (err.code || err.message));
      }
    });
}



// ── CONNEXION EMAIL ──
function signInWithEmail(){
  const email = document.getElementById('auth-email')?.value.trim();
  const pwd   = document.getElementById('auth-pwd')?.value;
  if(!email||!pwd){ toast('Remplis tous les champs'); return; }
  if(!auth) return;
  setAuthLoading(true);
  auth.signInWithEmailAndPassword(email, pwd)
    .then(r => { toast('👋 Connecté !'); closeAuthModal(); })
    .catch(err => {
      setAuthLoading(false);
      if(err.code==='auth/user-not-found'||err.code==='auth/wrong-password') toast('❌ Email ou mot de passe incorrect');
      else if(err.code==='auth/invalid-email') toast('❌ Email invalide');
      else toast('❌ Erreur : '+err.code);
    });
}

// ── FORCE DU MOT DE PASSE ──
// Règles : 6+ caractères, 1 majuscule, 1 minuscule, 1 caractère spécial
function pwdRules(pwd){
  return {
    len:  pwd.length >= 6,
    up:   /[A-Z]/.test(pwd),
    low:  /[a-z]/.test(pwd),
    spec: /[^A-Za-z0-9]/.test(pwd),
  };
}
function pwdIsValid(pwd){
  const r = pwdRules(pwd);
  return r.len && r.up && r.low && r.spec;
}
function pwdStrengthScore(pwd){
  if(!pwd) return 0;
  const r = pwdRules(pwd);
  let score = [r.len, r.up, r.low, r.spec].filter(Boolean).length; // 0-4
  if(pwd.length >= 10 && score === 4) score = 4; // cap
  return score;
}
const PWD_STRENGTH_META = [
  {label:'Trop faible', color:'#e5484d'},
  {label:'Faible',      color:'#e5484d'},
  {label:'Moyen',       color:'#f5a623'},
  {label:'Bon',         color:'#e8c547'},
  {label:'Excellent',   color:'#3ec972'},
];
function updatePwdStrength(){
  const pwd = document.getElementById('auth-pwd')?.value || '';
  const bar = document.getElementById('pwd-strength-fill');
  const lbl = document.getElementById('pwd-strength-label');
  const r   = pwdRules(pwd);
  const score = pwdStrengthScore(pwd);
  const meta  = PWD_STRENGTH_META[score];
  if(bar){ bar.style.width = (score/4*100)+'%'; bar.style.background = meta.color; }
  if(lbl){ lbl.textContent = pwd ? meta.label : ''; lbl.style.color = meta.color; }
  const setRule=(id,ok)=>{ const el=document.getElementById(id); if(!el) return; el.classList.toggle('ok',ok); };
  setRule('pwd-rule-len',  r.len);
  setRule('pwd-rule-up',   r.up);
  setRule('pwd-rule-low',  r.low);
  setRule('pwd-rule-spec', r.spec);
}

// ── INSCRIPTION EMAIL ──
function signUpWithEmail(){
  const email = document.getElementById('auth-email')?.value.trim();
  const pwd   = document.getElementById('auth-pwd')?.value;
  const conf  = document.getElementById('auth-pwd-confirm')?.value;
  if(!email||!pwd){ toast('Remplis tous les champs'); return; }
  const r = pwdRules(pwd);
  if(!r.len){ toast('Mot de passe : 6 caractères minimum'); return; }
  if(!r.up){ toast('Mot de passe : ajoute une majuscule'); return; }
  if(!r.low){ toast('Mot de passe : ajoute une minuscule'); return; }
  if(!r.spec){ toast('Mot de passe : ajoute un caractère spécial (ex: ! ? # @)'); return; }
  if(conf!==undefined && pwd!==conf){ toast('❌ Les mots de passe ne correspondent pas'); return; }
  if(!auth) return;
  setAuthLoading(true);
  auth.createUserWithEmailAndPassword(email, pwd)
    .then(r => {
      setAuthLoading(false);
      closeAuthModal();
      // On garde l'utilisateur connecté (nécessaire pour appeler notre backend
      // avec son uid) mais on affiche immédiatement le popup de code —
      // tant qu'il n'a pas entré le bon code, on considère le compte non-vérifié.
      openVerifyCodeModal(r.user.uid, email);
      sendVerifCode(r.user.uid, email, true);
    })
    .catch(err => {
      setAuthLoading(false);
      if(err.code==='auth/email-already-in-use') toast('❌ Email déjà utilisé');
      else if(err.code==='auth/invalid-email') toast('❌ Email invalide');
      else if(err.code==='auth/weak-password') toast('❌ Mot de passe trop faible');
      else toast('❌ Erreur : '+err.code);
    });
}

// ── ENVOI DU CODE (backend /api/auth/send-code) ──
let verifCooldownTimer = null;
async function sendVerifCode(uid, email, silent){
  try{
    const r = await fetch('/api/auth/send-code', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({uid, email})
    });
    const json = await r.json();
    if(json.ok){
      if(!silent) toast('📧 Nouveau code envoyé');
      startVerifCooldown(45);
    } else if(json.error==='cooldown'){
      startVerifCooldown(Math.ceil((json.retryInMs||45000)/1000));
    } else {
      toast('❌ Erreur envoi du code');
    }
  }catch(e){
    toast('❌ Impossible de contacter le serveur');
  }
}
function startVerifCooldown(seconds){
  clearInterval(verifCooldownTimer);
  const btn = document.getElementById('verif-resend-btn');
  if(!btn) return;
  let s = seconds;
  const tick=()=>{
    if(s<=0){ btn.disabled=false; btn.textContent='Renvoyer le code'; clearInterval(verifCooldownTimer); return; }
    btn.disabled=true; btn.textContent = `Renvoyer (${s}s)`; s--;
  };
  tick();
  verifCooldownTimer = setInterval(tick, 1000);
}

// ── POPUP CODE DE VÉRIFICATION (5-6 chiffres) ──
let verifModalUid = null, verifModalEmail = null;
function openVerifyCodeModal(uid, email){
  verifModalUid = uid; verifModalEmail = email;
  document.getElementById('verif-code-ov')?.remove();
  const ov = document.createElement('div');
  ov.id = 'verif-code-ov';
  ov.className = 'verif-code-ov';
  ov.innerHTML = `
    <div class="verif-code-modal">
      <div class="verif-code-icon">📧</div>
      <div class="verif-code-title">Vérifie ton email</div>
      <div class="verif-code-sub">On a envoyé un code à 6 chiffres à<br><b>${escHtml(email)}</b></div>
      <input id="verif-code-input" class="verif-code-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" autocomplete="one-time-code">
      <div id="verif-code-error" class="verif-code-error"></div>
      <button class="verif-code-submit" onclick="submitVerifCode()">Vérifier</button>
      <button id="verif-resend-btn" class="verif-code-resend" onclick="sendVerifCode(verifModalUid, verifModalEmail, false)" disabled>Renvoyer (45s)</button>
      <button class="verif-code-cancel" onclick="cancelVerifCode()">Annuler l'inscription</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>ov.classList.add('open'));
  setTimeout(()=>{
    const inp = document.getElementById('verif-code-input');
    inp?.focus();
    inp?.addEventListener('input', ()=>{ inp.value = inp.value.replace(/\D/g,'').slice(0,6); });
    inp?.addEventListener('keydown', e=>{ if(e.key==='Enter') submitVerifCode(); });
  }, 50);
  startVerifCooldown(45);
}
function closeVerifyCodeModal(){
  const ov = document.getElementById('verif-code-ov');
  if(!ov) return;
  ov.classList.remove('open');
  setTimeout(()=>ov.remove(), 250);
  clearInterval(verifCooldownTimer);
}
async function submitVerifCode(){
  const inp = document.getElementById('verif-code-input');
  const errEl = document.getElementById('verif-code-error');
  const code = inp?.value.trim();
  if(!code || code.length<6){ if(errEl) errEl.textContent='Entre les 6 chiffres du code'; return; }
  const btn = document.querySelector('.verif-code-submit');
  if(btn){ btn.disabled=true; btn.textContent='Vérification…'; }
  try{
    const r = await fetch('/api/auth/verify-code', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({uid: verifModalUid, code})
    });
    const json = await r.json();
    if(json.ok){
      toast('✅ Email vérifié — bienvenue !');
      closeVerifyCodeModal();
      if(page==='account') renderContent();
    } else {
      const messages = {
        wrong_code: 'Code incorrect', expired: 'Code expiré — renvoie-en un nouveau',
        too_many_attempts: 'Trop de tentatives — renvoie un nouveau code', no_code: 'Aucun code actif — renvoie-en un',
      };
      if(errEl) errEl.textContent = messages[json.error] || 'Erreur de vérification';
      if(btn){ btn.disabled=false; btn.textContent='Vérifier'; }
    }
  }catch(e){
    if(errEl) errEl.textContent = 'Erreur réseau';
    if(btn){ btn.disabled=false; btn.textContent='Vérifier'; }
  }
}
function cancelVerifCode(){
  closeVerifyCodeModal();
  // Compte créé mais non vérifié → on déconnecte, l'utilisateur pourra
  // se reconnecter et re-déclencher un code plus tard.
  auth?.signOut();
  toast('Inscription annulée');
}

// ── MOT DE PASSE OUBLIÉ ──
function resetPassword(){
  const email = document.getElementById('auth-email')?.value.trim();
  if(!email){ toast("Entre ton email d'abord"); return; }
  if(!auth) return;
  auth.sendPasswordResetEmail(email)
    .then(()=> toast('📧 Email de réinitialisation envoyé'))
    .catch(()=> toast('❌ Email introuvable'));
}

// ── DÉCONNEXION ──
function signOut(){
  if(!auth) return;
  auth.signOut().then(()=>{
    currentUser=null;
    // Fix #6 : supprimer la clé VIP dès la déconnexion
    localStorage.removeItem('vip_key');
    localStorage.removeItem('vip_exp');
    updateVIPCard();
    toast('Déconnecté');
    if(page==='account') renderContent();
  });
}

// ── MODAL AUTH ──
let authMode = 'login'; // 'login' | 'register'

function openAuthModal(mode='login'){
  authMode = mode;
  const ov = document.getElementById('auth-ov');
  if(!ov) return;
  renderAuthModal();
  ov.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeAuthModal(){
  const ov = document.getElementById('auth-ov');
  if(!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow='';
}

function switchAuthMode(mode){
  authMode = mode;
  renderAuthModal();
}

function setAuthLoading(on){
  const btn = document.getElementById('auth-submit-btn');
  if(btn){ btn.disabled=on; btn.style.opacity=on?'.6':'1'; }
}

function renderAuthModal(){
  const wrap = document.getElementById('auth-modal-body');
  if(!wrap) return;
  const isLogin = authMode === 'login';
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const G = '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';

  wrap.innerHTML = ''
    + '<div class="auth-modal-tabs">'
      + '<button class="auth-modal-tab'+(isLogin?' on':'')+'" onclick="switchAuthMode(\'login\')">Connexion</button>'
      + '<button class="auth-modal-tab'+(!isLogin?' on':'')+'" onclick="switchAuthMode(\'register\')">Inscription</button>'
    + '</div>'
    + '<div class="auth-form-fields">'
      + '<div class="auth-form-field">'
        + '<label class="auth-form-label">Email</label>'
        + '<input id="auth-email" class="auth-form-input" type="email" placeholder="exemple@gmail.com" autocomplete="email" inputmode="email">'
      + '</div>'
      + '<div class="auth-form-field">'
        + '<label class="auth-form-label">Mot de passe</label>'
        + '<div class="auth-form-input-wrap">'
          + '<input id="auth-pwd" class="auth-form-input" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="'+(isLogin?'current-password':'new-password')+'" oninput="updatePwdStrength()">'
          + '<button class="auth-form-eye" type="button" onclick="togglePwdVisibility(\'auth-pwd\')">'+EYE+'</button>'
        + '</div>'
        + (!isLogin
            ? '<div class="pwd-strength-wrap">'
                + '<div class="pwd-strength-track"><div id="pwd-strength-fill" class="pwd-strength-fill"></div></div>'
                + '<div id="pwd-strength-label" class="pwd-strength-label"></div>'
              + '</div>'
              + '<div class="pwd-rules-list">'
                + '<span id="pwd-rule-len" class="pwd-rule">6+ caractères</span>'
                + '<span id="pwd-rule-up" class="pwd-rule">Majuscule</span>'
                + '<span id="pwd-rule-low" class="pwd-rule">Minuscule</span>'
                + '<span id="pwd-rule-spec" class="pwd-rule">Caractère spécial</span>'
              + '</div>'
            : '')
      + '</div>'
      + (!isLogin
          ? '<div class="auth-form-field">'
              + '<label class="auth-form-label">Confirmer le mot de passe</label>'
              + '<div class="auth-form-input-wrap">'
                + '<input id="auth-pwd-confirm" class="auth-form-input" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="new-password">'
                + '<button class="auth-form-eye" type="button" onclick="togglePwdVisibility(\'auth-pwd-confirm\')">'+EYE+'</button>'
              + '</div>'
            + '</div>'
          : '')
    + '</div>'
    + '<button id="auth-submit-btn" class="auth-form-submit" onclick="'+(isLogin?'signInWithEmail()':'signUpWithEmail()') +'">'
      + (isLogin ? 'Se connecter' : 'Cr\u00e9er mon compte')
    + '</button>'
    + (isLogin ? '<button class="auth-form-forgot" onclick="resetPassword()">Mot de passe oubli\u00e9 ?</button>' : '')
    + '<div class="auth-form-or"><span>ou</span></div>'
    + '<button class="auth-form-google" onclick="signInWithGoogle()">'+G+' Continuer avec Google</button>'
    + '<div class="auth-form-switch">'
      + (isLogin
          ? 'Pas de compte ? <button class="auth-form-switch-btn" onclick="switchAuthMode(\'register\')">S\'inscrire</button>'
          : 'D\u00e9j\u00e0 un compte ? <button class="auth-form-switch-btn" onclick="switchAuthMode(\'login\')">Se connecter</button>')
    + '</div>';

  setTimeout(function(){ var el = document.getElementById('auth-email'); if(el) el.focus(); }, 80);
}

function togglePwdVisibility(id){
  const inp = document.getElementById(id);
  if(!inp) return;
  inp.type = inp.type==='password'?'text':'password';
}

function loadStreams(){
  // 1. localStorage en priorité
  try{
    const local = JSON.parse(localStorage.getItem('okin_streams')||'{}');
    Object.assign(streams, local);
  }catch(e){}

  applyStreams();
  renderContent();

  // 2. Firebase — merge : Firebase enrichit, ne supprime JAMAIS le local
  if(db){
    db.ref('streams').on('value', snap => {
      const fbStreams = snap.val() || {};

      // Firebase ajoute/met à jour seulement si son timestamp est plus récent
      Object.entries(fbStreams).forEach(([k,v]) => {
        const local = streams[k];
        if(!local || (v?.updatedAt||0) > (local?.updatedAt||0)){
          streams[k] = v;
        }
      });

      // On ne supprime JAMAIS un stream local qui n'est pas dans Firebase
      // (peut arriver si Firebase n'a pas encore reçu l'écriture)
      // La source de vérité = localStorage + ce qu'on vient de sauvegarder

      try{ localStorage.setItem('okin_streams', JSON.stringify(streams)); }catch(e){}
      applyStreams();
      renderContent();
    });
  }
}

function applyStreams(){
  Object.values(data.byDate).flat().forEach(m => {
    const s = streams[String(m.id)];
    if(!s){delete m.streamUrl;delete m.streamSources;return;}
    if(s.sources?.length){
      const idx=s.activeIdx||0;
      m.streamUrl=s.sources[idx]?.url||null;
      m.streamSources=s.sources;
      m.streamActiveIdx=idx;
    } else if(s.url){
      m.streamUrl=s.url;
      m.streamSources=[{url:s.url,label:s.label||'Source 1'}];
      m.streamActiveIdx=0;
    }
  });
}

// Retourne l'URL active d'un match (compatible ancien et nouveau format)
function getStreamUrl(m){
  const s=streams[String(m.id)];
  if(s?.sources?.length) return s.sources[s.activeIdx||0]?.url||null;
  if(s?.url) return s.url;
  return m.streamUrl||null;
}


// Clés API retirées du client — tout passe par /api/ sur le serveur
const COMPS={
  CL:'Champions League',EL:'Europa League',EC:'Conf. League',
  PL:'Premier League',PD:'La Liga',BL1:'Bundesliga',
  SA:'Serie A',FL1:'Ligue 1',PPL:'Primeira Liga',
  DED:'Eredivisie',BSA:'Brasileirao',MLS:'MLS',
};
// ─── YOUTUBE ─────────────────────────────────────────
// La clé API YouTube ne vit plus jamais côté client : elle reste sur le
// serveur (variable d'env YT_KEY) et on passe par le proxy /api/yt/search.
const YT_BASE = '/api/yt';

const PROXIES=[
  u=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u=>`https://corsproxy.org/?${encodeURIComponent(u)}`,
];

// ─── HAPTIC FEEDBACK ─────────────────────────────────
function haptic(ms=8){ navigator.vibrate?.(ms); }

// ─── NOTIFICATIONS DE BUTS ───────────────────────────
// Stocke les IDs d'équipes pour lesquelles l'utilisateur veut des notifs de buts
let goalNotifTeams = new Set(JSON.parse(localStorage.getItem('goal_notif_teams')||'[]').map(Number));

function toggleGoalNotif(teamId, teamName, ev){
  if(ev) ev.stopPropagation();
  teamId = Number(teamId);
  if(goalNotifTeams.has(teamId)){
    goalNotifTeams.delete(teamId);
    toast('🔕 Alertes buts désactivées — '+teamName);
  } else {
    // Demander la permission si pas encore accordée
    if('Notification' in window && Notification.permission === 'default'){
      Notification.requestPermission().then(perm=>{
        if(perm === 'granted'){
          goalNotifTeams.add(teamId);
          localStorage.setItem('goal_notif_teams', JSON.stringify([...goalNotifTeams]));
          toast('🔔 Alertes buts activées — '+teamName);
          updateGoalNotifBtns();
        } else {
          toast('❌ Permission notifications refusée');
        }
      });
      return;
    }
    goalNotifTeams.add(teamId);
    toast('🔔 Alertes buts activées — '+teamName);
  }
  localStorage.setItem('goal_notif_teams', JSON.stringify([...goalNotifTeams]));
  updateGoalNotifBtns();
}

function updateGoalNotifBtns(){
  document.querySelectorAll('[data-notif-team]').forEach(btn=>{
    const tid = Number(btn.dataset.notifTeam);
    const on = goalNotifTeams.has(tid);
    btn.classList.toggle('on', on);
    btn.title = on ? 'Désactiver alertes buts' : 'Activer alertes buts';
  });
}

// Vérifier les buts et envoyer des notifications
let _lastGoalHash = {};
function checkGoalNotifications(){
  if(!goalNotifTeams.size) return;
  if(Notification.permission !== 'granted') return;
  const liveMatches = data.live || [];
  liveMatches.forEach(m=>{
    const homeId = m.homeTeam?.id, awayId = m.awayTeam?.id;
    const trackHome = goalNotifTeams.has(homeId);
    const trackAway = goalNotifTeams.has(awayId);
    if(!trackHome && !trackAway) return;
    const score = getScore(m);
    const key = String(m.id);
    if(_lastGoalHash[key] && _lastGoalHash[key] !== score){
      // Un but a été marqué !
      const hn = m.homeTeam.shortName||m.homeTeam.name;
      const an = m.awayTeam.shortName||m.awayTeam.name;
      new Notification('⚽ But !', {
        body: hn+' '+score+' '+an+' — '+getMin(m),
        icon: '/ball.png',
        tag: 'goal-'+key
      });
    }
    _lastGoalHash[key] = score;
  });
}
// Vérifier les buts toutes les 30s (en sync avec loadLiveData)
setInterval(()=>{ if(document.visibilityState==='visible') checkGoalNotifications(); }, 30000);


let page='dashboard',sq='',selectedDate=null,lgFilter='all';
let loading=false,lastFetch=0;
let favorites=new Set(JSON.parse(localStorage.getItem('favs')||'[]').map(x=>isNaN(+x)?x:+x));
let data={live:[],byDate:{}};
let _lastMatchHash=null;

// Multi-stream
// slot = { match, muted }
let slots=[];
let multiOpen=false;
let drawerOpen=false;
const msPlayers={}; // {idx: hlsPlayer|mpegtsPlayer} — un player par slot

// ─── UTILS ───────────────────────────────────────────
const $=id=>document.getElementById(id);
const tx=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
function abbr(n){if(!n)return'?';const w=n.trim().split(/\s+/);return w.length===1?n.slice(0,3).toUpperCase():(w[0][0]+(w[1]?.[0]||'')).toUpperCase();}
function fmtTime(d){return new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}
function fmtSecs(s){return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function dayKey(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function todayKey(){return dayKey(new Date());}
function getScore(m){const g=m.goals;return(g?.home==null||g?.away==null)?'- : -':`${g.home} : ${g.away}`;}
function getMin(m){
  if(m._status){if(m._status.short==='HT')return'MT';const e=m._status.elapsed;if(e==null)return'';return m._status.extra?`${e}+${m._status.extra}'`:`${e}'`;}
  if(m.status==='PAUSED')return'MT';if(m.status==='IN_PLAY')return'LIVE';return'';
}

// ═══════════════════════════════════════════════════
// ── CHRONO À LA SECONDE ──
// Aucune source ne diffuse un flux qui avance seconde par seconde : les API
// (et FlashScore lui-même) ne donnent qu'une MINUTE. On mémorise donc l'instant
// où cette minute a été reçue, puis on extrapole les secondes localement. Un
// ticker rafraîchit l'affichage chaque seconde sans solliciter le réseau.
// ═══════════════════════════════════════════════════
const _clockSync = new Map();   // matchId -> {minute, at}
let _clockTicker = null;

// Mémorise la minute officielle et l'heure de réception (appelé au rafraîchissement)
function noteMatchMinute(m){
  if(!m || !isLive(m)) return;
  const e = m._status?.elapsed;
  if(e == null) return;
  const id = String(m.id);
  const prev = _clockSync.get(id);
  // On ne réinitialise l'ancre que si la minute a changé, sinon le compteur
  // de secondes repartirait de zéro à chaque cycle de rafraîchissement.
  if(!prev || prev.minute !== e) _clockSync.set(id, {minute: e, at: Date.now()});
}

// Renvoie "23:43" à partir de l'ancre mémorisée
function liveClock(m){
  if(!m || !isLive(m)) return '';
  if(m._status?.short === 'HT' || m.status === 'PAUSED') return 'MT';
  const id = String(m.id);
  const sync = _clockSync.get(id);
  const e = m._status?.elapsed;
  if(e == null) return getMin(m);
  if(!sync) { _clockSync.set(id, {minute: e, at: Date.now()}); return e + ':00'; }
  let sec = Math.floor((Date.now() - sync.at) / 1000);
  if(sec > 119) sec = 119; // l'API a du retard : on plafonne au lieu de dériver
  const totalSec = sync.minute * 60 + sec;
  const mm = Math.floor(totalSec / 60), ss = totalSec % 60;
  const extra = m._status?.extra ? '+' + m._status.extra : '';
  return mm + extra + ':' + String(ss).padStart(2,'0');
}

// Met à jour tous les chronos affichés, une fois par seconde
function startClockTicker(){
  if(_clockTicker) return;
  _clockTicker = setInterval(function(){
    if(document.visibilityState !== 'visible') return;
    const els = document.querySelectorAll('[data-clock]');
    if(!els.length) return;
    els.forEach(function(el){
      const m = (data.live||[]).find(x => String(x.id) === el.dataset.clock);
      if(m) el.textContent = liveClock(m);
    });
  }, 1000);
}
function isLive(m){return m.status==='IN_PLAY'||m.status==='PAUSED';}
function isFin(m){return m.status==='FINISHED';}
function crestImg(url,name,cls,team){
  const a=abbr(name);
  const attr=team?` data-team='${JSON.stringify({id:team.id,name:team.name,shortName:team.shortName,crest:team.crest,area:team.area,country:team.country}).replace(/'/g,"&#39;")}' style="cursor:pointer"`:'' ;
  if(url)return`<div class="crest ${cls}"${attr}><img src="${url}" alt="" loading="lazy" onerror="this.style.display='none';if(!this.parentNode.querySelector('.cp')){const d=document.createElement('div');d.className='cp';d.textContent='${a}';this.parentNode.appendChild(d);}"></div>`;
  return`<div class="crest ${cls}"${attr}><div class="cp">${a}</div></div>`;
}
function setCrest(id,url,name){const e=$(id);if(!e)return;const a=abbr(name);e.innerHTML=url?`<img src="${url}" alt="" style="width:100%;height:100%;object-fit:contain;padding:4px" onerror="this.style.display='none';if(!this.parentNode.querySelector('.cp')){const d=document.createElement('div');d.className='cp';d.textContent='${a}';this.parentNode.appendChild(d);}">`:`<div class="cp">${a}</div>`;}

// ─── FETCH via serveur local (clés cachées côté serveur) ──────
// Toutes les requêtes API passent par /api/ sur ton serveur
// Les clés FD_KEY et AF_KEY ne sont PLUS dans le client
async function fdFetch(ep){
  try{
    const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),15000);
    const res=await fetch('/api/fd'+ep,{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok)return null;
    return await res.json();
  }catch(e){return null;}
}
async function afFetch(ep){
  try{
    const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),15000);
    const res=await fetch('/api/af'+ep,{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok)return null;
    return await res.json();
  }catch(e){return null;}
}



// ─── DATA ────────────────────────────────────────────
async function loadMatches(){
  loading=true;renderContent();

  // 1. Afficher le cache localStorage immédiatement
  try{
    const cached=JSON.parse(localStorage.getItem('okin_matches_cache')||'null');
    if(cached?.ts && Date.now()-cached.ts < 6*60*1000 && cached.matches?.length){
      applyMatchData(cached.matches);
      loading=false;
      renderTicker();renderContent();
      setTimeout(scrollDateToSelected,80);
      saveMatchesForAdmin(cached.matches);
      // Rafraîchir en arrière-plan quand même
      fetchMatchesFromServer(false);
      return;
    }
  }catch(e){}

  // 2. Charger depuis le serveur
  await fetchMatchesFromServer(true);
}

async function fetchMatchesFromServer(showLoading){
  try{
    const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),20000);
    const res=await fetch('/api/matches',{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const all=await res.json();
    if(!Array.isArray(all)||!all.length) throw new Error('Pas de matchs');
    // Sauvegarder dans localStorage
    try{ localStorage.setItem('okin_matches_cache', JSON.stringify({ts:Date.now(),matches:all})); }catch(e){}
    const hasChanged=JSON.stringify(all.map(m=>m.id+m.status+m.score?.fullTime?.home+m.score?.fullTime?.away)).toString();
    applyMatchData(all);
    loading=false; lastFetch=Date.now();
    // Ne re-render que si données ont changé ou premier chargement
    if(!_lastMatchHash||_lastMatchHash!==hasChanged){
      _lastMatchHash=hasChanged;
      renderTicker(); renderContent();
    }
    if(data.live.length) loadLiveData();
    setTimeout(scrollDateToSelected,80);
    saveMatchesForAdmin(all);
  }catch(e){
    console.warn('fetchMatchesFromServer error:',e.message);
    loading=false; renderContent();
  }
}

function applyMatchData(all){
  all.sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate));
  data.byDate={};
  for(const m of all){
    if(!data.byDate[m._dayKey])data.byDate[m._dayKey]=[];
    data.byDate[m._dayKey].push(m);
  }
  data.live=all.filter(isLive);
  if(!selectedDate||!data.byDate[selectedDate])selectedDate=todayKey();
}

function saveMatchesForAdmin(all){
  const payload={};
  all.forEach(m=>{
    payload[String(m.id)]={
      id:m.id,
      home:m.homeTeam?.shortName||m.homeTeam?.name||'',
      away:m.awayTeam?.shortName||m.awayTeam?.name||'',
      homeCrest:m.homeTeam?.crest||'',
      awayCrest:m.awayTeam?.crest||'',
      comp:m._cname||'',
      compId:m._cid||'',
      date:m._dayKey||'',
      utcDate:m.utcDate||'',
      status:m.status||'',
      scoreHome:m.score?.fullTime?.home??null,
      scoreAway:m.score?.fullTime?.away??null,
    };
  });
  try{ localStorage.setItem('okin_matches', JSON.stringify(payload)); }catch(e){}
}
function scrollDateToSelected(){
  const bar=$('date-bar'),chip=bar?.querySelector('.date-chip.on');
  if(bar&&chip) bar.scrollTo({left:chip.offsetLeft-bar.offsetWidth/2+chip.offsetWidth/2,behavior:'smooth'});
}

function normTeamName(s){
  return(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // enlève les accents (é→e, ü→u...)
    .replace(/\b(fc|cf|sc|afc|cd|ud|as|ac|ca|sd|rc|1\.)\b/g,'') // sigles de club fréquents qui diffèrent d'une source à l'autre
    .replace(/[^a-z0-9]/g,''); // enlève espaces/points/tirets
}
function teamsFuzzyMatch(m,f){
  const hn=f.teams?.home?.name,an=f.teams?.away?.name;if(!hn||!an)return false;
  const mh=m.homeTeam.name||'',ma=m.awayTeam.name||'';
  const nHn=normTeamName(hn),nAn=normTeamName(an),nMh=normTeamName(mh),nMa=normTeamName(ma);
  // BUG corrigé : la comparaison brute (casse + accents) faisait échouer le
  // matching pour la plupart des équipes dès que la graphie différait un peu
  // d'une source à l'autre (ex: "Munchen" vs "München", "1. FC Union Berlin"
  // vs "Union Berlin") — d'où "seul Union Berlin affiche des infos".
  return(nMh===nHn||nMh.includes(nHn)||nHn.includes(nMh))&&(nMa===nAn||nMa.includes(nAn)||nAn.includes(nMa));
}

// ═══════════════════════════════════════════════════
// ── DLIVE.SX — intégration intelligente de sources ──
// Principe : dlive fournit un embed iframe direct (zéro bande passante
// serveur), on se contente de deviner intelligemment à quel match/chaîne
// chez nous correspond chaque chaîne/event dlive, avec validation admin
// pour les cas incertains. Rien n'écrase jamais une source déjà assignée
// manuellement — dlive s'ajoute toujours en alternative.
// ═══════════════════════════════════════════════════

// ─── Normalisation générique (clés de comparaison) ───
// Enlève accents/casse/ponctuation + mots parasites qui n'apportent aucune
// info de matching (hd/tv/live/officiel...). Les NOMBRES sont conservés
// volontairement (beIN 1 ≠ beIN 2 — les distinguer est vital).
const DLIVE_STOPWORDS = ['hd','sd','fhd','uhd','4k','tv','live','stream','channel','chaine','chaîne','officiel','official','backup','feed','multi'];
function normKey(s){
  let k = (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  DLIVE_STOPWORDS.forEach(w => { k = k.replace(new RegExp('\\b'+w+'\\b','g'), ''); });
  return k.replace(/[^a-z0-9]/g,'');
}

// ─── Distance de Levenshtein + similarité normalisée (0 à 1) ───
function levenshtein(a,b){
  if(a===b)return 0;
  const al=a.length, bl=b.length;
  if(!al)return bl; if(!bl)return al;
  let prev = Array.from({length:bl+1},(_,i)=>i);
  for(let i=1;i<=al;i++){
    const cur=[i];
    for(let j=1;j<=bl;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1+Math.min(prev[j-1],prev[j],cur[j-1]);
    }
    prev=cur;
  }
  return prev[bl];
}
function similarity(a,b){
  const na=normKey(a), nb=normKey(b);
  if(!na && !nb) return 1;
  if(!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na,nb)/maxLen;
}

// ─── Table d'alias manuels (clé normalisée dlive → nom exact chez moi) ───
// Extensible à la main : ajoute une ligne quand un nom dlive récurrent ne
// matche jamais correctement tout seul. Plus fiable qu'un seuil de fuzzy.
const DLIVE_ALIASES = {
  // 'beinsportsfrance1': 'beIN Sport 1',
  // 'canalfootballclub': 'Canal+ Foot',
};

// ─── Construction de l'URL embed dlive (iframe directe, zéro proxy) ───
const DLIVE_FOLDERS = { channel: 'stream', event: 'stream' };
function dliveUrl(channelId, folder='stream'){
  return `https://dlive.sx/${folder}/${folder}-${channelId}.php`;
}

// ─── État du dernier sync + mappings validés/ignorés (chargés depuis Firebase) ───
let dliveSyncMeta = { lastSync: 0, channelsMatched: 0, eventsMatched: 0, channelsPending: 0, eventsPending: 0 };
let dlivePendingChannels = []; // [{dliveName, dliveId, candidates:[{target,score,type}], key}]
let dlivePendingEvents = [];
let dliveMappingConfirmed = { channels:{}, events:{} }; // depuis Firebase /dlive_mapping/
let dliveMappingIgnored = {};

async function loadDliveMappings(){
  if(!db) return;
  try{
    const [chSnap, evSnap, ignSnap] = await Promise.all([
      db.ref('dlive_mapping/channels').once('value'),
      db.ref('dlive_mapping/events').once('value'),
      db.ref('dlive_mapping/ignored').once('value'),
    ]);
    dliveMappingConfirmed.channels = chSnap.val() || {};
    dliveMappingConfirmed.events = evSnap.val() || {};
    dliveMappingIgnored = ignSnap.val() || {};
  }catch(e){ console.error('[dlive] chargement mappings échoué', e.message); }
}

// ─── Matching d'une chaîne dlive vers une de mes chaînes (ADMIN_CHANNELS/TV_CHANNELS) ───
// Retourne {target, score, source: 'admin'|'alias'|'exact'|'fuzzy'} ou null.
function matchChannel(dliveName, myChannels){
  const key = normKey(dliveName);
  // 1. Override admin confirmé — priorité absolue
  const confirmed = dliveMappingConfirmed.channels[key];
  if(confirmed) return { target: confirmed.target, score: 1, source: 'admin' };
  // 2. Table d'alias manuelle
  if(DLIVE_ALIASES[key]) return { target: DLIVE_ALIASES[key], score: 0.95, source: 'alias' };
  // 3. Match exact (clé normalisée identique)
  const exact = myChannels.find(ch => normKey(ch.name) === key);
  if(exact) return { target: exact.name, score: 0.9, source: 'exact' };
  // 4. Fuzzy avec seuil 0.75 — bonus si les deux mentionnent "france"/"fr"
  //    (départage entre versions du même nom pour différents pays)
  const dliveIsFr = /france|\bfr\b/i.test(dliveName);
  let best = null;
  myChannels.forEach(ch => {
    let score = similarity(dliveName, ch.name);
    if(dliveIsFr && /france|\bfr\b/i.test(ch.name)) score = Math.min(1, score + 0.05);
    if(!best || score > best.score) best = { target: ch.name, score, source: 'fuzzy' };
  });
  if(best && best.score >= 0.75) return best;
  return null;
}

// ─── Récupère les N meilleurs candidats (pour la validation admin) ───
function topChannelCandidates(dliveName, myChannels, n=3){
  return myChannels
    .map(ch => ({ target: ch.name, score: similarity(dliveName, ch.name) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, n);
}

// ─── Matching d'un event dlive ("TeamA vs TeamB") vers un de mes matchs ───
function parseDliveEventTeams(title){
  const parts = (title||'').split(/\s+(?:vs\.?|v\.|-|–)\s+/i);
  if(parts.length !== 2) return null;
  return { a: parts[0].trim(), b: parts[1].trim() };
}
function matchEvent(dliveEvent, myMatches){
  const title = dliveEvent.event_name || dliveEvent.name || dliveEvent.title || '';
  const key = normKey(title);
  const confirmed = dliveMappingConfirmed.events[key];
  if(confirmed){
    const m = myMatches.find(mm => String(mm.id) === confirmed.target);
    if(m) return { match: m, score: 1, source: 'admin' };
  }
  // Filtre catégorie : uniquement football (si le champ existe) — sinon on
  // se rabat sur le parsing d'équipes qui filtrera naturellement le bruit
  // (ex: "Big Brother 27 Live Cam" ne matchera aucune équipe).
  const cat = (dliveEvent.category || dliveEvent.sport || '').toLowerCase();
  if(cat && !cat.includes('foot') && !cat.includes('soccer')) return null;

  const teams = parseDliveEventTeams(title);
  if(!teams) return null;

  let best = null;
  const eventTime = dliveEvent.start_time ? new Date(dliveEvent.start_time).getTime() : null;
  myMatches.forEach(m => {
    const hn = m.homeTeam?.name||'', an = m.awayTeam?.name||'';
    // Meilleur appariement dans les deux sens (a↔home,b↔away OU a↔away,b↔home)
    const s1 = (similarity(teams.a,hn) + similarity(teams.b,an)) / 2;
    const s2 = (similarity(teams.a,an) + similarity(teams.b,hn)) / 2;
    const teamScore = Math.max(s1,s2);
    let dateScore = 0.5; // neutre si pas d'horaire exploitable
    if(eventTime && m.utcDate){
      const diffH = Math.abs(new Date(m.utcDate).getTime() - eventTime) / 3600000;
      dateScore = diffH <= 3 ? 1 : Math.max(0, 1 - (diffH-3)/12);
    }
    const bonus = (teamScore > 0.9 && dateScore === 1) ? 0.1 : 0;
    const score = teamScore*0.7 + dateScore*0.2 + bonus;
    if(!best || score > best.score) best = { match: m, score, source: 'fuzzy' };
  });
  if(best && best.score >= 0.7) return best;
  return null;
}
function topEventCandidates(dliveEvent, myMatches, n=3){
  const title = dliveEvent.event_name || dliveEvent.name || dliveEvent.title || '';
  const teams = parseDliveEventTeams(title);
  if(!teams) return [];
  return myMatches.map(m => {
    const hn = m.homeTeam?.name||'', an = m.awayTeam?.name||'';
    const s1 = (similarity(teams.a,hn) + similarity(teams.b,an)) / 2;
    const s2 = (similarity(teams.a,an) + similarity(teams.b,hn)) / 2;
    return { target: String(m.id), label: hn+' - '+an, score: Math.max(s1,s2) };
  }).sort((a,b)=>b.score-a.score).slice(0,n);
}

// ─── Sync complète : récupère dlive, applique ce qui est fiable, empile le reste en attente ───
async function syncDlive(){
  await loadDliveMappings();
  const [chRes, schRes] = await Promise.all([
    fetch('/api/dlive/channels').then(r=>r.json()).catch(()=>({channels:[]})),
    fetch('/api/dlive/schedule').then(r=>r.json()).catch(()=>({schedule:[]})),
  ]);
  const channels = chRes.channels||[];
  const schedule = schRes.schedule||[];

  const myChannels = TV_CHANNELS.map(c=>({id:c.id,name:c.name}));
  const myMatches = Object.values(data.byDate||{}).flat();

  dlivePendingChannels = [];
  dlivePendingEvents = [];
  let channelsMatched = 0, eventsMatched = 0;
  const resolvedChannels = []; // {myChannelId, url, label, score}
  const resolvedEvents = [];   // {matchId, url, label, score}

  channels.forEach(ch => {
    const name = ch.channel_name || ch.name;
    const id = ch.channel_id || ch.id;
    if(!name || !id) return;
    const key = normKey(name);
    if(dliveMappingIgnored['ch_'+key]) return;
    const result = matchChannel(name, myChannels);
    if(result){
      const target = myChannels.find(c=>c.name===result.target);
      if(target){
        // Une même chaîne (ex. DAZN France) existe en plusieurs entrées chez
        // dlive : on les garde TOUTES comme sources alternatives au lieu de
        // n'en retenir qu'une. Plus de flux = plus de secours si l'un tombe.
        resolvedChannels.push({ myChannelId: target.id, url: dliveUrl(id,'channel'), label: 'dlive · '+name, score: result.score });
        channelsMatched++;
        return;
      }
    }
    // Pas de match fiable → proposé à la validation admin
    dlivePendingChannels.push({ key:'ch_'+key, dliveName:name, dliveId:id, candidates: topChannelCandidates(name, myChannels) });
  });

  schedule.forEach(ev => {
    const title = ev.event_name || ev.name || ev.title || '';
    const id = ev.event_id || ev.id || ev.channel_id;
    if(!title || !id) return;
    const key = normKey(title);
    if(dliveMappingIgnored['ev_'+key]) return;
    const result = matchEvent(ev, myMatches);
    if(result){
      resolvedEvents.push({ matchId: String(result.match.id), url: dliveUrl(id,'event'), label: 'dlive · '+title, score: result.score });
      eventsMatched++;
      return;
    }
    const cat=(ev.category||ev.sport||'').toLowerCase();
    if(cat && !cat.includes('foot') && !cat.includes('soccer')) return; // bruit non-foot, on n'encombre pas la validation admin
    dlivePendingEvents.push({ key:'ev_'+key, dliveName:title, dliveId:id, candidates: topEventCandidates(ev, myMatches) });
  });

  applyDliveMatches(resolvedChannels, resolvedEvents);

  dliveSyncMeta = {
    lastSync: Date.now(),
    channelsMatched, eventsMatched,
    channelsPending: dlivePendingChannels.length,
    eventsPending: dlivePendingEvents.length,
  };
  try{ localStorage.setItem('okin_dlive_sync_meta', JSON.stringify(dliveSyncMeta)); }catch(e){}
}

// ─── Ajoute les sources résolues sans jamais écraser l'existant ───
const DLIVE_MAX_PER_TARGET = 6; // au-delà, le sélecteur devient illisible

function applyDliveMatches(resolvedChannels, resolvedEvents){
  // Regroupe par chaîne cible : dlive expose souvent la même chaîne (DAZN
  // France, beIN…) en une dizaine d'entrées. On les garde toutes comme
  // alternatives, numérotées et triées par score, plafonnées pour rester
  // lisibles dans le sélecteur du lecteur.
  const byChannel = new Map();
  resolvedChannels.forEach(r => {
    if(!byChannel.has(r.myChannelId)) byChannel.set(r.myChannelId, []);
    byChannel.get(r.myChannelId).push(r);
  });

  byChannel.forEach((list, myChannelId) => {
    list.sort((a,b) => (b.score||0)-(a.score||0));
    const keep = list.slice(0, DLIVE_MAX_PER_TARGET);
    if(!tvStreams[myChannelId]) tvStreams[myChannelId] = { sources: [] };
    if(!tvStreams[myChannelId].sources) tvStreams[myChannelId].sources = tvStreams[myChannelId].url ? [{url:tvStreams[myChannelId].url,label:tvStreams[myChannelId].label||'Source 1'}] : [];
    keep.forEach((r, n) => {
      const already = tvStreams[myChannelId].sources.find(s=>s.url===r.url);
      if(already) return;
      // Numérotation quand il y a plusieurs flux pour la même chaîne
      const lbl = keep.length > 1 ? ('dlive #'+(n+1)) : r.label;
      tvStreams[myChannelId].sources.push({ url: r.url, label: lbl, confidence: r.score, dlive:true });
    });
    tvStreams[myChannelId].updatedAt = Date.now();
  });
  resolvedEvents.forEach(({matchId,url,label,score}) => {
    if(!streams[matchId]) streams[matchId] = { sources: [] };
    if(!streams[matchId].sources) streams[matchId].sources = streams[matchId].url ? [{url:streams[matchId].url,label:streams[matchId].label||'Source 1'}] : [];
    const already = streams[matchId].sources.find(s=>s.url===url);
    if(!already) streams[matchId].sources.push({ url, label, confidence: score, dlive:true });
    streams[matchId].updatedAt = Date.now();
  });
  try{
    localStorage.setItem('okin_tv_streams', JSON.stringify(tvStreams));
    localStorage.setItem('okin_streams', JSON.stringify(streams));
  }catch(e){}
  if(db){
    resolvedChannels.forEach(({myChannelId}) => db.ref('tv_streams/'+myChannelId).set(tvStreams[myChannelId]).catch(()=>{}));
    resolvedEvents.forEach(({matchId}) => db.ref('streams/'+matchId).set(streams[matchId]).catch(()=>{}));
  }
  applyStreams(); renderContent();
}

// ─── Validation admin : confirme un mapping (sauvegardé pour toujours) ───
function confirmDliveMapping(kind, key, dliveName, dliveId, target){
  const path = 'dlive_mapping/'+(kind==='channel'?'channels':'events')+'/'+key;
  const data = { target, confirmedBy: currentUser?.uid||'admin', ts: Date.now() };
  if(db) db.ref(path).set(data).catch(()=>{});
  if(kind==='channel') dliveMappingConfirmed.channels[key]=data; else dliveMappingConfirmed.events[key]=data;
  const url = dliveUrl(dliveId, kind);
  if(kind==='channel'){
    if(!tvStreams[target]) tvStreams[target]={sources:[]};
    if(!tvStreams[target].sources) tvStreams[target].sources=[];
    tvStreams[target].sources.push({url,label:'dlive · '+dliveName,confidence:1,dlive:true});
    tvStreams[target].updatedAt=Date.now();
    try{localStorage.setItem('okin_tv_streams',JSON.stringify(tvStreams));}catch(e){}
    if(db) db.ref('tv_streams/'+target).set(tvStreams[target]).catch(()=>{});
  } else {
    if(!streams[target]) streams[target]={sources:[]};
    if(!streams[target].sources) streams[target].sources=[];
    streams[target].sources.push({url,label:'dlive · '+dliveName,confidence:1,dlive:true});
    streams[target].updatedAt=Date.now();
    try{localStorage.setItem('okin_streams',JSON.stringify(streams));}catch(e){}
    if(db) db.ref('streams/'+target).set(streams[target]).catch(()=>{});
  }
  dlivePendingChannels = dlivePendingChannels.filter(p=>p.key!==key);
  dlivePendingEvents = dlivePendingEvents.filter(p=>p.key!==key);
  applyStreams(); renderContent();
  toast('✅ Mapping confirmé');
  if(adminOpen) renderAdminPanel();
}
function ignoreDliveMapping(key){
  if(db) db.ref('dlive_mapping/ignored/'+key).set({ts:Date.now(),by:currentUser?.uid||'admin'}).catch(()=>{});
  dliveMappingIgnored[key]={ts:Date.now()};
  dlivePendingChannels = dlivePendingChannels.filter(p=>p.key!==key);
  dlivePendingEvents = dlivePendingEvents.filter(p=>p.key!==key);
  toast('🚫 Ignoré');
  if(adminOpen) renderAdminPanel();
}
// ═══════════════════════════════════════════════════════════════
// ── FLS — FOOTBALL LIVE STREAM API : assignation intelligente ───
//
//  Même philosophie que dlive : l'API ne sert QUE de source de flux, jamais
//  de source de données (scores/compos restent football-data + FlashScore).
//  On devine automatiquement à quel match de NOTRE grille correspond chaque
//  match FLS, et les cas douteux partent en validation admin.
//
//  ⚠️  QUOTA : ~50 appels/jour côté RapidAPI. D'où la règle d'or de ce
//  module : **assigner une source ne coûte RIEN**. L'URL posée sur le match
//  est `/api/fls/play/<id>.m3u8`, une route de NOTRE serveur. L'appel payant
//  /link/{id} n'a lieu que si quelqu'un lance vraiment la lecture, et son
//  résultat est mis en cache serveur puis partagé par tous les spectateurs.
//  Conséquence : 200 matchs assignés = 0 appel ; 3 matchs regardés = 3 appels.
//
//  Rien n'écrase jamais une source posée à la main : FLS s'ajoute toujours
//  en alternative dans le sélecteur de sources.
// ═══════════════════════════════════════════════════════════════

const FLS_AUTO_THRESHOLD    = 0.80; // au-dessus : assignation automatique
const FLS_PENDING_THRESHOLD = 0.50; // entre les deux : validation admin
const FLS_TEAM_FLOOR        = 0.58; // en dessous : ce n'est pas le même match, point
const FLS_SYNC_INTERVAL     = 10 * 60 * 1000; // le serveur sert du cache : gratuit

let flsMatches = [];   // liste brute renvoyée par /api/fls/matches
let flsQuota   = null; // {limit, used, left, linkLeft, resetAt, enabled, mode}
let flsSyncMeta = { lastSync: 0, serverSync: 0, matched: 0, pending: 0, total: 0, error: null };
let flsPending = [];   // [{key, flsId, title, league, kickoff, candidates:[...]}]
let flsMappingConfirmed = {}; // depuis Firebase /fls_mapping/events
let flsMappingIgnored   = {};
const _flsResolved = {}; // flsId -> résultat du préflight, évite de retaper le serveur

// ─── URL de lecture : route locale, résolue paresseusement côté serveur ───
// L'extension .m3u8 est indispensable : isEmbedUrl() s'en sert pour choisir
// le lecteur natif plutôt qu'une iframe.
function flsPlayUrl(id){ return '/api/fls/play/' + encodeURIComponent(id) + '.m3u8'; }

async function loadFlsMappings(){
  if(!db) return;
  try{
    const [evSnap, ignSnap] = await Promise.all([
      db.ref('fls_mapping/events').once('value'),
      db.ref('fls_mapping/ignored').once('value'),
    ]);
    flsMappingConfirmed = evSnap.val() || {};
    flsMappingIgnored   = ignSnap.val() || {};
  }catch(e){ console.error('[fls] chargement mappings échoué', e.message); }
}

// ─── Similarité pour UNE équipe ───
// On compare le nom FLS au nom long ET au nom court, et on garde le meilleur :
// « Marseille » colle à shortName, « Paris Saint Germain » colle au nom long,
// et une moyenne bête sur un seul des deux ratait un match sur deux.
// La distance d'édition seule ne voit pas non plus l'inclusion : « Marseille »
// dans « Olympique de Marseille », c'est pourtant la même équipe.
function flsTeamSim(name, m, side){
  const full  = (side === 'home' ? m.homeTeam?.name : m.awayTeam?.name) || '';
  const short = (side === 'home' ? m.homeTeam?.shortName : m.awayTeam?.shortName) || full;
  const na = normKey(name);
  let best = 0;
  [full, short].forEach(cand => {
    if(!cand) return;
    let s = similarity(name, cand);
    const nc = normKey(cand);
    if(na && nc && (na.includes(nc) || nc.includes(na))){
      const ratio = Math.min(na.length, nc.length) / Math.max(na.length, nc.length);
      s = Math.max(s, 0.80 + 0.20 * ratio);
    }
    if(s > best) best = s;
  });
  return best;
}

// ─── Score d'appariement entre un match FLS et un de nos matchs ───
// teamScore domine : deux matchs à la même heure dans la même compétition
// restent deux matchs différents si les équipes ne collent pas.
function flsPairScore(f, m){
  // Garde-fou horaire AVANT tout : « Liverpool - Arsenal » existe aussi le
  // mois prochain. Sans ce filtre, un flux d'un autre jour se collait sur le
  // match d'aujourd'hui avec un score parfait côté équipes.
  let dateScore = 0.5; // neutre si l'API ne donne pas d'horaire exploitable
  const t = f.kickoff ? new Date(f.kickoff).getTime() : NaN;
  if(!isNaN(t) && m.utcDate){
    const diffH = Math.abs(new Date(m.utcDate).getTime() - t) / 3600000;
    if(diffH > 6) return { teamScore: 0, score: 0 };
    dateScore = diffH <= 2 ? 1 : Math.max(0, 1 - (diffH - 2) / 4);
  }

  const direct  = (flsTeamSim(f.home, m, 'home') + flsTeamSim(f.away, m, 'away')) / 2;
  // Certains fournisseurs inversent domicile/extérieur : on l'accepte, mais
  // légèrement pénalisé pour que la bonne orientation gagne à égalité.
  const swapped = (flsTeamSim(f.home, m, 'away') + flsTeamSim(f.away, m, 'home')) / 2 * 0.98;
  const teamScore = Math.max(direct, swapped);

  const leagueBonus = (f.league && m._cname && similarity(f.league, m._cname) > 0.6) ? 0.05 : 0;
  return { teamScore, score: Math.min(1, teamScore * 0.75 + dateScore * 0.25 + leagueBonus) };
}

// Périmètre de comparaison : uniquement les matchs proches dans le temps.
// Inutile (et coûteux en Levenshtein) de comparer un flux du soir à un match
// de la semaine prochaine.
function flsCandidateMatches(){
  const now = Date.now();
  return Object.values(data.byDate || {}).flat().filter(m => {
    if(!m.utcDate) return true;
    const d = new Date(m.utcDate).getTime();
    return d > now - 6 * 3600000 && d < now + 36 * 3600000;
  });
}

function flsKey(f){ return normKey(f.home + '_' + f.away) + '_' + (f.id || ''); }

function flsMatchOne(f, myMatches){
  const key = flsKey(f);
  const confirmed = flsMappingConfirmed[key];
  if(confirmed){
    const m = myMatches.find(mm => String(mm.id) === String(confirmed.target));
    if(m) return { match: m, score: 1, source: 'admin' };
  }
  let best = null;
  myMatches.forEach(m => {
    const r = flsPairScore(f, m);
    if(r.teamScore < FLS_TEAM_FLOOR) return;
    if(!best || r.score > best.score) best = { match: m, score: r.score, source: 'auto' };
  });
  return best;
}

function flsTopCandidates(f, myMatches, n = 3){
  return myMatches
    .map(m => {
      const r = flsPairScore(f, m);
      return { target: String(m.id), label: (m.homeTeam?.shortName||m.homeTeam?.name||'?') + ' - ' + (m.awayTeam?.shortName||m.awayTeam?.name||'?'), score: r.score };
    })
    // Un candidat à 0 a été rejeté par le garde-fou horaire : le proposer à
    // l'admin ne ferait que l'inciter à valider une erreur.
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ─── Sync : lit le cache serveur (gratuit) et réassigne les sources ───
async function syncFls(){
  await loadFlsMappings();
  let payload;
  try{
    payload = await fetch('/api/fls/matches').then(r => r.json());
  }catch(e){
    flsSyncMeta.error = 'network';
    return flsSyncMeta;
  }
  flsMatches = payload.matches || [];
  flsQuota   = payload.quota || null;
  flsSyncMeta.serverSync = payload.lastSync || 0;
  flsSyncMeta.error = payload.error || null;

  const myMatches = flsCandidateMatches();
  const resolved = [];
  flsPending = [];

  flsMatches.forEach(f => {
    if(!f || !f.id) return;
    const key = flsKey(f);
    if(flsMappingIgnored[key]) return;
    const r = flsMatchOne(f, myMatches);
    if(r && r.score >= FLS_AUTO_THRESHOLD){
      resolved.push({ matchId: String(r.match.id), flsId: f.id, score: r.score, title: f.home + ' - ' + f.away });
      return;
    }
    if(r && r.score >= FLS_PENDING_THRESHOLD){
      flsPending.push({
        key, flsId: f.id,
        title: f.home + ' - ' + f.away,
        league: f.league || '',
        kickoff: f.kickoff || null,
        candidates: flsTopCandidates(f, myMatches),
      });
    }
    // En dessous du seuil « douteux » : ce match FLS ne concerne aucun match
    // de notre grille (autre championnat, autre jour) — on l'ignore en
    // silence plutôt que de noyer l'admin sous du bruit.
  });

  applyFlsMatches(resolved);

  flsSyncMeta = Object.assign(flsSyncMeta, {
    lastSync: Date.now(),
    matched: resolved.length,
    pending: flsPending.length,
    total: flsMatches.length,
  });
  try{ localStorage.setItem('okin_fls_sync_meta', JSON.stringify(flsSyncMeta)); }catch(e){}
  return flsSyncMeta;
}

// ─── Pose les sources résolues, sans jamais écraser l'existant ───
function applyFlsMatches(resolved){
  let changed = false;
  const touched = [];
  resolved.forEach(({ matchId, flsId, score, title }) => {
    const url = flsPlayUrl(flsId);
    if(!streams[matchId]) streams[matchId] = { sources: [] };
    const s = streams[matchId];
    // Migration douce de l'ancien format {url,label} vers {sources:[...]}
    if(!s.sources) s.sources = s.url ? [{ url: s.url, label: s.label || 'Source 1' }] : [];
    if(s.sources.some(x => x.url === url)) return;
    s.sources.push({ url, label: 'FLS · HD', confidence: score, fls: true, flsId, flsTitle: title });
    s.updatedAt = Date.now();
    changed = true;
    touched.push(matchId);
  });
  if(!changed) return;
  try{ localStorage.setItem('okin_streams', JSON.stringify(streams)); }catch(e){}
  // Écriture Firebase réservée aux admins : sinon chaque visiteur réécrirait
  // les mêmes noeuds toutes les 10 minutes pour rien. Les autres profitent
  // quand même des sources en local (l'assignation est déterministe).
  if(db && isAdmin()) touched.forEach(id => db.ref('streams/' + id).set(streams[id]).catch(() => {}));
  applyStreams();
  renderContent();
}

// ─── Validation admin ───
function confirmFlsMapping(key, flsId, matchId, title){
  const rec = { target: String(matchId), flsId, confirmedBy: currentUser?.uid || 'admin', ts: Date.now() };
  if(db) db.ref('fls_mapping/events/' + key).set(rec).catch(() => {});
  flsMappingConfirmed[key] = rec;
  applyFlsMatches([{ matchId: String(matchId), flsId, score: 1, title: title || '' }]);
  flsPending = flsPending.filter(p => p.key !== key);
  toast('✅ Source FLS assignée');
  if(adminOpen) renderAdminPanel();
}
function ignoreFlsMapping(key){
  if(db) db.ref('fls_mapping/ignored/' + key).set({ ts: Date.now(), by: currentUser?.uid || 'admin' }).catch(() => {});
  flsMappingIgnored[key] = { ts: Date.now() };
  flsPending = flsPending.filter(p => p.key !== key);
  toast('🚫 Ignoré');
  if(adminOpen) renderAdminPanel();
}

// ─── Préflight avant lecture ───
// C'est ici — et NULLE PART ailleurs — qu'un appel payant peut partir.
// On le fait avant de lancer le lecteur pour pouvoir afficher un vrai message
// ("quota épuisé", "flux introuvable") au lieu d'un écran noir muet.
async function flsPreflight(src){
  if(!src || !src.fls || !src.flsId) return true;
  const cached = _flsResolved[src.flsId];
  if(cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.ok;
  let r;
  try{
    r = await fetch('/api/fls/link?id=' + encodeURIComponent(src.flsId)).then(res => res.json());
  }catch(e){
    toast('❌ Source indisponible');
    return false;
  }
  if(r && r.quota) flsQuota = r.quota;
  _flsResolved[src.flsId] = { ok: !!r.ok, ts: Date.now() };
  if(r.ok) return true;
  if(r.error === 'quota_exhausted'){
    const reset = r.quota?.resetAt ? new Date(r.quota.resetAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    toast('⏳ Quota de flux atteint' + (reset ? ' — retour à ' + reset : '') + ', essaie une autre source');
  } else if(r.error === 'provider_blocked'){
    toast('⛔ Fournisseur momentanément bloqué' + (r.quota?.blockedReason ? ' (' + r.quota.blockedReason + ')' : ''));
  } else if(r.error === 'not_found'){
    toast('❌ Ce flux n\'existe plus côté fournisseur');
  } else if(r.error === 'no_key'){
    toast('⚙️ Source non configurée');
  } else {
    toast('❌ Source indisponible');
  }
  return false;
}

// Sync périodique : gratuite (cache serveur), donc on peut être généreux.
// Le serveur décide seul quand dépenser réellement un appel RapidAPI.
function startFlsAutoSync(){
  setTimeout(() => { syncFls().catch(() => {}); }, 4000);
  setInterval(() => { if(pageVisible()) syncFls().catch(() => {}); }, FLS_SYNC_INTERVAL);
}

async function loadLiveData(){
  const res=await afFetch('/fixtures?live=all');if(!res?.response)return;
  for(const f of res.response){const m=data.live.find(m=>teamsFuzzyMatch(m,f));if(!m)continue;m._status=f.fixture?.status??null;if(f.fixture?.id)m._afFixtureId=f.fixture.id;if(f.goals?.home!=null)m.goals={home:f.goals.home,away:f.goals.away};noteMatchMinute(m);}
  renderTicker();renderContent();
  if(multiOpen)renderGrid();
  // Rafraîchit la vue Détails du match actuellement ouvert, s'il est en direct
  if(pl.match&&isLive(pl.match)&&streamTab){
    loadDetails(pl.match,true);
    if(detTab==='stats')loadMatchStats(pl.match,true);
    if(detTab==='players')loadPlayersStats(pl.match,true);
  }
}

// ═══════════════════════════════════════════════════
// ── DÉTAILS — compos, terrain 2D, blessures, changements ──
// Source PRINCIPALE : FlashScore (scraper via /api/fs, côté serveur).
// Source BACKUP : api-sports.io (déjà en place, via /api/af).
// Tant que /api/fs n'est pas configuré (FS_BASE vide côté serveur), il
// répond 503 et on bascule automatiquement + silencieusement sur l'API backup.
// ═══════════════════════════════════════════════════
let streamTab='details';
function switchStreamTab(tab){
  streamTab=tab;
  const bd=$('tab-btn-details'),bc=$('tab-btn-chat');
  if(bd)bd.classList.toggle('on',tab==='details');
  if(bc)bc.classList.toggle('on',tab==='chat');
  const ds=$('details-section');if(ds)ds.style.display=tab==='details'?'':'none';
  const cs=$('chat-section');if(cs)cs.style.display=tab==='chat'?'':'none';
}

const FS_PROJECT_ID_CLIENT='16'; // FlashScore France — confirmé par capture HAR réelle

async function fsFetch(ep){
  try{
    const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),12000);
    const res=await fetch('/api/fs'+ep,{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok)return null; // 503 = scraper pas encore configuré → fallback silencieux
    return await res.text();
  }catch(e){return null;}
}
async function fsFeedFetch(ep){
  try{
    const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),12000);
    const res=await fetch('/api/fsfeed'+ep,{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok)return null;
    return await res.text();
  }catch(e){return null;}
}
function parseFsFeed(raw){
  if(!raw)return null;
  try{return JSON.parse(raw);}catch(e){}
  try{
    return raw.split('¬').map(seg=>{const i=seg.indexOf('÷');return i<0?null:{key:seg.slice(0,i),value:seg.slice(i+1)};}).filter(Boolean);
  }catch(e){return null;}
}
// Format confirmé par capture HAR le 11/09/2026 sur global.flashscore.ninja
// (/16/x/feed/f_1_0_2_fr_1) : texte délimité par blocs. Chaque bloc commence
// juste après un '~' et démarre soit par "ZA÷" (en-tête de compétition, à
// ignorer ici), soit par "AA÷" (un match). Dans un bloc match, les champs
// utiles repérés : AA=eventId, AD=timestamp de coup d'envoi (secondes),
// AE=nom équipe domicile, AF=nom équipe extérieur.
function parseFsMatchList(raw){
  if(!raw)return[];
  const blocks=raw.split('~');
  const matches=[];
  for(const block of blocks){
    if(!block.startsWith('AA÷'))continue;
    const fields={};
    block.split('¬').forEach(seg=>{
      const i=seg.indexOf('÷');if(i<0)return;
      const k=seg.slice(0,i);if(!(k in fields))fields[k]=seg.slice(i+1);
    });
    if(fields.AA)matches.push({
      id:fields.AA,
      kickoff:fields.AD?parseInt(fields.AD,10)*1000:null,
      homeName:fields.AE||'',
      awayName:fields.AF||'',
    });
  }
  return matches;
}
// Cache des flux FlashScore par décalage de jour — le même flux servait à
// résoudre chaque match, il était donc retéléchargé en boucle.
const _fsFeedCache = new Map(); // dayOffset -> {list, ts}
const FS_FEED_TTL = 3 * 60 * 1000; // 3 min : assez frais pour du live, assez long pour éviter le spam

async function fsMatchListForOffset(offset){
  const cached = _fsFeedCache.get(offset);
  if(cached && Date.now() - cached.ts < FS_FEED_TTL) return cached.list;
  // Dans f_1_{offset}_2_fr_1, le 2e segment est le décalage en jours par
  // rapport à aujourd'hui (0 = aujourd'hui, -1 = hier, 1 = demain).
  const raw = await fsFeedFetch(`/16/x/feed/f_1_${offset}_2_fr_1`);
  const list = parseFsMatchList(raw);
  _fsFeedCache.set(offset, {list, ts: Date.now()});
  return list;
}

// Décalage en jours entre la date du match et aujourd'hui (fuseau local)
function fsDayOffsetFor(m){
  if(!m.utcDate) return 0;
  const d = new Date(m.utcDate); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

async function resolveFsMatchId(m){
  if(m._fsMatchId) return m._fsMatchId;
  if(m._fsMatchIdMiss) return null; // déjà cherché sans succès : on ne retente pas à chaque refresh

  // BUG corrigé : on n'interrogeait QUE le flux du jour (offset 0), donc tout
  // match d'hier/demain (ou d'un autre jour affiché) ne matchait jamais — d'où
  // "ça marche sur certains matchs et pas sur d'autres".
  const base = fsDayOffsetFor(m);
  // On tente le jour du match, puis les jours adjacents : un match tard le soir
  // peut être rangé côté FlashScore sur le jour suivant selon le fuseau.
  const offsets = [base, base - 1, base + 1];

  const kickoff = m.utcDate ? new Date(m.utcDate).getTime() : null;

  for(const off of offsets){
    if(off < -7 || off > 7) continue; // au-delà, FlashScore ne sert plus rien d'utile
    let list = [];
    try{ list = await fsMatchListForOffset(off); }catch(e){ continue; }
    if(!list.length) continue;

    // 1) Correspondance sur les deux équipes (cas normal)
    let match = list.find(f => teamsFuzzyMatch(m, {teams:{home:{name:f.homeName}, away:{name:f.awayName}}}));

    // 2) Repêchage : une seule équipe reconnue MAIS coup d'envoi à moins de
    //    30 min d'écart. Rattrape les graphies trop différentes d'un côté
    //    (ex. "Inter" vs "Internazionale") sans ouvrir la porte aux faux
    //    positifs, puisque l'horaire doit coller.
    if(!match && kickoff){
      const nMh = normTeamName(m.homeTeam?.name||''), nMa = normTeamName(m.awayTeam?.name||'');
      match = list.find(f => {
        if(!f.kickoff || Math.abs(f.kickoff - kickoff) > 30*60*1000) return false;
        const nFh = normTeamName(f.homeName), nFa = normTeamName(f.awayName);
        const homeOk = nFh && nMh && (nFh.includes(nMh) || nMh.includes(nFh));
        const awayOk = nFa && nMa && (nFa.includes(nMa) || nMa.includes(nFa));
        return homeOk || awayOk;
      });
    }

    if(match){ m._fsMatchId = match.id; return match.id; }
  }

  m._fsMatchIdMiss = true;
  return null;
}
async function resolveAfFixtureId(m){
  if(m._afFixtureId)return m._afFixtureId;
  const d=(m.utcDate||'').split('T')[0];if(!d)return null;
  const res=await afFetch('/fixtures?date='+d);if(!res?.response)return null;
  const f=res.response.find(f=>teamsFuzzyMatch(m,f));
  if(f?.fixture?.id){m._afFixtureId=f.fixture.id;return f.fixture.id;}
  return null;
}

// ─── Normalisation vers un schéma commun, quelle que soit la source ───
// team: {name, formation, starting:[player], substitutes:[player]}
// player: {id,name,number,position,grid,photo,age,nationality,height,foot}
// Les deux passent par /api/img côté serveur — FlashScore bloque le
// hotlinking direct (image cassée) sans le bon header Referer, d'où le
// bug "aucune photo ne s'affiche" repéré sur le match Union Berlin.
function luPlayerPhotoAF(playerId){return playerId?`/api/img?u=${encodeURIComponent(`https://media.api-sports.io/football/players/${playerId}.png`)}`:null;}
// FlashScore fournit plusieurs variantes par joueur (variantType 81 à 86 vus
// en capture). Pas de doc officielle sur laquelle est la plus grande — 86
// (la dernière observée) est utilisée en priorité ; si absente on retombe
// sur la première disponible. À ajuster si ça se révèle être l'inverse.
function fsPlayerImagePath(images){
  if(!images?.length)return null;
  const preferred=images.find(im=>im.variantType===86)||images.find(im=>im.variantType===85)||images[images.length-1];
  return preferred?.path||null;
}
function fsImg(path){return path?`/api/img?u=${encodeURIComponent(`https://static.flashscore.com/res/image/data/${path}`)}`:null;}

// Mapping confirmé par capture HAR réelle du 10/09/2026 (endpoint _hash=dplie
// pour les compos, _hash=dmpe2 pour les blessés/absents). Format GraphQL JSON
// propre — pas le format délimité qu'on redoutait.
async function fetchFromFlashScore(m){
  const fsId=await resolveFsMatchId(m);
  if(!fsId)throw new Error('fs_no_match_id');
  const[luRaw,injRaw]=await Promise.all([
    // dlie2 confirmé par capture HAR le 11/09/2026 : compos CONFIRMÉES (pas
    // juste "probables"), avec groupes STARTERS/SUBSTITUTES explicites, une
    // note par joueur (rating) et un champ incidents (cartons/changements —
    // structure exacte pas encore vue en vrai sur un match avec cartons,
    // parsing défensif ci-dessous à ajuster si besoin).
    fsFetch(`/pq_graphql?_hash=dlie2&eventId=${fsId}&projectId=${FS_PROJECT_ID_CLIENT}`),
    fsFetch(`/pq_graphql?_hash=dmpe2&eventId=${fsId}&projectId=${FS_PROJECT_ID_CLIENT}`),
  ]);
  const luData=parseFsFeed(luRaw)?.data?.findEventById;
  if(!luData)throw new Error('fs_no_lineups');

  const allEvents=[];
  const mapTeam=(part,side)=>{
    const L=part?.lineup||part?.predictedLineup; // lineup = confirmée, predictedLineup = avant match
    if(!L)return null;
    const rows=L.formation?.lines?.[0]?.rows||[];
    const gridByPlayer={};
    rows.forEach((row,ri)=>row.playerIds.forEach((pid,ci)=>{gridByPlayer[pid]=`${ri+1}:${ci+1}`;}));
    const starterGroup=(L.groups||[]).find(g=>/STARTER/i.test(g.groupType||''));
    const subGroup=(L.groups||[]).find(g=>/SUB/i.test(g.groupType||''));
    const starterIds=new Set(starterGroup?.playerIds||rows.flatMap(r=>r.playerIds));
    const allPlayers=(L.players||[]).map(p=>{
      // Structure confirmée par capture HAR le 11/09/2026 (exemple réel : un
      // but + une passe décisive) : chaque incident est enveloppé dans un
      // objet {__typename, incident:{id, playerId, minute, reasons, isHidden}}.
      // __typename vu en vrai : "EventIncidentGoal", "EventIncidentAssistance".
      // Cartons/changements pas encore observés en vrai — détection par
      // correspondance sur __typename/reasons, à confirmer dès qu'un exemple
      // réel apparaît dans une capture.
      (p.incidents||[]).forEach(inc=>{
        const typ=(inc.__typename||'').toLowerCase();
        const reasons=(inc.incident?.reasons||[]).join(' ').toLowerCase();
        const minute=parseInt(inc.incident?.minute)||null; // ex: "11'" → 11
        let type=null;
        if(typ.includes('card')||reasons.includes('card')){
          type=(typ.includes('red')||reasons.includes('red'))?'red':'yellow';
        }else if(typ.includes('sub')){
          type='sub';
        }
        // Les buts (EventIncidentGoal/Assistance) ne créent pas de badge ici :
        // déjà affichés via modal-evs (buts) plus haut dans la modale.
        if(type)allEvents.push({
          minute,type,team:side,
          playerOutId:p.id,playerOutName:p.listName||p.fieldName,
          playerInName:null,
        });
      });
      return{
        id:p.id,name:p.listName||p.fieldName,number:p.number,
        position:p.playerRoles?.[0]?.title||null,
        grid:gridByPlayer[p.id]||null,
        photo:fsImg(fsPlayerImagePath(p.images)),
        age:p.age,height:p.height?p.height+' cm':null,
        nationality:null,foot:null,
        marketValue:p.marketValue,rating:p.rating??p.averageRating,
        bioUrl:p.participant?.url||null,
      };
    });
    return{
      name:part.name,
      formation:L.formation?.name||null,
      starting:allPlayers.filter(p=>starterIds.has(p.id)),
      substitutes:allPlayers.filter(p=>!starterIds.has(p.id)),
    };
  };
  const homePart=luData.eventParticipants?.find(p=>p.type?.side==='HOME');
  const awayPart=luData.eventParticipants?.find(p=>p.type?.side==='AWAY');
  const home=mapTeam(homePart,'home'),away=mapTeam(awayPart,'away');
  if(!home?.starting?.length&&!away?.starting?.length)throw new Error('fs_empty_lineups');

  const injData=parseFsFeed(injRaw)?.data?.findEventById;
  const injuries=[];
  (injData?.eventParticipants||[]).forEach(part=>{
    (part.lineup?.missingPlayers||[]).forEach(mp=>{
      injuries.push({name:mp.player?.listName||mp.player?.name,team:mp.player?.teamName,reason:mp.reason});
    });
  });

  return{home,away,events:allEvents,injuries,source:'fs'};
}

async function fetchFromBackupApi(m){
  const fixtureId=await resolveAfFixtureId(m);
  if(!fixtureId)throw new Error('af_no_fixture_id');
  const[luRes,evRes]=await Promise.all([
    afFetch('/fixtures/lineups?fixture='+fixtureId),
    afFetch('/fixtures/events?fixture='+fixtureId),
  ]);
  const lineups=luRes?.response||[];
  if(!lineups.length)throw new Error('af_empty_lineups');
  const home=lineups.find(l=>teamsFuzzyMatch(m,{teams:{home:l.team,away:{name:''}}}))||lineups[0];
  const away=lineups.find(l=>l!==home)||lineups[1];
  const mapTeam=(l)=>l&&({
    name:l.team?.name||'',formation:l.formation||null,
    starting:(l.startXI||[]).map(({player})=>({id:player.id,name:player.name,number:player.number,position:player.pos,grid:player.grid,photo:luPlayerPhotoAF(player.id)})),
    substitutes:(l.substitutes||[]).map(({player})=>({id:player.id,name:player.name,number:player.number,position:player.pos,photo:luPlayerPhotoAF(player.id)})),
  });
  const events=(evRes?.response||[]).filter(e=>e.type==='Card'||e.type==='subst').map(e=>({
    minute:e.time?.elapsed,
    type:e.type==='Card'?(/red/i.test(e.detail||'')?'red':'yellow'):'sub',
    team:teamsFuzzyMatch(m,{teams:{home:e.team,away:{name:''}}})?'home':'away',
    playerOutId:e.type==='subst'?e.assist?.id:e.player?.id,
    playerOutName:e.type==='subst'?(e.assist?.name||'?'):(e.player?.name||'?'),
    playerInName:e.type==='subst'?(e.player?.name||'?'):null,
  }));
  return{home:mapTeam(home),away:mapTeam(away),events,injuries:[],source:'af'};
}

async function loadDetails(m,silentRefresh){
  const sec=$('details-section'),loading=$('lu-loading'),pitch=$('lu-pitch'),evWrap=$('lu-events'),benchWrap=$('lu-benches'),fWrap=$('lu-formations'),injWrap=$('lu-injuries'),noteEl=$('det-source-note');
  if(!sec)return;
  if(!silentRefresh){loading.style.display='flex';evWrap.innerHTML='';benchWrap.innerHTML='';injWrap.innerHTML='';fWrap.textContent='';noteEl.style.display='none';
    pitch.querySelectorAll('.lu-player,.lu-box-home,.lu-box-away').forEach(e=>e.remove());}
  let result=null,usedFallback=false;
  try{ result=await fetchFromFlashScore(m); }
  catch(e){
    usedFallback=true;
    try{ result=await fetchFromBackupApi(m); }
    catch(e2){ result=null; }
  }
  if(!silentRefresh)loading.style.display='none';
  if(!result){ evWrap.innerHTML='<div class="lu-empty">Compositions pas encore disponibles pour ce match.</div>'; return; }
  if(usedFallback){ noteEl.style.display='';noteEl.textContent='Données de secours (API) — FlashScore momentanément indisponible'; }
  fWrap.textContent=`${result.home?.formation||'—'} · ${result.away?.formation||'—'}`;
  renderPitch(result.home,result.away,pitch,result.source);
  renderInjuries(result.injuries,injWrap);
  renderEventsAndHighlight(result.events,m,evWrap);
  renderBenches(result.home,result.away,benchWrap,result.source);
}

function computeRowCounts(startXI){
  const rowCounts={},rows=new Set();
  startXI.forEach(p=>{const row=Number((p.grid||'1:1').split(':')[0]);rows.add(row);rowCounts[row]=(rowCounts[row]||0)+1;});
  return{count:rows.size||1,rowCounts};
}
function gridToXY(grid,isHome,maxRow){
  if(!grid)return{x:50,y:isHome?85:15};
  const[row,col]=grid.split(':').map(Number);
  const colsInRow=maxRow.rowCounts[row]||1;
  const x=(col/(colsInRow+1))*100;
  const span=44;
  const y=isHome?(94-((row-1)/(maxRow.count-1||1))*span):(6+((row-1)/(maxRow.count-1||1))*span);
  return{x,y};
}
function ratingColor(r){
  if(r==null||r==='')return null;
  const v=parseFloat(r);if(isNaN(v))return null;
  if(v>=9)return'#3b8bff'; // bleu — homme du match, comme sur FlashScore
  if(v>=7.5)return'#22c55e'; // vert
  if(v>=6)return'#f5a623'; // orange
  return'#e5484d'; // rouge
}
function renderPitch(home,away,pitch,source){
  pitch.querySelectorAll('.lu-player,.lu-box-home,.lu-box-away').forEach(e=>e.remove());
  const boxHome=document.createElement('div');boxHome.className='lu-box-home';pitch.appendChild(boxHome);
  const boxAway=document.createElement('div');boxAway.className='lu-box-away';pitch.appendChild(boxAway);
  [{team:home,isHome:true},{team:away,isHome:false}].forEach(({team,isHome})=>{
    if(!team?.starting?.length)return;
    const maxRow=computeRowCounts(team.starting);
    team.starting.forEach(player=>{
      const{x,y}=gridToXY(player.grid,isHome,maxRow);
      const el=document.createElement('button');
      el.type='button';
      el.className='lu-player'+(isHome?'':' away');
      el.style.left=x+'%';el.style.top=y+'%';
      el.dataset.playerId=player.id;
      const initials=abbr(player.name);
      const rColor=ratingColor(player.rating);
      const ratingBadge=rColor?`<div class="lu-player-rating" style="background:${rColor}">${parseFloat(player.rating).toFixed(1)}</div>`:'';
      // Les badges (numéro, note, cartons) sont des FRÈRES de .lu-player-photo,
      // pas des enfants : .lu-player-photo a overflow:hidden pour arrondir la
      // photo, ce qui rognait les badges À L'INTÉRIEUR du cercle et masquait le
      // visage. Le wrapper .lu-player-avatar n'a pas d'overflow, les badges
      // débordent donc correctement à l'extérieur.
      // SÉCURITÉ : nom/photo viennent de FlashScore (source externe) — échappés
      // avant injection. Le onerror inline a été retiré : il concaténait les
      // initiales dans du JS, ce qui était injectable via un nom piégé.
      const safePhoto = player.photo ? safeUrl(player.photo) || (String(player.photo).startsWith('/api/img?') ? player.photo : '') : '';
      el.innerHTML=`<div class="lu-player-avatar"><div class="lu-player-photo">${safePhoto?`<img src="${escHtml(safePhoto)}" loading="lazy" alt="">`:`<div class="lu-pi">${escHtml(initials)}</div>`}</div><div class="lu-player-num">${escHtml(String(player.number??''))}</div>${ratingBadge}</div><div class="lu-player-name">${escHtml(player.name||'')}</div>`;
      // Repli sur les initiales si la photo ne charge pas (remplace le onerror inline)
      const imgEl = el.querySelector('.lu-player-photo img');
      if(imgEl) imgEl.addEventListener('error', function(){
        const holder = this.parentNode;
        this.remove();
        if(!holder.querySelector('.lu-pi')){
          const d = document.createElement('div');
          d.className = 'lu-pi';
          d.textContent = initials;
          holder.appendChild(d);
        }
      });
      el.onclick=()=>openPlayerBio(player,isHome?home.name:away.name,source);
      pitch.appendChild(el);
    });
  });
}
function renderBenches(home,away,wrap,source){
  const block=(team,label)=>{
    if(!team?.substitutes?.length)return'';
    return`<div class="lu-bench-title">${label} — Remplaçants</div><div class="lu-bench-list">${team.substitutes.map(player=>{
      const initials=abbr(player.name);
      return`<button type="button" class="lu-bench-player" data-player-id="${player.id}" onclick='openPlayerBio(${JSON.stringify(player).replace(/'/g,"&#39;")},${JSON.stringify(team.name)},${JSON.stringify(source)})'><div class="lu-bench-photo">${player.photo?`<img src="${player.photo}" loading="lazy" onerror="this.style.display='none'">`:`<div class="lu-pi">${initials}</div>`}</div><span class="lu-bench-num">${player.number??''}</span><span class="lu-bench-name">${player.name||''}</span></button>`;
    }).join('')}</div>`;
  };
  wrap.innerHTML=block(home,home?.name||'Domicile')+block(away,away?.name||'Extérieur');
}
function renderInjuries(list,wrap){
  if(!list?.length){wrap.innerHTML='';return;}
  wrap.innerHTML=`<div class="lu-injuries-title">Absents / Blessés</div>`+list.map(p=>
    `<div class="lu-injury-row"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg><div><div class="lu-injury-name">${p.name||'?'}</div><div class="lu-injury-reason">${p.team||''}${p.reason?' · '+p.reason:''}</div></div></div>`
  ).join('');
}
function renderEventsAndHighlight(events,m,wrap){
  if(!m._seenLuEvents)m._seenLuEvents=new Set();
  wrap.innerHTML=events.length?events.slice().reverse().map(e=>{
    const icon=e.type==='sub'
      ?`<div class="lu-ev-icon sub"><svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></div>`
      :`<div class="lu-ev-icon ${e.type}"></div>`;
    const text=e.type==='sub'?`${e.playerInName||'?'} ↔ ${e.playerOutName||'?'}`:(e.playerOutName||'?');
    const sub=e.type==='sub'?'Changement':e.type==='red'?'Carton rouge':'Carton jaune';
    return`<div class="lu-ev-row"><span class="lu-ev-min">${e.minute??''}'</span>${icon}<div><div class="lu-ev-text">${text}</div><div class="lu-ev-sub">${sub}</div></div></div>`;
  }).join(''):'';

  events.forEach(e=>{
    const key=`${e.minute}-${e.type}-${e.playerOutId}`;
    if(m._seenLuEvents.has(key))return;
    m._seenLuEvents.add(key);
    const targetEl=e.playerOutId?document.querySelector(`.lu-player[data-player-id="${e.playerOutId}"]`):null;
    if(!targetEl)return;
    targetEl.classList.add('lu-new-event');
    const badge=document.createElement('div');
    if(e.type==='sub'){
      badge.className='lu-badge-sub out';
      badge.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M20 4H4v16h16V4zm-2 14H6v-2h12v2z"/></svg>';
    }else{
      badge.className='lu-badge '+e.type;
    }
    targetEl.querySelector('.lu-player-avatar').appendChild(badge);
    setTimeout(()=>targetEl.classList.remove('lu-new-event'),3000);
  });
}

// ─── Fiche joueur (bio) ──────────────────────────────
async function openPlayerBio(player,teamName,source){
  const ov=$('player-bio-ov');if(!ov)return;
  const photoEl=$('player-bio-photo'),nameEl=$('player-bio-name'),posEl=$('player-bio-pos'),factsEl=$('player-bio-facts');
  const initials=abbr(player.name);
  photoEl.innerHTML=player.photo?`<img src="${player.photo}" onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div class=\\'lu-pi\\'>${initials}</div>')">`:`<div class="lu-pi">${initials}</div>`;
  nameEl.textContent=player.name||'—';
  posEl.textContent=[player.position,teamName].filter(Boolean).join(' · ')||'—';
  const fact=(label,value)=>value?`<div class="player-bio-fact"><span class="player-bio-fact-label">${label}</span><span class="player-bio-fact-value">${value}</span></div>`:'';
  const marketValueTxt=player.marketValue?Math.round(player.marketValue/100000)/10+' M€':'';
  factsEl.innerHTML=fact('Âge',player.age?player.age+' ans':'')+fact('Nationalité',player.nationality)+fact('Taille',player.height)+fact('Pied fort',player.foot)+fact('Numéro',player.number)+fact('Note moyenne',player.rating)+fact('Valeur marchande',marketValueTxt);
  // Lien vers la fiche FlashScore complète (bio détaillée, historique, stats saison)
  const linkWrap=$('player-bio-facts');
  if(player.bioUrl&&player.id){
    linkWrap.innerHTML+=`<a class="player-bio-fact" style="justify-content:center;color:var(--acc);text-decoration:none;margin-top:6px" href="https://www.flashscore.fr/joueur/${player.bioUrl}/${player.id}/" target="_blank" rel="noopener">Voir la fiche complète →</a>`;
  }
  ov.style.display='flex';
  // Complément bio via l'API backup si la source FS n'a pas fourni ces champs
  // (endpoint /players existe sur api-sports.io — nécessite un id joueur AF,
  // qui ne correspond pas forcément à l'id FlashScore : best-effort seulement).
  if(source==='fs'&&!player.age&&!player.nationality&&player.id){
    // Pas de mapping id FS → id AF fiable sans un id club/nom précis : on ne
    // tente pas de complément ici pour éviter d'afficher une mauvaise fiche.
  }
}
function closePlayerBio(){const ov=$('player-bio-ov');if(ov)ov.style.display='none';}

// ═══════════════════════════════════════════════════
// ── SIGNALEMENTS (bugs / failles / suggestions) ──
// Stockés dans Firebase sous /feedback/{id}. Les VIP sont marqués prioritaires
// et remontent en haut de la liste côté admin.
// ═══════════════════════════════════════════════════
let _fbShots = [];          // captures jointes, en base64 compressé
const FB_MAX_SHOTS = 3;
const FB_SHOT_MAX_BYTES = 120000; // ~120 Ko par image après compression

function openFeedbackModal(){
  if(!currentUser){ toast('Connecte-toi pour envoyer un signalement'); openAuthModal('login'); return; }
  _fbShots = [];
  const ov = $('feedback-ov');
  if(!ov){
    // Garde-fou : si la modale n'est pas dans le DOM (index.html pas à jour),
    // on le dit au lieu de ne rien faire du tout — c'est exactement le symptôme
    // qu'on a eu quand elle était imbriquée dans le lecteur vidéo masqué.
    console.error('[feedback] #feedback-ov introuvable dans le DOM');
    toast('Formulaire indisponible, recharge la page');
    return;
  }
  const t = $('fb-text'); if(t) t.value = '';
  const ttl = $('fb-title'); if(ttl) ttl.value = '';
  setFeedbackType('bug');
  renderFbShots();
  const prio = $('fb-priority-note');
  if(prio) prio.style.display = isVIP() ? '' : 'none';
  ov.style.display = 'flex';
}
function closeFeedbackModal(){ const ov=$('feedback-ov'); if(ov) ov.style.display='none'; }

let _fbType = 'bug';
function setFeedbackType(t){
  _fbType = t;
  document.querySelectorAll('.fb-type-btn').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}

function fbPickShots(){
  const inp = $('fb-file-input');
  if(inp) inp.click();
}
function fbHandleFiles(e){
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  files.forEach(f => {
    if(_fbShots.length >= FB_MAX_SHOTS){ toast('3 captures maximum'); return; }
    if(!f.type.startsWith('image/')){ toast('Images uniquement'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        // Redimensionnement : une capture de téléphone fait plusieurs Mo, ce qui
        // ne passerait pas dans la Realtime Database.
        const MAX = 1000;
        let w = img.width, h = img.height;
        if(w > MAX || h > MAX){ const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let data = '', q = 0.7;
        for(let i=0;i<5;i++){ data = c.toDataURL('image/jpeg', q); if(data.length < FB_SHOT_MAX_BYTES) break; q -= 0.12; }
        if(data.length > FB_SHOT_MAX_BYTES*1.3){ toast('Capture trop lourde'); return; }
        _fbShots.push(data);
        renderFbShots();
      };
      img.onerror = () => toast('Image illisible');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  });
}
function fbRemoveShot(i){ _fbShots.splice(i,1); renderFbShots(); }
function renderFbShots(){
  const wrap = $('fb-shots');
  if(!wrap) return;
  wrap.innerHTML = _fbShots.map((d,i) =>
    '<div class="fb-shot"><img src="'+d+'" alt=""><button class="fb-shot-del" onclick="fbRemoveShot('+i+')">×</button></div>'
  ).join('') + (_fbShots.length < FB_MAX_SHOTS
    ? '<button class="fb-shot-add" onclick="fbPickShots()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg><span>Capture</span></button>'
    : '');
}

function submitFeedback(){
  if(!currentUser || !db){ toast('Non connecté'); return; }
  const titleEl = $('fb-title'), textEl = $('fb-text');
  const title = (titleEl?.value || '').trim();
  const text  = (textEl?.value || '').trim();
  if(title.length < 4){ toast('Donne un titre court'); return; }
  if(text.length < 10){ toast('Décris un peu plus en détail'); return; }
  if(text.length > 2000){ toast('Description trop longue (2000 max)'); return; }

  const btn = $('fb-submit-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }

  const payload = {
    type: _fbType,
    title: title.slice(0,100),
    text: text.slice(0,2000),
    uid: currentUser.uid,
    pseudo: (currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonyme').slice(0,24),
    email: currentUser.email || null,
    vip: isVIP(),
    status: 'open',
    ts: Date.now(),
    ua: navigator.userAgent.slice(0,180),
    shots: _fbShots.length ? _fbShots : null,
  };

  db.ref('feedback').push(payload)
    .then(() => {
      toast('✅ Merci ! Signalement envoyé');
      closeFeedbackModal();
    })
    .catch(err => {
      console.error('[feedback]', err && err.message);
      toast('❌ Envoi impossible');
    })
    .finally(() => { if(btn){ btn.disabled = false; btn.textContent = 'Envoyer'; } });
}

// ─── Sous-navigation Détails : Compos / Stats / Stats joueurs ───
let detTab='compos';
function resetDetTabs(){
  detTab='compos';
  ['compos','stats','players'].forEach(t=>{
    $('det-tab-'+t)?.classList.toggle('on',t==='compos');
    const p=$('det-panel-'+t);if(p)p.style.display=t==='compos'?'':'none';
  });
}
function switchDetTab(tab){
  detTab=tab;
  ['compos','stats','players'].forEach(t=>{
    $('det-tab-'+t)?.classList.toggle('on',t===tab);
    const p=$('det-panel-'+t);if(p)p.style.display=t===tab?'':'none';
  });
  const m=pl.match;if(!m)return;
  if(tab==='stats')loadMatchStats(m);
  if(tab==='players')loadPlayersStats(m);
}

// ─── Panneau Stats du match (barres comparatives) ───
async function fetchStatsFromFlashScore(m){
  const fsId=await resolveFsMatchId(m);
  if(!fsId)throw new Error('fs_no_match_id');
  // dsos2 confirmé par capture HAR le 11/09/2026 : stats du match déjà
  // libellées en français (possession, tirs totaux, tirs cadrés, etc.)
  const raw=await fsFetch(`/pq_graphql?_hash=dsos2&eventId=${fsId}&projectId=${FS_PROJECT_ID_CLIENT}`);
  const data=parseFsFeed(raw)?.data?.findEventById;
  if(!data)throw new Error('fs_no_stats');
  const homePart=data.eventParticipants?.find(p=>p.type?.side==='HOME');
  const awayPart=data.eventParticipants?.find(p=>p.type?.side==='AWAY');
  const homeVals=homePart?.stats?.[0]?.values||[];
  const awayVals=awayPart?.stats?.[0]?.values||[];
  const rows=homeVals.map((hv,i)=>({label:hv.name,home:hv.value,away:awayVals[i]?.value}));
  if(!rows.length)throw new Error('fs_empty_stats');
  return{rows,source:'fs'};
}
async function fetchStatsFromBackupApi(m){
  const fixtureId=await resolveAfFixtureId(m);
  if(!fixtureId)throw new Error('af_no_fixture_id');
  const res=await afFetch('/fixtures/statistics?fixture='+fixtureId);
  const resp=res?.response||[];
  if(resp.length<2)throw new Error('af_empty_stats');
  const[home,away]=resp;
  const rows=(home.statistics||[]).map((s,i)=>({label:s.type,home:s.value,away:away.statistics?.[i]?.value}));
  if(!rows.length)throw new Error('af_empty_stats');
  return{rows,source:'af'};
}
function renderStatsRows(rows){
  const wrap=$('det-stats-list');if(!wrap)return;
  if(!rows?.length){wrap.innerHTML='<div class="lu-empty">Statistiques indisponibles pour ce match.</div>';return;}
  wrap.innerHTML=rows.map(r=>{
    const h=parseFloat(r.home)||0,a=parseFloat(r.away)||0,total=(h+a)||1;
    const hPct=Math.round(h/total*100),aPct=100-hPct;
    return`<div class="det-stat-row"><div class="det-stat-vals"><span>${r.home??'-'}</span><span>${r.away??'-'}</span></div><div class="det-stat-label">${r.label||''}</div><div class="det-stat-bar"><div class="det-stat-bar-home" style="width:${hPct}%"></div><div class="det-stat-bar-away" style="width:${aPct}%"></div></div></div>`;
  }).join('');
}
async function loadMatchStats(m,silentRefresh){
  const wrap=$('det-stats-list');if(!wrap)return;
  if(!silentRefresh&&m._statsCache){renderStatsRows(m._statsCache);return;}
  if(!silentRefresh)wrap.innerHTML='<div class="lu-loading" style="display:flex"><div class="spinner"></div></div>';
  let result=null;
  try{result=await fetchStatsFromFlashScore(m);}catch(e){try{result=await fetchStatsFromBackupApi(m);}catch(e2){result=null;}}
  m._statsCache=result?.rows||null;
  renderStatsRows(m._statsCache);
}

// ─── Panneau Stats joueurs (classement par catégorie) ───
// FlashScore (dlie2) donne un vrai rating par joueur mais pas encore les
// compteurs tirs/buts/passes/tacles (onglet "Stats joueurs" jamais capturé
// côté FlashScore). L'API backup a l'inverse (tout SAUF un rating toujours
// fiable). Solution : on interroge les deux et on fusionne — rating de
// FlashScore quand dispo, compteurs de l'API backup — au lieu de tout miser
// sur une seule source (ce qui avait fait disparaître le Rating sur les
// matchs où le backup ne trouve pas le fixture).
async function fetchPlayersFromFlashScore(m){
  const fsId=await resolveFsMatchId(m);
  if(!fsId)throw new Error('fs_no_match_id');
  const raw=await fsFetch(`/pq_graphql?_hash=dlie2&eventId=${fsId}&projectId=${FS_PROJECT_ID_CLIENT}`);
  const data=parseFsFeed(raw)?.data?.findEventById;
  if(!data)throw new Error('fs_no_player_stats');
  const list=[];
  (data.eventParticipants||[]).forEach(part=>{
    const L=part.lineup||part.predictedLineup;
    (L?.players||[]).forEach(p=>{
      const rating=parseFloat(p.rating??p.averageRating)||0;
      if(rating>0)list.push({id:p.id,name:p.listName||p.fieldName,rating});
    });
  });
  if(!list.length)throw new Error('fs_empty_player_stats');
  return{list,source:'fs'};
}
async function fetchPlayersFromBackupApi(m){
  const fixtureId=await resolveAfFixtureId(m);
  if(!fixtureId)throw new Error('af_no_fixture_id');
  const res=await afFetch('/fixtures/players?fixture='+fixtureId);
  const resp=res?.response||[];
  if(!resp.length)throw new Error('af_empty_player_stats');
  const list=[];
  resp.forEach(teamBlock=>{
    const teamName=teamBlock.team?.name||'';
    (teamBlock.players||[]).forEach(p=>{
      const st=p.statistics?.[0];if(!st)return;
      list.push({
        id:p.player.id,name:p.player.name,team:teamName,photo:p.player.photo,
        rating:parseFloat(st.games?.rating)||0,
        shots:st.shots?.total||0,
        goals:st.goals?.total||0,
        passes:st.passes?.total||0,
        tackles:(st.tackles?.total||0)+(st.tackles?.interceptions||0)+(st.tackles?.blocks||0),
      });
    });
  });
  if(!list.length)throw new Error('af_empty_player_stats');
  return{list,source:'af'};
}
function normPlayerName(s){return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');}
async function fetchPlayersStatsMerged(m){
  const[fsResult,afResult]=await Promise.allSettled([fetchPlayersFromFlashScore(m),fetchPlayersFromBackupApi(m)])
    .then(([a,b])=>[a.status==='fulfilled'?a.value:null,b.status==='fulfilled'?b.value:null]);
  if(!fsResult&&!afResult)throw new Error('no_player_stats_any_source');
  if(!afResult)return fsResult; // seulement FlashScore dispo → rating seul, autres catégories vides
  if(!fsResult)return afResult; // seulement le backup dispo → toutes catégories, rating du backup
  // Les deux sont dispo : on part de la liste backup (a toutes les catégories)
  // et on écrase juste le rating par celui de FlashScore quand on trouve le
  // même joueur (par nom normalisé — les id ne correspondent pas entre les
  // deux sources).
  const fsByName=new Map(fsResult.list.map(p=>[normPlayerName(p.name),p.rating]));
  afResult.list.forEach(p=>{
    const r=fsByName.get(normPlayerName(p.name));
    if(r)p.rating=r;
  });
  return{list:afResult.list,source:'merged'};
}
let playersCat='rating';
function switchPlayersCat(cat){
  playersCat=cat;
  document.querySelectorAll('.det-players-subtab').forEach(b=>b.classList.toggle('on',b.dataset.cat===cat));
  if(pl.match?._playersStatsCache)renderPlayersList(pl.match._playersStatsCache);
}
function renderPlayersList(list){
  const wrap=$('det-players-list');if(!wrap)return;
  if(!list?.length){wrap.innerHTML='<div class="lu-empty">Stats joueurs indisponibles pour ce match.</div>';return;}
  const sorted=[...list].filter(p=>(p[playersCat]||0)>0).sort((a,b)=>(b[playersCat]||0)-(a[playersCat]||0)).slice(0,10);
  if(!sorted.length){wrap.innerHTML='<div class="lu-empty">Pas de données pour cette catégorie.</div>';return;}
  wrap.innerHTML=sorted.map((p,i)=>{
    const initials=abbr(p.name);
    const bioPayload=JSON.stringify({id:p.id,name:p.name,photo:p.photo,number:null,position:null}).replace(/'/g,'&#39;');
    return`<button type="button" class="det-player-row" onclick='openPlayerBio(${bioPayload},${JSON.stringify(p.team)},"stats")'>
      <span class="det-player-rank">${i+1}</span>
      <div class="det-player-photo">${p.photo?`<img src="${p.photo}" loading="lazy" onerror="this.style.display='none'">`:`<div class="lu-pi">${initials}</div>`}</div>
      <div class="det-player-info"><div class="det-player-name">${p.name||'?'}</div><div class="det-player-team">${p.team||''}</div></div>
      <span class="det-player-val">${playersCat==='rating'?(p.rating?p.rating.toFixed(1):'-'):(p[playersCat]??0)}</span>
    </button>`;
  }).join('');
}
async function loadPlayersStats(m,silentRefresh){
  const wrap=$('det-players-list');if(!wrap)return;
  if(!silentRefresh&&m._playersStatsCache){renderPlayersList(m._playersStatsCache);return;}
  if(!silentRefresh)wrap.innerHTML='<div class="lu-loading" style="display:flex"><div class="spinner"></div></div>';
  let result=null;
  try{result=await fetchPlayersStatsMerged(m);}catch(e){result=null;}
  m._playersStatsCache=result?.list||null;
  renderPlayersList(m._playersStatsCache);
}
// OPTIMISATION : ces rafraîchissements tournaient en continu, même quand
// l'onglet était en arrière-plan ou le téléphone en veille — ça consommait le
// quota des API (football-data.org est limité) et la batterie pour rien.
// On ne rafraîchit désormais que si la page est réellement visible, et on
// force une mise à jour au retour sur l'onglet pour ne rien afficher de périmé.
function pageVisible(){ return document.visibilityState === 'visible'; }
setInterval(()=>{ if(pageVisible() && Date.now()-lastFetch>60000) loadMatches(); },60000);
setInterval(()=>{ if(pageVisible() && data.live.length) loadLiveData(); },30000);
document.addEventListener('visibilitychange', ()=>{
  if(!pageVisible()) return;
  if(Date.now()-lastFetch > 60000) loadMatches();
  else if(data.live.length) loadLiveData();
});

// ─── TICKER ──────────────────────────────────────────
function renderTicker(){
  const ticker=$('ticker'),live=data.live,fin=(data.byDate[todayKey()]||[]).filter(isFin).slice(0,5);
  if(!live.length&&!fin.length){ticker.innerHTML=`<span class="t-item t-idle">AUCUN MATCH EN DIRECT</span>`;ticker.classList.remove('anim');return;}
  const items=[
    ...live.map(m=>{const min=getMin(m),hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;return`<span class="t-item"><span class="t-live">●</span><b>${hn}</b><span class="t-sc">${getScore(m)}</span><b>${an}</b>${min?`<span class="t-min">${min}</span>`:''}</span>`;}),
    ...fin.map(m=>{const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;return`<span class="t-item"><span class="t-ft">FT</span><b>${hn}</b><span class="t-sc t-sc-ft">${getScore(m)}</span><b>${an}</b></span>`;})
  ];
  const dur=Math.max(20,items.length*6);ticker.style.setProperty('--dur',dur+'s');
  const h=items.join('');ticker.innerHTML=h+h;ticker.classList.add('anim');
}

// ─── NAV ─────────────────────────────────────────────
function setPage(pg){
  haptic(5);
  if(adminOpen){ adminOpen=false; applyStreams(); }
  if(page===pg){$('scroll').scrollTo({top:0,behavior:'smooth'});return;}
  page=pg;lgFilter='all';
  document.querySelectorAll('.bi[data-pg]').forEach(e=>e.classList.toggle('on',e.dataset.pg===pg));
  $('scroll').scrollTop=0;
  renderContent();
}
function setDate(dk){ haptic(5);
  if(selectedDate===dk)return;
  const dir=dk>selectedDate?'left':'right';
  selectedDate=dk;lgFilter='all';
  renderContent(dir);
  // Scroll animé avec la même courbe que le slide de page (0.32s, même easing)
  requestAnimationFrame(()=>{
    const bar=$('date-bar'),chip=bar?.querySelector('.date-chip.on');
    if(!bar||!chip)return;
    const target=chip.offsetLeft-bar.offsetWidth/2+chip.offsetWidth/2;
    const start=bar.scrollLeft, diff=target-start;
    if(Math.abs(diff)<2)return;
    const duration=320;
    const ease=t=>t<.5?2*t*t:(4-2*t)*t-1; // ease-in-out proche du cubic-bezier page
    let startTime=null;
    function step(ts){
      if(!startTime)startTime=ts;
      const p=Math.min((ts-startTime)/duration,1);
      bar.scrollLeft=start+diff*ease(p);
      if(p<1)requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
// Depuis un pill de compétition (page Accueil) : va sur la page Live
// et applique directement le filtre de cette compétition
function goToCompetition(id){
  setPage('home');
  setTimeout(()=>setLg(id), 60);
}
function setLg(id){
  lgFilter=id;
  renderContent();
  // Scroll la comp-bar pour mettre le chip sélectionné tout à gauche
  requestAnimationFrame(()=>{
    const bar=document.querySelector('.comp-bar');
    const chip=bar?.querySelector('.comp-chip.on');
    if(!bar||!chip) return;
    const target = chip.offsetLeft - 14;
    const start  = bar.scrollLeft;
    const diff   = target - start;
    if(Math.abs(diff) < 2) return;
    const duration = 320;
    // ease-out cubique : part vite et arrive doucement, sans partir à droite
    const ease = t => 1 - Math.pow(1 - t, 3);
    let startTime = null;
    function step(ts){
      if(!startTime) startTime=ts;
      const p = Math.min((ts-startTime)/duration, 1);
      bar.scrollLeft = start + diff * ease(p);
      if(p<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}



// ─── PAGE COMPTE ─────────────────────────────────────

// ─── INSTALL PWA ─────────────────────────────────────
function triggerInstall(){
  if(deferredPrompt){
    // Android Chrome — prompt natif
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(({outcome})=>{
      deferredPrompt=null;
      if(outcome==='accepted') toast('Okin Stream installé !');
      updateInstallBtn();
    });
  } else if(isIOS){
    // iOS Safari — guide
    showIOSInstallGuide();
  } else {
    toast('Déjà installé ou non supporté sur ce navigateur');
  }
}

function updateInstallBtn(){
  const btn=document.getElementById('about-install-btn');
  const note=document.getElementById('about-install-note');
  const block=document.getElementById('about-install-block');
  if(!btn||!block)return;

  if(isStandalone){
    // Déjà installé — afficher un message
    btn.disabled=true;
    btn.style.opacity='0.5';
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Application installée`;
    if(note)note.textContent='Tu utilises déjà la version installée.';
  } else if(deferredPrompt){
    // Chrome Android — prêt
    if(note)note.textContent='Compatible avec ton appareil.';
  } else if(isIOS){
    // iOS
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/></svg> Ajouter sur l'écran d'accueil`;
    if(note)note.textContent="Ouvre le guide d'installation pour iOS.";
  } else {
    // Navigateur non supporté ou déjà installé
    btn.style.opacity='0.45';
    btn.disabled=true;
    if(note)note.textContent='Déjà installé ou non supporté sur ce navigateur.';
  }
}


// ═══════════════════════════════════════════════════════
// ─── SPLASH SCREEN ───────────────────────────────────
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// ─── THÈMES & ACCENTS ────────────────────────────────
// ═══════════════════════════════════════════════════════
function applyTheme(theme, save=true){
  // Transition fluide : classe temporaire sur html
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', theme);
  const colors={dark:'#060608',grey:'#1a1a1f',light:'#ebebf0'};
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]||'#060608');
  if(save) localStorage.setItem('theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme===theme));
  setTimeout(()=>document.documentElement.classList.remove('theme-transitioning'), 300);
}

function applyAccent(color, save=true){
  document.documentElement.style.setProperty('--acc', color);
  const hex=color.replace('#','');
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  const luminance=(0.299*r+0.587*g+0.114*b)/255;
  document.documentElement.style.setProperty('--bg-on-acc', luminance>0.6?'#060608':'#ffffff');
  document.documentElement.style.setProperty('--acc-rgb', `${r},${g},${b}`);
  if(save) localStorage.setItem('accent', color);
  document.querySelectorAll('.accent-btn').forEach(b=>b.classList.toggle('active', b.dataset.accent===color));
}

// ═══════════════════════════════════════════════════════
// ─── DRAWER PARAMÈTRES ───────────────────────────────
// ═══════════════════════════════════════════════════════
function openSettings(){
  const ov=document.getElementById('sett-ov');
  if(!ov)return;
  ov.classList.add('open');
  document.body.style.overflow='hidden';
  // Sync toggles
  const syncT=(id,key,def='0')=>document.getElementById(id)?.classList.toggle('on',(localStorage.getItem(key)??def)==='1');
  syncT('toggle-notif','notif-enabled','0');
  syncT('toggle-livescores','live-scores','1');
  syncT('toggle-24h','fmt-24h','1');
  syncT('toggle-mute-start','mute-start','0');
  syncT('toggle-autofs','auto-fs','0');
  // Sync thème/accent
  const theme=localStorage.getItem('theme')||'dark';
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
  const accent=localStorage.getItem('accent')||'#e8ff47';
  document.querySelectorAll('.accent-btn').forEach(b=>b.classList.toggle('active',b.dataset.accent===accent));
  // Bouton retour
  document.getElementById('sett-back').onclick=closeSettings;
}

function closeSettings(){
  const ov=document.getElementById('sett-ov');
  if(!ov)return;
  ov.style.animation='clubOut .2s var(--ease) both';
  setTimeout(()=>{ov.classList.remove('open');ov.style.animation='';document.body.style.overflow='';},200);
}

function initSettings(){
  applyTheme(localStorage.getItem('theme')||'dark', false);
  applyAccent(localStorage.getItem('accent')||'#e8ff47', false);

  // Sync toggles depuis localStorage
  const syncToggle = (id, key, def='0') => {
    const on = (localStorage.getItem(key) ?? def) === '1';
    document.getElementById(id)?.classList.toggle('on', on);
  };
  syncToggle('toggle-notif',      'notif-enabled', '0');
  syncToggle('toggle-livescores', 'live-scores',   '1');
  syncToggle('toggle-24h',        'fmt-24h',       '1');
  syncToggle('toggle-mute-start', 'mute-start',    '0');
  syncToggle('toggle-autofs',     'auto-fs',       '0');

  document.getElementById('btn-settings')?.addEventListener('click', openSettings);

  document.querySelectorAll('.theme-btn').forEach(btn=>{
    btn.addEventListener('click',()=>applyTheme(btn.dataset.theme));
  });
  document.querySelectorAll('.accent-btn').forEach(btn=>{
    btn.addEventListener('click',()=>applyAccent(btn.dataset.accent));
  });

  // Toggles simples
  const bindToggle = (id, key) => {
    document.getElementById(id)?.addEventListener('click', function(){
      const on = !this.classList.contains('on');
      this.classList.toggle('on', on);
      localStorage.setItem(key, on ? '1' : '0');
    });
  };
  bindToggle('toggle-livescores', 'live-scores');
  bindToggle('toggle-24h',        'fmt-24h');
  bindToggle('toggle-mute-start', 'mute-start');
  bindToggle('toggle-autofs',     'auto-fs');

  // Notifications (besoin de permission)
  document.getElementById('toggle-notif')?.addEventListener('click', function(){
    const on = !this.classList.contains('on');
    if(on){
      Notification.requestPermission().then(perm=>{
        if(perm==='granted'){ this.classList.add('on'); localStorage.setItem('notif-enabled','1'); toast('Notifications activées'); }
        else toast('Permission refusée');
      });
    } else {
      this.classList.remove('on'); localStorage.setItem('notif-enabled','0'); toast('Notifications désactivées');
    }
  });

  // Installer
  document.getElementById('settings-install-btn')?.addEventListener('click',()=>triggerInstall());

  // Effacer favoris
  document.getElementById('settings-clear-btn')?.addEventListener('click',()=>{
    if(favorites.size===0){ toast('Aucun favori à effacer'); return; }
    favorites.clear();
    localStorage.removeItem('favs');
    toast('Favoris effacés');
    renderContent();
  });

  // Swipe down pour fermer
  let startY=0;
  const drawer = document.getElementById('settings-drawer');
  drawer?.addEventListener('touchstart',e=>{ startY=e.touches[0].clientY; },{passive:true});
  drawer?.addEventListener('touchmove',e=>{
    if(e.touches[0].clientY - startY > 80) closeSettings();
  },{passive:true});
}

// ─── RENDER ──────────────────────────────────────────
function renderContent(dir){
  if(adminOpen){ renderAdminPanel(); return; }
  const html=page==='dashboard'?renderDashboard():loading?`<div class="loading"><div class="spinner"></div></div>`:page==='home'?renderHome():page==='schedule'?renderSchedule():page==='favorites'?renderFavs():page==='search'?renderSearch():page==='account'?renderAccount():'';
  const cls=dir==='left'?'slide-left':dir==='right'?'slide-right':'slide-up';
  $('content').innerHTML=`<div class="page ${cls}">${html}</div>`;
  bindEvents();
  if(page==='account') setTimeout(updateVIPCard,50);
  // Appeler adsbygoogle si dispo (pour activer les pubs)
  if(typeof adsbygoogle!=='undefined'){try{(adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}}
}

function fmtDayLabel(k){const tk=todayKey();if(k===tk)return'Auj.';if(k===dayKey(addDays(new Date(),1)))return'Demain';if(k===dayKey(addDays(new Date(),-1)))return'Hier';return new Date(k+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit'}).replace(/\./g,'').trim();}
function fmtDayFull(k){return new Date(k+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});}

function datePicker(){
  const today=new Date();let h='<div class="date-bar" id="date-bar">';
  for(let i=-3;i<=6;i++){const k=dayKey(addDays(today,i)),has=(data.byDate[k]||[]).length>0;h+=`<div class="date-chip${selectedDate===k?' on':''}${!has?' empty':''}" onclick="setDate('${k}')"><span class="dc-label">${fmtDayLabel(k)}</span><span class="dc-dot"></span></div>`;}
  return h+'</div>';
}
function compFilter(){
  const sel=selectedDate||todayKey(),present=new Set((data.byDate[sel]||[]).map(m=>m._cid));
  let h='<div class="comp-bar">';
  h+=`<div class="comp-chip${lgFilter==='all'?' on':''}" onclick="setLg('all')">Tous</div>`;
  for(const[id,name]of Object.entries(COMPS)){const has=present.has(id);h+=`<div class="comp-chip${lgFilter===id?' on':''}${!has?' dim':''}" onclick="${has?`setLg('${id}')`:'void 0'}"><img src="https://crests.football-data.org/${id}.png" onerror="this.style.display='none'" alt=""><span>${name}</span></div>`;}
  return h+'</div>';
}
function groupByComp(arr){const g={};for(const m of arr){if(!g[m._cname])g[m._cname]=[];g[m._cname].push(m);}return g;}

// ─── NEWS ENGINE ──────────────────────────────────────
let newsCache=[];
let newsLoading=false;
let newsLoaded=false;

// Les flux RSS sont désormais agrégés par le serveur (/api/news) : l'appel
// direct à api.rss2json.com depuis le navigateur était bloqué par la CSP
// (connect-src n'autorise que 'self' + Firebase), d'où la section Actualités
// systématiquement vide.
async function fetchNews(){
  if(newsLoading)return;
  newsLoading=true;
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),15000);
    const res=await fetch('/api/news',{signal:ctrl.signal});
    clearTimeout(tid);
    const json=await res.json();
    newsCache=Array.isArray(json.items)?json.items:[];
  }catch(e){
    console.warn('[news] chargement échoué:', e && e.message);
    newsCache=[];
  }
  newsLoading=false;
  newsLoaded=true;
  // Injecter dans le DOM sans re-render total
  const list=document.getElementById('dash-news-list');
  if(list) list.innerHTML=newsCache.length?renderNewsList():'<div class="news-empty">Actualités momentanément indisponibles</div>';
  const sub=document.getElementById('dash-news-count');
  if(sub) sub.textContent=newsCache.length?`${newsCache.length} articles`:'';
}


function fmtNewsDate(d){
  if(!d)return'';
  try{
    const diff=Math.floor((Date.now()-new Date(d))/60000);
    if(diff<1)return'À l\'instant';
    if(diff<60)return`Il y a ${diff} min`;
    if(diff<1440)return`Il y a ${Math.floor(diff/60)}h`;
    return new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  }catch(e){return'';}
}

// SÉCURITÉ : n'autorise que http(s) dans un href/src. Sans ça, un flux RSS
// compromis pouvait injecter href="javascript:..." (exécution de code au clic).
function safeUrl(u){
  if(!u) return '';
  const s = String(u).trim();
  if(!/^https?:\/\//i.test(s)) return '';
  return s.replace(/["'<>]/g,'');
}
function renderNewsList(){
  if(!newsCache.length)return'<div class="news-empty">Aucune actualité disponible</div>';
  // SÉCURITÉ : tout le contenu vient de flux RSS externes (non fiables) — il
  // était injecté brut dans le DOM, ce qui permettait un XSS via un titre
  // contenant du HTML. Tout est désormais échappé.
  return newsCache.slice(0,20).map((n,i)=>{
    const link = safeUrl(n.link);
    const img  = safeUrl(n.img);
    const color = /^#[0-9a-fA-F]{3,8}$/.test(n.color||'') ? n.color : 'var(--acc)';
    return `
    <a class="news-card${i===0?' news-card-featured':''}"${link?` href="${link}"`:''} target="_blank" rel="noopener noreferrer">
      ${img&&i===0?`<div class="news-card-img" style="background-image:url('${img}')"><div class="news-card-img-overlay"></div></div>`:''}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="news-source" style="--src-color:${color}">${escHtml(n.source)}</span>
          <span class="news-date">${escHtml(fmtNewsDate(n.pubDate))}</span>
        </div>
        <div class="news-card-title${i===0?' news-title-lg':''}">${escHtml(n.title)}</div>
        ${n.desc&&i>0?`<div class="news-card-desc">${escHtml(n.desc)}…</div>`:''}
      </div>
      <svg class="news-arrow" viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </a>`;
  }).join('');
}

function renderDashboard(){
  const today=todayKey();
  const allToday=data.byDate[today]||[];
  const live=allToday.filter(isLive);
  const upcoming=allToday.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');

  if(!newsLoaded&&!newsLoading) fetchNews();

  const totalToday=allToday.length;

  // Apparition en cascade : chaque bloc reçoit un délai croissant (plafonné
  // pour que le bas de page n'attende pas trop longtemps).
  let _ai = 0;
  const anim = () => `style="--d:${Math.min(_ai++,14)*55}ms"`;

  const hour=new Date().getHours();
  const greet=hour<6?'Bonne nuit':hour<12?'Bonjour':hour<18?'Bon après-midi':'Bonsoir';
  const who=currentUser?(currentUser.displayName||currentUser.email.split('@')[0]||''):'';

  // Aperçu des 3 prochains matchs (live d'abord, puis à venir)
  const preview=[...live,...upcoming].slice(0,3);

  return`<div class="dash-wrap">

    <!-- HERO WELCOME -->
    <div class="dash-hero-card dash-anim" ${anim()}>
      <div class="dash-hero-glow"></div>
      <div class="dash-hero-top">
        <div class="dash-hero-logo"><img src="/ball.png" width="44" height="44" style="object-fit:contain;display:block" alt=""></div>
        <div class="dash-hero-text">
          <div class="dash-hero-greet">${greet}${who?', '+escHtml(who.slice(0,16)):''}</div>
          <div class="dash-hero-title"><span class="dash-hero-brand">OKIN STREAM</span></div>
          <div class="dash-hero-date">${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
      </div>
      <div class="dash-stats-row">
        <div class="dash-stat">
          <div class="dash-stat-val ${live.length>0?'live-color':''}">${live.length>0?`<span class="dash-live-dot"></span>${live.length}`:totalToday}</div>
          <div class="dash-stat-lbl">${live.length>0?'En direct':'Matchs aujourd\'hui'}</div>
        </div>
        <div class="dash-stat-sep"></div>
        <div class="dash-stat">
          <div class="dash-stat-val">${upcoming.length}</div>
          <div class="dash-stat-lbl">À venir</div>
        </div>
        <div class="dash-stat-sep"></div>
        <div class="dash-stat">
          <div class="dash-stat-val">${Object.keys(data.byDate).length||'—'}</div>
          <div class="dash-stat-lbl">Jours couverts</div>
        </div>
      </div>
      <div class="dash-hero-actions">
        <button class="dash-cta primary" onclick="setPage('home')">
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          Matchs live
        </button>
        <button class="dash-cta ghost" onclick="setPage('schedule')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Programme
        </button>
      </div>
    </div>

    <!-- APERÇU MATCHS DU JOUR -->
    ${preview.length?`
    <div class="dash-section-head dash-anim" ${anim()}>
      <span class="dash-section-title">${live.length?'<span class="dash-live-dot"></span> En ce moment':'Prochains matchs'}</span>
      <button class="dash-section-link" onclick="setPage('home')">Tout voir</button>
    </div>
    <div class="dash-preview-list dash-anim" ${anim()}>
      ${preview.map(m=>{
        const lv=isLive(m);
        const time=lv?(m._status?.elapsed!=null?m._status.elapsed+"'":'LIVE'):fmtTime(m.utcDate);
        return`<div class="dash-preview-row" data-mid="${m.id}">
          <div class="dash-prev-time ${lv?'is-live':''}">${lv?'<span class="dash-live-dot"></span>':''}${time}</div>
          <div class="dash-prev-teams">
            <div class="dash-prev-team"><img src="${m.homeTeam.crest||''}" onerror="this.style.visibility='hidden'" alt=""><span>${escHtml(m.homeTeam.shortName||m.homeTeam.name||'')}</span></div>
            <div class="dash-prev-team"><img src="${m.awayTeam.crest||''}" onerror="this.style.visibility='hidden'" alt=""><span>${escHtml(m.awayTeam.shortName||m.awayTeam.name||'')}</span></div>
          </div>
          ${lv&&m.goals?`<div class="dash-prev-score">${m.goals.home??0}<br>${m.goals.away??0}</div>`:'<svg class="dash-prev-arrow" viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>'}
        </div>`;
      }).join('')}
    </div>`:''}

    <!-- COMPÉTITIONS -->
    <div class="dash-section-head dash-anim" ${anim()}>
      <span class="dash-section-title">Compétitions suivies</span>
    </div>
    <div class="dash-comps-scroll dash-anim" ${anim()}>
      ${Object.entries({CL:'Champions League',EL:'Europa League',PL:'Premier League',PD:'La Liga',BL1:'Bundesliga',SA:'Serie A',FL1:'Ligue 1'}).map(([id,name])=>`
        <div class="dash-comp-pill" onclick="goToCompetition('${id}')">
          <img src="https://crests.football-data.org/${id}.png" onerror="this.style.display='none'" alt="">
          <span>${name}</span>
        </div>`).join('')}
    </div>

    <!-- CE QUE PROPOSE LE SITE -->
    <div class="dash-section-head dash-anim" ${anim()}>
      <span class="dash-section-title">Ce que tu trouves ici</span>
    </div>
    <div class="dash-feat-grid dash-anim" ${anim()}>
      <div class="dash-feat" onclick="setPage('home')">
        <div class="dash-feat-ico">📡</div>
        <div class="dash-feat-t">Streams en direct</div>
        <div class="dash-feat-d">Plusieurs sources par match, switch en un clic</div>
      </div>
      <div class="dash-feat" onclick="setPage('home')">
        <div class="dash-feat-ico">📊</div>
        <div class="dash-feat-t">Compos & stats</div>
        <div class="dash-feat-d">Terrain 2D, notes des joueurs, cartons, blessures</div>
      </div>
      <div class="dash-feat" onclick="setPage('home')">
        <div class="dash-feat-ico">💬</div>
        <div class="dash-feat-t">Chat en direct</div>
        <div class="dash-feat-d">Commente le match avec les autres supporters</div>
      </div>
      <div class="dash-feat" onclick="setPage('schedule')">
        <div class="dash-feat-ico">📺</div>
        <div class="dash-feat-t">Chaînes TV</div>
        <div class="dash-feat-d">beIN, Canal+, RMC Sport, Eurosport et plus</div>
      </div>
    </div>

    <!-- APP ANDROID — teaser "en cours de développement" -->
    <div class="dash-app-card dash-anim" ${anim()}>
      <div class="dash-app-glow"></div>
      <div class="dash-app-badge">Bientôt</div>
      <div class="dash-app-row">
        <div class="dash-app-ico">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.14-.52.38.38 0 0 0-.52.14l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.52-.14.38.38 0 0 0-.14.52L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 7 15.25zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25z"/></svg>
        </div>
        <div class="dash-app-txt">
          <div class="dash-app-t">Application Android</div>
          <div class="dash-app-d">En cours de développement — bientôt disponible en téléchargement direct</div>
        </div>
      </div>
      <div class="dash-app-progress"><div class="dash-app-progress-fill"></div></div>
      <div class="dash-app-hint">En attendant, ajoute le site à ton écran d'accueil depuis le menu de ton navigateur</div>
    </div>

    <!-- ACTUALITÉS FOOT -->
    <div class="dash-section-head dash-anim" ${anim()}>
      <span class="dash-section-title">Actualités</span>
      <span class="dash-section-sub" id="dash-news-count"></span>
    </div>
    <div class="dash-news-list dash-anim" id="dash-news-list" ${anim()}>
      ${newsLoaded?renderNewsList():'<div class="dash-news-loading"><div class="spinner"></div></div>'}
    </div>

    <!-- SOUTENIR -->
    <a class="dash-support-card dash-anim" ${anim()} href="https://www.paypal.com/ncp/payment/ENMYKYCAFGHFE" target="_blank" rel="noopener">
      <div class="dash-sup-icon">
        <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </div>
      <div class="dash-tg-text">
        <div class="dash-sup-title">Soutenir Okin Stream</div>
        <div class="dash-tg-sub">Un café pour garder le site en vie ☕</div>
      </div>
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" class="dash-tg-arrow"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </a>

    <!-- ADMIN PANEL CARD — visible uniquement si connecté en tant qu'admin -->
    ${isAdmin() ? `<div class="dash-admin-card dash-anim" ${anim()} onclick="setPage('account');setTimeout(openAdminPanel,150)">
      <div class="dash-admin-card-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5zm-1 5v2h2v-2h-2zm0 4v2h2v-2h-2z"/></svg>
      </div>
      <div class="dash-admin-card-text">
        <div class="dash-admin-card-title">Administration</div>
        <div class="dash-admin-card-sub">Streams · Clés VIP · Chaînes TV</div>
      </div>
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" class="dash-tg-arrow"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </div>` : ''}

    <!-- MANIFESTE -->
    <div class="dash-manifesto-card dash-anim" ${anim()}>
      <div class="dash-manifesto-bg-glow"></div>
      <div class="dash-manifesto-header">
        <div class="dash-manifesto-emoji">✊</div>
        <div>
          <div class="dash-manifesto-label">Notre mission</div>
          <div class="dash-manifesto-title">Le foot est pour tout le monde</div>
        </div>
      </div>
      <div class="dash-manifesto-divider"></div>
      <div class="dash-manifesto-text">
        Canal+, beIN Sports, RMC Sport… regarder le foot coûte souvent <strong>plus de 60€/mois</strong>. C'est une injustice. Le sport en direct devrait être accessible à tous, peu importe les moyens.
        <br><br>
        <strong>Okin Stream, c'est notre réponse.</strong>
      </div>
      <div class="dash-manifesto-tags">
        <span class="dash-manifesto-tag">🆓 100% gratuit</span>
        <span class="dash-manifesto-tag">📺 Streams live</span>
        <span class="dash-manifesto-tag">✊ Pour tous</span>
      </div>
    </div>

    <!-- POURQUOI LA PUB -->
    <div class="dash-ads-card dash-anim" ${anim()}>
      <div class="dash-ads-header">
        <div class="dash-ads-emoji">💡</div>
        <div>
          <div class="dash-ads-label">Transparence</div>
          <div class="dash-ads-title">Pourquoi y a-t-il de la pub ?</div>
        </div>
      </div>
      <div class="dash-manifesto-divider"></div>
      <div class="dash-manifesto-text">
        Okin Stream est <strong>100% gratuit</strong>. Pour maintenir les serveurs, les sources et continuer à vous offrir ce service, nous affichons une courte publicité avant chaque stream.
        <br><br>
        Ce petit geste nous permet de garder le site en vie sans vous demander un centime.
      </div>
    </div>

    <div class="page-footer"><img src="/ball.png" width="20" height="20" style="object-fit:contain;vertical-align:middle;display:inline-block" alt="OS"><div class="pf-links"><span onclick="openLegal('cgu')">CGU</span> · <span onclick="openLegal('privacy')">Confidentialité</span></div><div class="pf-copy">© 2026 Okin Stream · football-data.org</div></div>
  </div>`;
}

// ─── NOUVELLE BANNIÈRE PUB ────────────────────────────
// Une bannière après chaque groupe de 5 cards match (pas d'adsbygoogle)
let _adBannerIdx = 0;

// Bannière publicitaire Propellerads — placeholder gris en attendant l'intégration
function adSlot(){
  if(isVIP()) return '';
  _adBannerIdx++;
  // PROPELLERADS_PLACEHOLDER — remplacer le contenu de ce div par le tag Propellerads
  return `<div class="ad-prop-slot" id="ad-slot-${_adBannerIdx}">
    <span class="ad-prop-label">Publicité</span>
    <div class="ad-prop-inner">
      <!-- PROPELLERADS_TAG -->
    </div>
  </div>`;
}

function closeAdBanner(btn){ btn?.closest('.ad-banner-card')?.remove(); }

// Insère des bannières toutes les N cards dans un tableau de matchs groupés
function injectAdBanners(html, cardCount){
  // Appelé au niveau des groupes de matchs — pas utilisé directement
  return html;
}

function renderHome(){
  const sel=selectedDate||todayKey();
  let mAll=data.byDate[sel]||[];
  if(lgFilter!=='all')mAll=mAll.filter(m=>m._cid===lgFilter);
  const live=mAll.filter(isLive),up=mAll.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED'),fin=mAll.filter(isFin);
  const feat=live[0]||(sel===todayKey()?up[0]:null)||null;
  const liveRest=feat&&isLive(feat)?live.slice(1):live,upRest=feat&&up.includes(feat)?up.slice(1):up;
  const upEntries=Object.entries(groupByComp(upRest));
  const finEntries=Object.entries(groupByComp(fin));

  // Reset bannière index pour cohérence à chaque render
  _adBannerIdx = 0;

  // Construire les sections en injectant une bannière toutes les 5 cards
  let cardCount = feat ? 1 : 0;
  let sections = '';

  if(liveRest.length){
    sections += `<div class="sec-head"><span class="sec-title"><span class="dot-red">●</span> EN DIRECT (${live.length})</span></div>`;
    liveRest.forEach((m,i)=>{
      sections += mCard(m);
      cardCount++;
      if(cardCount % 5 === 0) sections += '</div>' + adSlot() + '<div class="mlist">';
    });
    sections = `<div class="mlist">${sections}</div><div class="gap"></div>`;
  }

  upEntries.forEach(([c,ms])=>{
    sections += `<div class="sec-head"><span class="sec-title">${c}</span><span class="sec-sub">${ms.length} match${ms.length>1?'s':''}</span></div><div class="mlist">`;
    ms.forEach(m=>{
      sections += mCard(m);
      cardCount++;
      if(cardCount % 5 === 0){ sections += '</div>' + adSlot() + '<div class="mlist">'; }
    });
    sections += '</div><div class="gap"></div>';
  });

  finEntries.forEach(([c,ms])=>{
    sections += `<div class="sec-head"><span class="sec-title">${c}</span><span class="badge-ft">FT</span></div><div class="mlist">`;
    ms.forEach(m=>{
      sections += mCard(m);
      cardCount++;
      if(cardCount % 5 === 0){ sections += '</div>' + adSlot() + '<div class="mlist">'; }
    });
    sections += '</div><div class="gap"></div>';
  });

  return`
  ${datePicker()}${compFilter()}
  ${renderTVBar()}
  ${feat?featCard(feat):''}
  ${sections}
  ${!live.length&&!up.length&&!fin.length?`<div class="empty">Aucun match ce jour</div>`:''}
  <div class="page-footer"><img src="/ball.png" width="20" height="20" style="object-fit:contain;vertical-align:middle;display:inline-block" alt="OS"><div class="pf-links"><span onclick="openLegal('cgu')">CGU</span> · <span onclick="openLegal('privacy')">Confidentialité</span></div><div class="pf-copy">© 2026 Okin Stream · football-data.org</div></div>`;
}
function renderSchedule(){
  const dates=Object.keys(data.byDate).sort();
  if(!dates.length)return`<div class="empty">Aucun match</div>`;
  _adBannerIdx = 0;
  let totalCards = 0;
  const html=dates.map(dk=>{
    const ms=data.byDate[dk]||[];
    if(!ms.length)return'';
    let dayHtml = `<div class="day-header"><span class="day-title">${fmtDayLabel(dk)}</span><span class="day-full">${fmtDayFull(dk)}</span>${dk===todayKey()?'<span class="day-dot"></span>':''}</div>`;
    Object.entries(groupByComp(ms)).forEach(([c,ms2])=>{
      dayHtml += `<div class="sec-head"><span class="sec-title" style="font-size:13px">${c}</span><span class="sec-sub">${ms2.length} match${ms2.length>1?'s':''}</span></div><div class="mlist">`;
      ms2.forEach(m=>{
        dayHtml += mCard(m);
        totalCards++;
        if(totalCards % 5 === 0){ dayHtml += '</div>' + adSlot() + '<div class="mlist">'; }
      });
      dayHtml += '</div>';
    });
    dayHtml += '<div class="gap"></div>';
    return dayHtml;
  }).join('');
  return html+'<div class="page-footer"><img src="/ball.png" width="20" height="20" style="object-fit:contain;vertical-align:middle;display:inline-block" alt="OS"><div class="pf-links"><span onclick="openLegal(\'cgu\')">CGU</span> · <span onclick="openLegal(\'privacy\')">Confidentialité</span></div><div class="pf-copy">© 2026 Okin Stream · football-data.org</div></div>';
}
function renderFavs(){
  const all=Object.values(data.byDate).flat(),favs=all.filter(m=>favorites.has(m.id));
  const empty=`<div class="fav-empty">
    <div class="fav-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
    <div class="fav-empty-title">Aucun favori</div>
    <div class="fav-empty-sub">Appuie sur le cœur d'un match pour le sauvegarder ici</div>
  </div>`;
  return`<div class="sec-head" style="margin-top:4px"><span class="sec-title">Mes matchs</span><span class="sec-sub">${favs.length} sauvegardé${favs.length!==1?'s':''}</span></div>${favs.length?`<div class="mlist">${favs.map(mCard).join('')}</div>`:empty}<div class="gap"></div>`;
}
function renderSearch(){
  // Squelette avec input seulement — résultats mis à jour séparément sans toucher au DOM de l'input
  return`<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16" style="color:var(--t3);flex-shrink:0"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="search-input" placeholder="Équipe, compétition..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div><div id="search-results"></div><div class="gap"></div>`;
}
function updateSearchResults(){
  const q=sq.toLowerCase().trim(),all=Object.values(data.byDate).flat();
  const res=q?all.filter(m=>(m.homeTeam.name||''). toLowerCase().includes(q)||(m.awayTeam.name||''). toLowerCase().includes(q)||(m._cname||''). toLowerCase().includes(q)):all.slice(0,50);
  const el=document.getElementById('search-results');
  if(!el)return;
  el.innerHTML=res.length?`<div class="mlist">${res.map(mCard).join('')}</div>`:`<div class="empty">Aucun résultat</div>`;
  bindSearchEvents(el);
}

// ─── CARDS ───────────────────────────────────────────
function featCard(m){
  const live=isLive(m),fin=isFin(m),min=getMin(m),fav=favorites.has(m.id);
  const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;
  return`<div class="featured" data-mid="${m.id}">
    <div class="feat-glow"></div>
    <div class="feat-top">
      <div class="feat-meta">
        <span class="feat-league"><img src="${m._cflag}" onerror="this.style.display='none'" alt="">${m._cname}</span>
        ${live?`<div class="live-pill"><div class="live-dot"></div><span class="live-lbl">EN DIRECT</span></div>`:fin?`<span class="feat-ft">TERMINÉ</span>`:`<span class="feat-time">${fmtTime(m.utcDate)}</span>`}
      </div>
      <div class="feat-match">
        <div class="feat-team">${crestImg(m.homeTeam.crest,hn,'crest-lg',m.homeTeam)}<div class="feat-name">${hn}</div></div>
        <div class="feat-center"><div class="feat-score">${live||fin?getScore(m):'-'}</div>${(function(){
          // Sous le score : uniquement le chrono. Le statut "EN DIRECT" est
          // déjà affiché en pastille au-dessus, inutile de le répéter ici.
          if(!live) return '';
          const c = liveClock(m);
          return (c && /\d/.test(c)) ? `<div class="feat-min" data-clock="${m.id}">${c}</div>` : '';
        })()}</div>
        <div class="feat-team">${crestImg(m.awayTeam.crest,an,'crest-lg',m.awayTeam)}<div class="feat-name">${an}</div></div>
      </div>
    </div>
    <div class="feat-foot">
      <button class="f-btn ghost fav-feat${fav?' on':''}" data-fid="${m.id}"><svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="15" height="15" style="flex-shrink:0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${fav?'Sauvegardé':'Sauvegarder'}</span></button>
      ${live||getStreamUrl(m)?`<button class="f-btn primary" data-watch="${m.id}">▶ Regarder</button>`:`<button class="f-btn ghost" data-watch="${m.id}">Ouvrir</button>`}
    </div>
  </div>`;
}
function mCard(m){
  const live=isLive(m),fin=isFin(m),min=getMin(m),fav=favorites.has(m.id);
  const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;
  const homeId=m.homeTeam?.id, awayId=m.awayTeam?.id;
  const notifHome = homeId && goalNotifTeams.has(homeId);
  const notifAway = awayId && goalNotifTeams.has(awayId);
  let stat,sc,time;
  if(live){
    stat=`<span class="mc-status live"><span class="mc-ld"></span>LIVE</span>`;
    sc='live';
    // Chrono à la seconde, rafraîchi par startClockTicker() via data-clock
    // On n'affiche le chrono que s'il existe vraiment. Avant, on retombait sur
    // "LIVE" en secours, ce qui répétait trois fois l'info sur la même carte
    // (badge du haut + pied de carte + bouton).
    const clk = liveClock(m);
    const hasClock = clk && /\d/.test(clk);
    time = hasClock
      ? `<span class="mc-time mc-time-live"><span class="mc-clock" data-clock="${m.id}">${clk}</span></span>`
      : `<span class="mc-time"></span>`;
  }
  else if(fin){stat=`<span class="mc-status ft">Terminé</span>`;sc='ft';time=`<span class="mc-time">${fmtTime(m.utcDate)}</span>`;}
  else{stat=`<span class="mc-status soon">${fmtTime(m.utcDate)}</span>`;sc='soon';time=`<span class="mc-time">À venir</span>`;}
  // Boutons de notification buts (uniquement si match en cours ou à venir)
  const notifBtns = !fin ? `
    <button class="goal-notif-btn${notifHome?' on':''}" data-notif-team="${homeId}" onclick="toggleGoalNotif(${homeId},'${hn.replace(/'/g,"\\'")}',event)" title="${notifHome?'Désactiver alertes buts':'Activer alertes buts'} — ${hn}">
      <svg viewBox="0 0 24 24" fill="${notifHome?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>${notifHome?'':'<line x1="4" y1="4" x2="20" y2="20"/>'}</svg>
    </button>` : '';
  return`<div class="mcard" data-mid="${m.id}">
    <div class="mc-head"><span class="mc-league"><img src="${m._cflag}" onerror="this.style.display='none'" alt="">${m._cname}</span>${stat}</div>
    <div class="mc-body">
      <div class="mct">${crestImg(m.homeTeam.crest,hn,'crest-md',m.homeTeam)}<div class="mct-name">${hn}</div></div>
      <div class="mc-score ${sc}">${live||fin?getScore(m):'vs'}</div>
      <div class="mct r"><div class="mct-name">${an}</div>${crestImg(m.awayTeam.crest,an,'crest-md',m.awayTeam)}</div>
    </div>
    <div class="mc-foot">${time}<div class="mc-act">
      ${notifBtns}
      <button class="fav-btn${fav?' on':''}" data-fid="${m.id}"><svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      <button class="watch-btn${(getStreamUrl(m))?' has-stream':''}" data-watch="${m.id}">${getStreamUrl(m)?(live?'▶ Regarder':fin?'▶ Résumé':'▶ Stream'):'—'}</button>
    </div></div>
  </div>`;
}

// ─── BIND ────────────────────────────────────────────
function bindSearchEvents(root){
  // Bind events sur les cards de résultats sans toucher au reste du DOM
  const byId={};for(const m of Object.values(data.byDate).flat())byId[String(m.id)]=m;
  root.querySelectorAll('[data-mid]').forEach(e=>e.addEventListener('click',ev=>{if(ev.target.closest('[data-fid],[data-watch],[data-team]'))return;const m=byId[e.dataset.mid];if(m)openSingle(m);}));
  root.querySelectorAll('[data-watch]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();const m=byId[e.dataset.watch];if(m)openSingle(m);}));
  root.querySelectorAll('[data-fid]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();toggleFav(e.dataset.fid);}));
  root.querySelectorAll('[data-team]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();try{const t=JSON.parse(e.dataset.team.replace(/&#39;/g,"'"));const card=e.closest('[data-mid]');const m=card?byId[card.dataset.mid]:null;openClub(t,m?._cid||null);}catch(err){}}));
}
function bindEvents(){
  const byId={};for(const m of Object.values(data.byDate).flat())byId[String(m.id)]=m;
  document.querySelectorAll('[data-mid]').forEach(e=>e.addEventListener('click',ev=>{if(ev.target.closest('[data-fid],[data-watch],[data-team]'))return;const m=byId[e.dataset.mid];if(m)openSingle(m);}));
  document.querySelectorAll('[data-watch]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();const m=byId[e.dataset.watch];if(m)openSingle(m);}));
  document.querySelectorAll('[data-fid]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();toggleFav(e.dataset.fid);}));
  document.querySelectorAll('[data-team]').forEach(e=>e.addEventListener('click',ev=>{ev.stopPropagation();try{const t=JSON.parse(e.dataset.team.replace(/&#39;/g,"'"));const card=e.closest('[data-mid]');const m=card?byId[card.dataset.mid]:null;openClub(t,m?._cid||null);}catch(err){}}));
  const si=$('search-input');if(si){si.value=sq;si.addEventListener('input',e=>{sq=e.target.value;updateSearchResults();});si.focus();}
}
function toggleFav(rawId){ haptic(6);
  const id=isNaN(+rawId)?rawId:+rawId;
  if(favorites.has(id)){favorites.delete(id);toast('Retiré');}else{favorites.add(id);toast('Sauvegardé');}
  localStorage.setItem('favs',JSON.stringify([...favorites]));
  document.querySelectorAll(`[data-fid="${rawId}"]`).forEach(e=>{const on=favorites.has(id);e.classList.toggle('on',on);const svg=e.querySelector('svg');if(svg)svg.setAttribute('fill',on?'currentColor':'none');const span=e.querySelector('span');if(span)span.textContent=on?'Sauvegardé':'Sauvegarder';});
  if(pl.match&&String(pl.match.id)===String(rawId))syncFavBtn();
}

// ═══════════════════════════════════════════════════════
// ─── LECTEUR SINGLE ──────────────────────────────────
// ═══════════════════════════════════════════════════════
const pl={playing:false,muted:false,fs:false,timer:null,hideTimer:null,dragging:false,hasStream:false,match:null,srcIdx:0,sources:[],ctrlsVisible:false};

function plShow(){
  clearTimeout(pl.hideTimer);
  $('vp-ctrls')?.classList.remove('hidden');
  $('vp-hud')?.classList.remove('hide');
  $('vp-close')?.classList.remove('hidden');
  pl.ctrlsVisible = true;
  if(pl.playing) pl.hideTimer = setTimeout(plHide, 3500);
}
function plHide(){
  $('vp-ctrls')?.classList.add('hidden');
  $('vp-hud')?.classList.add('hide');
  $('vp-close')?.classList.add('hidden');
  pl.ctrlsVisible = false;
}
function plSetPlay(v){
  pl.playing=v;
  $('ico-pause').style.display=v?'':'none';$('ico-play').style.display=v?'none':'';
  const f=$('vp-flash'),i=$('vp-flash-ico');
  if(f&&i){i.innerHTML=v?'<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>':'<path d="M8 5v14l11-7z"/>';f.classList.remove('pop');void f.offsetWidth;f.classList.add('pop');}
  if(v)pl.hideTimer=setTimeout(plHide,3500);else{clearTimeout(pl.hideTimer);plShow();}
}
function plToggle(){if(!pl.hasStream)return;const v=$('main-vid');if(pl.playing)v.pause();else v.play().catch(()=>{});}
function plMute(m){pl.muted=m;const v=$('main-vid');if(v)v.muted=m;$('ico-vol').style.display=m?'none':'';$('ico-mute').style.display=m?'':'none';}
function setProg(pct){$('vp-fill').style.width=pct+'%';$('vp-dot').style.left=pct+'%';}
function syncFavBtn(){if(!pl.match)return;const on=favorites.has(pl.match.id);$('ico-fav-out').style.display=on?'none':'';$('ico-fav-in').style.display=on?'':'none';tx('fav-label',on?'Sauvegardé':'Sauvegarder');$('mi-fav')?.classList.toggle('on',on);}

function initDrag(){
  const prog=$('vp-prog'),track=$('vp-track'),fill=$('vp-fill'),vid=$('main-vid');
  if(!prog||!track||!fill)return;
  const pct=x=>{const r=track.getBoundingClientRect();return Math.min(1,Math.max(0,(x-r.left)/r.width));};
  const apply=p=>{fill.classList.add('snap');setProg(p*100);if(vid?.duration)vid.currentTime=p*vid.duration;};
  prog.addEventListener('pointerdown',e=>{pl.dragging=true;prog.setPointerCapture(e.pointerId);prog.classList.add('drag');apply(pct(e.clientX));plShow();});
  prog.addEventListener('pointermove',e=>{if(pl.dragging)apply(pct(e.clientX));});
  prog.addEventListener('pointerup',e=>{pl.dragging=false;prog.classList.remove('drag');fill.classList.remove('snap');apply(pct(e.clientX));});
}

// ─── LECTEUR — fonctions stream ──────────────────────
let hlsPlayer=null, mpegtsPlayer=null;

function destroyPlayers(){
  if(hlsPlayer){try{hlsPlayer.destroy();}catch(e){}hlsPlayer=null;}
  if(mpegtsPlayer){try{mpegtsPlayer.unload();mpegtsPlayer.detachMediaElement();mpegtsPlayer.destroy();}catch(e){}mpegtsPlayer=null;}
}

function proxyUrl(url){
  if(!url) return url;
  // URL relative = déjà servie par NOUS (ex. /api/fls/play/xxx.m3u8, qui gère
  // lui-même la résolution et le relais). La repasser dans /proxy créerait
  // une boucle serveur→serveur absurde.
  if(url.startsWith('/')) return url;
  // dlive.sx (et YouTube) ne doivent JAMAIS être proxifiés : ce sont des
  // iframes embed, le proxy/relay n'a aucun sens dessus et gaspillerait de
  // la bande passante serveur pour rien.
  try{
    const h = new URL(url, location.origin).hostname;
    if(h === location.hostname) return url;
    if(h.endsWith('dlive.sx') || h.endsWith('youtube.com') || h.endsWith('youtu.be')) return url;
  }catch(e){}
  const isLocal = location.hostname==='localhost' || location.hostname.endsWith('.trycloudflare.com');
  const isHttp = url.startsWith('http://');

  if(isLocal){
    // En local : proxy complet (cloudflared bloque le mixed content)
    return location.origin+'/proxy?url='+encodeURIComponent(url);
  }

  if(isHttp){
    // Sur VPS HTTPS : redirection légère via /relay
    // Le serveur répond juste 302 → le navigateur se connecte DIRECTEMENT à la source
    // Zéro bande passante consommée sur le serveur
    return location.origin+'/relay?url='+encodeURIComponent(url);
  }

  // HTTPS → connexion directe, pas besoin du serveur
  return url;
}

function isEmbedUrl(url){
  if(!url)return false;
  const u=url.toLowerCase();
  if(u.includes('.m3u8'))return false;
  if(u.includes('.ts'))return false;
  if(u.includes('extension=ts'))return false;
  if(/:8080\/|:8000\/|:1935\//.test(u))return false;
  return true;
}

function tryHls(vid,url){
  if(typeof Hls!=='undefined'&&Hls.isSupported()){
    hlsPlayer=new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 4,          // 4s de back buffer (était 30 — inutile en live)
      maxBufferLength: 8,           // 8s max en avant
      maxMaxBufferLength: 12,
      liveSyncDurationCount: 2,     // colle au live après 2 segments
      liveMaxLatencyDurationCount: 4,
      liveDurationInfinity: true,
    });
    hlsPlayer.loadSource(url);hlsPlayer.attachMedia(vid);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED,()=>{
      vid.muted=true;
      vid.play().then(()=>{
        plSetPlay(true);
        // Unmute après démarrage réussi
        setTimeout(()=>{
          if(!pl.muted){vid.muted=false;vid.volume=1;plMute(false);}
        },300);
      }).catch(()=>{});
    });
    hlsPlayer.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal){destroyPlayers();vid.src=url;vid.play().catch(()=>{});}});
  } else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.muted=true;
    vid.src=url;
    vid.play().then(()=>{
      plSetPlay(true);
      setTimeout(()=>{if(!pl.muted){vid.muted=false;vid.volume=1;plMute(false);}},300);
    }).catch(()=>{});
  } else {vid.src=url;vid.play().catch(()=>{});}
}

function loadStream(vid,url){
  destroyPlayers();if(!url){vid.src='';plSetPlay(false);return;}
  const proxied=proxyUrl(url);
  const u=url.toLowerCase();
  const isTsStream=!u.includes('.m3u8')&&!u.includes('manifest')&&(u.includes(':8080')||u.includes(':8000')||u.includes(':1935')||u.includes('extension=ts'));
  if(isTsStream&&typeof mpegts!=='undefined'&&mpegts.isSupported()){
    mpegtsPlayer=mpegts.createPlayer({
      type: 'mse',
      url: proxied,
      isLive: true,
      enableWorker: true,
      // Latence réduite au minimum
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 3,     // max 3s de retard (était 8)
      liveBufferLatencyMinRemain: 0.5,    // recommencer à chasser dès 0.5s (était 2)
      // Buffers mémoire réduits pour éviter accumulation
      lazyLoad: false,
      lazyLoadMaxDuration: 0,
      deferLoadAfterSourceOpen: false,
      fixAudioTimestampGap: true,
    });
    mpegtsPlayer.attachMediaElement(vid);mpegtsPlayer.load();
    vid.muted=true;
    mpegtsPlayer.play().then(()=>{
      plSetPlay(true);
      setTimeout(()=>{if(!pl.muted){vid.muted=false;vid.volume=1;plMute(false);}},400);
    }).catch(()=>{destroyPlayers();tryHls(vid,proxied);});
    mpegtsPlayer.on(mpegts.Events.ERROR,(et,ed)=>{if(ed?.fatal){destroyPlayers();tryHls(vid,proxied);}});
  } else {tryHls(vid,proxied);}
}

function switchSource(idx){
  if(!pl.match||!pl.sources[idx])return;
  // Barrière côté lecteur : même si quelqu'un force l'appel depuis la console,
  // une source VIP ne se lance pas sans abonnement actif.
  if(pl.sources[idx].vipOnly && !isVIP()){ vipSourcePrompt(); return; }
  // Source FLS : le lien réel est résolu à la demande côté serveur (quota
  // RapidAPI). On vérifie avant de lancer le lecteur pour pouvoir expliquer
  // l'échec au lieu d'afficher un écran noir.
  if(pl.sources[idx].fls){
    toast('📡 Connexion à la source…');
    flsPreflight(pl.sources[idx]).then(ok => { if(ok) switchSourceNow(idx); });
    return;
  }
  switchSourceNow(idx);
}

function switchSourceNow(idx){
  if(!pl.match||!pl.sources[idx])return;
  pl.srcIdx=idx;
  const src=pl.sources[idx];
  // Update active in streams
  const id=String(pl.match.id);
  if(streams[id]?.sources){streams[id].activeIdx=idx;try{localStorage.setItem('okin_streams',JSON.stringify(streams));}catch(e){}}
  if(db&&streams[id])db.ref(`streams/${id}/activeIdx`).set(idx).catch(()=>{});
  toast(`📡 ${src.label}`);
  loadStream($('main-vid'),src.url);
  renderSourceSwitcher();
}

function renderSourceSwitcher(){
  const el=document.getElementById('vp-sources');
  if(!el)return;
  if(pl.sources.length<=1){el.style.display='none';el.innerHTML='';return;}
  el.style.display='flex';
  // Tri : sources VIP en tête (meilleure qualité), puis par confiance
  // décroissante. Les sources sans "confidence" (ajoutées à la main par
  // l'admin) sont considérées fiables à 100%.
  const order = pl.sources.map((s,i)=>({s,i}))
    .sort((a,b)=> (b.s.vipOnly?1:0)-(a.s.vipOnly?1:0) || (b.s.confidence??1)-(a.s.confidence??1));
  const userIsVip = isVIP();
  el.innerHTML=order.map(({s,i})=>{
    const isDlive = !!s.dlive;
    const isFls = !!s.fls;
    const pct = s.confidence!=null ? Math.round(s.confidence*100) : null;
    const locked = s.vipOnly && !userIsVip;
    return `
    <button class="vp-src-btn${i===pl.srcIdx?' active':''}${s.vipOnly?' vp-src-vip':''}${locked?' vp-src-locked':''}"
            onclick="${locked?'vipSourcePrompt()':'switchSource('+i+')'}">
      ${s.vipOnly
        ? `<span class="vp-src-badge">${locked?'🔒':'★'}</span>`
        : `<span class="vp-src-num">${i+1}</span>`}
      <span class="vp-src-name">${isDlive?'🔗 ':isFls?'📡 ':''}${escHtml(s.label||('Source '+(i+1)))}</span>
      ${s.vipOnly?'<span class="vp-src-q">HD</span>':''}
      ${!s.vipOnly&&pct!=null&&pct<100?`<span class="vp-src-conf">${pct}%</span>`:''}
    </button>`;
  }).join('');
}

// Clic sur une source VIP verrouillée
function vipSourcePrompt(){
  toast('🔒 Source haute qualité réservée aux VIP');
  setTimeout(()=>{ try{ openVIP(); }catch(e){} }, 700);
}

// Choisit l'index de démarrage : la meilleure source autorisée pour cet
// utilisateur. Un non-VIP ne doit jamais démarrer sur une source verrouillée.
function bestAllowedSourceIdx(sources){
  if(!sources || !sources.length) return 0;
  const vip = isVIP();
  const ranked = sources.map((s,i)=>({s,i}))
    .filter(({s}) => vip || !s.vipOnly)
    .sort((a,b)=> (b.s.vipOnly?1:0)-(a.s.vipOnly?1:0) || (b.s.confidence??1)-(a.s.confidence??1));
  return ranked.length ? ranked[0].i : 0;
}


function openSingle(m, skipGate){ haptic(8);
  if(!skipGate && !isVIP()){
    const sid=String(m.id);
    const stored=streams[sid];
    const hasStream=stored?.url||stored?.sources?.length||m.streamUrl;
    if(hasStream){ showAdGate(m); return; }
  }
  const sid=String(m.id);
  // Résoudre les sources depuis streams en priorité
  const stored=streams[sid];
  if(stored?.sources?.length){
    m.streamSources=stored.sources;
    m.streamActiveIdx=stored.activeIdx||0;
    m.streamUrl=stored.sources[m.streamActiveIdx]?.url||null;
  } else if(stored?.url){
    m.streamSources=[{url:stored.url,label:stored.label||'Source 1'}];
    m.streamActiveIdx=0;
    m.streamUrl=stored.url;
  }
  // Fallback sur m.streamUrl déjà injecté par applyStreams
  if(!m.streamUrl && m.streamSources?.length){
    m.streamUrl=m.streamSources[0].url;
  }
  // Le fournisseur FLS vient de refuser ce flux (quota, 404…) : on écarte ses
  // sources pour cette ouverture, sinon on relancerait le lecteur sur une URL
  // dont on sait déjà qu'elle ne répondra pas.
  if(m._flsDead && Date.now()-m._flsDead < 5*60000 && m.streamSources?.length){
    const alt=m.streamSources.findIndex(s=>!s.fls);
    m.streamActiveIdx = alt>=0 ? alt : 0;
    m.streamUrl = alt>=0 ? m.streamSources[alt].url : null;
  }
  // Source FLS en position de départ : son URL réelle est résolue à la
  // demande côté serveur (quota RapidAPI). On la valide AVANT d'ouvrir le
  // lecteur, et on bascule automatiquement sur une autre source si le
  // fournisseur ne répond pas.
  const _flsSel = m.streamSources && m.streamSources[m.streamActiveIdx||0];
  const _flsGiveUp = m._flsDead && Date.now() - m._flsDead < 5*60000;
  if(_flsSel && _flsSel.fls && !m._flsChecking && !_flsGiveUp){
    m._flsChecking = true;
    toast('\u{1F4E1} Connexion \u00e0 la source\u2026');
    flsPreflight(_flsSel).then(ok => {
      m._flsChecking = false;
      if(ok){ m._flsDead = 0; openSingle(m, true); return; }
      const alt = (m.streamSources||[]).findIndex(s => !s.fls);
      if(alt >= 0){
        m.streamActiveIdx = alt;
        m.streamUrl = m.streamSources[alt].url;
        openSingle(m, true);
        return;
      }
      // Aucune autre source : on ouvre quand m\u00eame le lecteur sur l'\u00e9cran
      // \u00ab pas de flux disponible \u00bb \u2014 un clic sans le moindre effet donne
      // l'impression que l'app est cass\u00e9e.
      m._flsDead = Date.now();
      m.streamUrl = null;
      openSingle(m, true);
    });
    return;
  }
  if(multiOpen){
    // Si multi est ouvert, proposer d'ajouter à la grille plutôt
    if(slots.length<4&&!slots.find(s=>s.match.id===m.id)){
      addToMulti(m);return;
    }
  }
  pl.match=m;
  pl.sources=m.streamSources||[];
  // On ne démarre jamais un non-VIP sur une source verrouillée
  pl.srcIdx = m.streamActiveIdx||0;
  if(pl.sources && pl.sources[pl.srcIdx] && pl.sources[pl.srcIdx].vipOnly && !isVIP()){
    pl.srcIdx = bestAllowedSourceIdx(pl.sources);
  }
  const live=isLive(m),fin=isFin(m),min=getMin(m);
  const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;
  setCrest('hud-c1',m.homeTeam.crest,hn);setCrest('hud-c2',m.awayTeam.crest,an);
  setCrest('fb-c1',m.homeTeam.crest,hn);setCrest('fb-c2',m.awayTeam.crest,an);
  tx('hud-n1',hn);tx('hud-n2',an);tx('fb-home',hn);tx('fb-away',an);
  const sc = m._isTV ? '' : getScore(m);
  const minTxt = m._isTV ? '● LIVE' : (min||(fin?'FT':live?'LIVE':fmtTime(m.utcDate)));
  tx('hud-sc',sc); tx('hud-min',minTxt); tx('fb-score', m._isTV ? m._tvName : sc); tx('fb-min',minTxt);
  tx('mi-league',m._cname);tx('mi-title',`${hn} — ${an}`);
  tx('mi-sub',live?'En direct':fin?'Terminé':'Coup d\'envoi '+fmtTime(m.utcDate));
  syncFavBtn();

  // YouTube résumé — visible seulement pour les matchs terminés
  const ytSec=$('yt-section');
  if(ytSec){
    const ytRes=$('yt-results');
    const ytLoad=$('yt-loading');
    if(ytRes) ytRes.innerHTML='';
    if(ytLoad) ytLoad.style.display='none';
    if(fin){
      ytSec.style.display='';
      ytRes.innerHTML=`<div class="yt-resume-wrap">
        <button class="yt-resume-btn" id="yt-resume-trigger">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          Résumé du match
        </button>
      </div>`;
      document.getElementById('yt-resume-trigger').addEventListener('click', () => {
        fetchYTResume(m);
      });
    } else {
      ytSec.style.display='none';
    }
  }

  const goals=(m.goals_detail||[]).filter(e=>e.type==='Goal');
  $('modal-evs').innerHTML=goals.length?`<div class="evs-wrap"><div class="evs-title">Buts</div><div class="ev-list">${goals.map(g=>`<div class="ev-row"><span class="ev-min">${g.time?.elapsed??g.minute}'</span><div class="ev-dot"></div><div><div class="ev-text">${g.scorer?.name||g.player?.name||'?'}</div><div class="ev-sub">${g.team?.name||''}</div></div></div>`).join('')}</div></div>`:'';
  const vid=$('main-vid');
  pl.hasStream=!!m.streamUrl;
  const oldIframe=document.getElementById('stream-iframe');
  if(oldIframe)oldIframe.remove();
  const isEmbed=pl.hasStream&&isEmbedUrl(m.streamUrl);
  if(pl.hasStream&&isEmbed){
    vid.style.display='none';
    $('vp-fallback').classList.add('hidden');
    const stage=$('vp-stage');
    const iframe=document.createElement('iframe');
    iframe.id='stream-iframe';
    iframe.src=m.streamUrl;
    iframe.allow='autoplay; fullscreen; encrypted-media';
    iframe.allowFullscreen=true;
    iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:none;z-index:1;background:#000';
    stage.appendChild(iframe);
    plSetPlay(true);
  } else {
    vid.style.display='';
    vid.classList.toggle('active',pl.hasStream);
    $('vp-fallback').classList.toggle('hidden',pl.hasStream);
  }
  if(pl.hasStream&&!isEmbed){ loadStream(vid, m.streamUrl); }
  else if(!isEmbed){vid.src='';plSetPlay(false);}
  $('modal').classList.add('open');document.body.style.overflow='hidden';plShow();
  // Onglets Détails/Chat — uniquement pour un match de foot (pas une chaîne TV)
  // déjà commencé (en direct ou terminé). Sinon comportement chat inchangé.
  const showTabs=!m._isTV&&(live||fin);
  const tabsEl=$('stream-tabs');
  if(showTabs){
    tabsEl.style.display='';
    streamTab='details';
    m._seenLuEvents=null;m._statsCache=null;m._playersStatsCache=null;
    resetDetTabs();
    switchStreamTab('details'); // BUG corrigé : sans cet appel synchrone, details-section
                                 // restait display:none tant que le setTimeout(chat) plus bas
                                 // n'avait pas tourné — d'où "rien n'affiche au 1er clic".
    loadDetails(m,false);
  } else if(tabsEl){
    tabsEl.style.display='none';
    $('details-section').style.display='none';
  }
  // Chat dès qu'une source/chaîne est assignée au match (peu importe si live,
  // à venir ou terminé) — disparaît automatiquement dès qu'il n'y a plus de source.
  if(m.streamUrl){
    setTimeout(function(){ chatOpen(m.id); if(showTabs)switchStreamTab(streamTab); }, 80);
  } else {
    chatClose();
  }
  renderSourceSwitcher();
  clearInterval(pl.timer);
  const tlEl=$('vp-tl'),trEl=$('vp-tr'),startMin=m._status?.elapsed||0;let tSec=startMin*60;
  const progEl=$('vp-prog');
  // Badge LIVE + barre jaune si : match en direct OU chaîne TV OU stream disponible
  const showLive = live || m._isTV || !!m.streamUrl;
  if(showLive){
    setProg(100);
    if(tlEl) tlEl.innerHTML='<span class="vp-live-badge"><span class="vp-live-dot"></span>LIVE</span>';
    if(trEl) trEl.textContent='';
    progEl?.classList.add('is-live');
  } else {
    setProg(fin?100:0);
    if(tlEl) tlEl.textContent=fin?'FT':fmtTime(m.utcDate);
    if(trEl) trEl.textContent='';
    progEl?.classList.remove('is-live');
  }
  vid.onplay=()=>plSetPlay(true);vid.onpause=()=>plSetPlay(false);
  vid.ontimeupdate=()=>{if(!pl.dragging&&vid.duration&&!live){setProg(vid.currentTime/vid.duration*100);const cur=Math.floor(vid.currentTime),dur=Math.floor(vid.duration);if(tlEl)tlEl.textContent=fmtSecs(cur);if(trEl)trEl.textContent='-'+fmtSecs(dur-cur);}};
}


// ─── YOUTUBE RÉSUMÉ ──────────────────────────────────
async function fetchYTResume(m){
  const sec=$('yt-section'),load=$('yt-loading'),res=$('yt-results');
  if(!sec||!load||!res)return;

  // Afficher la section
  sec.style.display='';
  load.style.display='flex';
  res.innerHTML='';

  const hn=m.homeTeam.name, an=m.awayTeam.name;
  const date=new Date(m.utcDate);
  const dateStr=date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

  // Mapping compétition → chaînes françaises prioritaires
  const COMP_CHANNELS={
    'La Liga':          ['beIN Sports','beIN SPORTS','bein sport'],
    'Primera Division': ['beIN Sports','beIN SPORTS','bein sport'],
    'Champions League': ['Canal+','canal plus','beIN Sports'],
    'UEFA Champions':   ['Canal+','canal plus','beIN Sports'],
    'Premier League':   ['Canal+','canal plus','beIN Sports'],
    'Ligue 1':          ['Canal+','canal plus','DAZN'],
    'Bundesliga':       ['Canal+','canal plus','beIN Sports'],
    'Serie A':          ['Canal+','canal plus','beIN Sports'],
    'Europa League':    ['Canal+','canal plus','beIN Sports'],
    'Conf. League':     ['Canal+','canal plus'],
  };

  // Trouver les chaînes prioritaires pour cette compétition
  const compKey=Object.keys(COMP_CHANNELS).find(k=>m._cname?.includes(k));
  const channels=compKey?COMP_CHANNELS[compKey]:[];
  const channelQuery=channels.length?` ${channels[0]}`:'';

  // Requête principale : résumé + chaîne prioritaire
  const q=`résumé ${hn} ${an} ${dateStr}${channelQuery}`;
  // Fallback 1 : sans chaîne mais en français
  const qFR=`résumé ${hn} ${an} ${dateStr}`;
  // Fallback 2 : anglais
  const qFallback=`highlights ${hn} ${an} ${date.getFullYear()}`;

  try{
    // Fenêtre de recherche : du jour du match + 7 jours max (résumés publiés rapidement)
    const matchDate=new Date(m.utcDate);
    const publishedAfter=matchDate.toISOString();
// depuis le match
    const publishedBefore=new Date(matchDate.getTime()+7*24*3600*1000).toISOString(); // +7 jours

    // La clé YouTube reste côté serveur — on passe juste les paramètres de recherche
    const mkUrl=(q,lang)=>`${YT_BASE}/search?q=${encodeURIComponent(q)}&maxResults=5${lang?`&relevanceLanguage=${lang}`:''}&publishedAfter=${publishedAfter}&publishedBefore=${publishedBefore}`;

    // Niveau 1 : résumé + chaîne officielle française (ex: "résumé Barca Real beIN Sports")
    let r=await fetch(mkUrl(q,'fr'));
    if(r.status===503){
      // Clé YouTube non configurée côté serveur → fallback lien direct
      load.style.display='none';
      res.innerHTML=`<div class="yt-noapikey">
        <p>Clé API YouTube non configurée.</p>
        <a class="yt-open-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(q)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          Voir sur YouTube
        </a>
      </div>`;
      return;
    }
    let json=await r.json();

    // Niveau 2 : résumé français sans chaîne (si chaîne n'a pas posté ou pas trouvé)
    if(!json.items?.length && channelQuery){
      r=await fetch(mkUrl(qFR,'fr'));
      json=await r.json();
    }

    // Niveau 3 : highlights anglais (dernier recours)
    if(!json.items?.length){
      r=await fetch(mkUrl(qFallback,null));
      json=await r.json();
    }

    load.style.display='none';

    // Aucun résultat dans la fenêtre → résumé pas encore dispo ou trop vieux
    if(!json.items?.length){
      const daysSince=Math.floor((Date.now()-matchDate.getTime())/(1000*3600*24));
      const msg=daysSince>14
        ? `Résumé non disponible`
        : `Résumé pas encore disponible`;
      const subMsg=daysSince>14
        ? `Ce match date de ${daysSince} jours — le résumé n'est plus indexé.`
        : `Revenez dans quelques heures, le résumé sera bientôt en ligne.`;
      res.innerHTML=`<div class="yt-unavailable">
        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style="color:var(--t3)"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        <span class="yt-unavail-title">${msg}</span>
        <span class="yt-unavail-sub">${subMsg}</span>
      </div>`;
      return;
    }

    // Afficher le premier résultat directement en iframe
    const first=json.items[0];
    showYTFrame(first.id.videoId, first.snippet.title);

    // Autres résultats en dessous
    if(json.items.length>1){
      const others=json.items.slice(1);
      const othersHtml=others.map(v=>`
        <div class="yt-thumb" data-vid="${v.id.videoId}">
          <div class="yt-thumb-img" style="background-image:url('${v.snippet.thumbnails.medium?.url||v.snippet.thumbnails.default?.url}')">
            <div class="yt-play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg></div>
          </div>
          <div class="yt-thumb-title">${v.snippet.title}</div>
        </div>`).join('');
      res.insertAdjacentHTML('beforeend',`<div class="yt-others">${othersHtml}</div>`);
      res.querySelectorAll('.yt-thumb').forEach(el=>{
        el.addEventListener('click',()=>{
          const vid=el.dataset.vid,title=el.querySelector('.yt-thumb-title').textContent;
          showYTFrame(vid,title);
          el.scrollIntoView({behavior:'smooth',block:'nearest'});
        });
      });
    }
  }catch(e){
    load.style.display='none';
    res.innerHTML=`<div class="yt-empty">Erreur de chargement</div>`;
  }
}

function showYTFrame(videoId, title){
  const res=$('yt-results');
  if(!res)return;
  const existing=res.querySelector('.yt-iframe-wrap');
  if(existing)existing.remove();

  const wrap=document.createElement('div');
  wrap.className='yt-iframe-wrap';
  const ytUrl=`https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl=`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;

  wrap.innerHTML=`
    <div class="yt-iframe-title">${title}</div>
    <div class="yt-iframe-container" id="yt-frame-${videoId}">
      <iframe
        id="yt-iframe-${videoId}"
        src="${embedUrl}"
        allow="autoplay;encrypted-media;fullscreen"
        allowfullscreen
        frameborder="0"
      ></iframe>
    </div>
    <a class="yt-watch-link" href="${ytUrl}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      Ouvrir sur YouTube
    </a>`;
  res.prepend(wrap);

  // Détecter erreur 153 (vidéo non intégrable) via postMessage de l'iframe
  const iframe=wrap.querySelector('iframe');
  const container=wrap.querySelector('.yt-iframe-container');
  const onMsg=e=>{
    if(typeof e.data==='object'&&e.data?.event==='onError'&&(e.data.info===153||e.data.info===150||e.data.info===101)){
      window.removeEventListener('message',onMsg);
      // Remplacer l'iframe par un placeholder avec bouton
      container.innerHTML=`
        <div class="yt-blocked">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style="color:var(--t3)"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <span>Cette vidéo ne peut pas être lue ici</span>
          <a class="yt-open-btn" href="${ytUrl}" target="_blank" rel="noopener">Voir sur YouTube</a>
        </div>`;
    }
  };
  window.addEventListener('message',onMsg);
  // Aussi détecter via l'API YouTube iframe si disponible (erreur de chargement)
  iframe.addEventListener('load',()=>{
    // Test si l'iframe a chargé normalement — on met un timeout de sécurité
    // Si au bout de 4s on a toujours pas eu de contenu vidéo, pas d'action (impossible à détecter cross-origin)
  });
}

function closeSingle(){
  clearInterval(pl.timer);clearTimeout(pl.hideTimer);
  const tabsEl=$('stream-tabs');if(tabsEl)tabsEl.style.display='none';
  const detSec=$('details-section');if(detSec)detSec.style.display='none';
  closePlayerBio();
  destroyPlayers();
  const v=$('main-vid');if(v){v.pause();v.src='';v.onplay=v.onpause=v.ontimeupdate=null;}
  document.getElementById('stream-iframe')?.remove();
  // Tuer l'iframe YouTube — remplacer le src par '' pour couper le son immédiatement
  const ytIframes=document.querySelectorAll('#yt-results iframe');
  ytIframes.forEach(f=>{ f.src=''; });
  // Vider complètement yt-results pour éviter tout résidu audio
  const ytRes=$('yt-results');
  if(ytRes) ytRes.innerHTML='';
  const ytLoad=$('yt-loading');
  if(ytLoad) ytLoad.style.display='none';
  const ytSec=$('yt-section');
  if(ytSec) ytSec.style.display='none';
  if(pl.fs){ exitFullscreen(); }
  $('modal').classList.remove('open');document.body.style.overflow='';
  chatClose();
  pl.match=null;pl.playing=false;pl.fs=false;pl.hasStream=false;
  $('ico-fs').style.display='';$('ico-xfs').style.display='none';
}

// ─── CAST (Single) ───────────────────────────────────
function tryCast(vid, directUrl){
  if(!vid) vid=$('main-vid');
  // Récupérer l'URL réelle (pas le blob MediaSource de mpegts)
  const streamUrl = directUrl || pl.match?.streamUrl || null;

  // AirPlay Safari — fonctionne sur l'élément vidéo directement
  if(vid.webkitShowPlaybackTargetPicker){
    vid.webkitShowPlaybackTargetPicker();
    return;
  }

  // Remote Playback API (Chromecast sur Android Chrome)
  if(vid.remote){
    if(vid.remote.state !== 'disconnected'){
      vid.remote.prompt().then(()=>{}).catch(()=>toast('Cast annulé'));
      return;
    }
    vid.remote.watchAvailability(available=>{
      if(available) vid.remote.prompt().catch(()=>toast('Cast non disponible'));
      else toast('Aucun appareil Cast trouvé');
    }).catch(()=>{});
    return;
  }

  // Fallback : si on a l'URL, ouvrir dans l'app TV native
  if(streamUrl){
    // Essayer de lancer via intent Android (TV, Kodi, VLC...)
    try{
      const a = document.createElement('a');
      a.href = streamUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      toast('Ouverture du stream externe...');
    }catch(e){ toast('Cast non disponible'); }
    return;
  }

  toast('Cast non disponible sur ce navigateur');
}

$('vp-tap').addEventListener('click',()=>{
  // Lire l'état réel dans le DOM
  const isHidden = $('vp-ctrls')?.classList.contains('hidden');
  if(isHidden){
    plShow();  // 1er tap → afficher barre + boutons
  } else {
    plHide();  // 2e tap → cacher (mode immersif)
  }
});
$('vp-play').addEventListener('click',()=>plToggle());
$('vp-mute').addEventListener('click',()=>plMute(!pl.muted));
$('vp-cast').addEventListener('click',()=>tryCast());
$('vp-add-multi').addEventListener('click',()=>{
  const m=pl.match;if(!m)return;
  closeSingle();
  setTimeout(()=>openMulti(m),60);
});
$('vp-pip').addEventListener('click',()=>{const v=$('main-vid');if(document.pictureInPictureElement)document.exitPictureInPicture().catch(()=>{});else if(v?.requestPictureInPicture)v.requestPictureInPicture().catch(()=>toast('PiP indispo'));else toast('PiP indispo');});
$('vp-fs').addEventListener('click',()=>{
  if(!pl.fs){
    enterFullscreen();
  } else {
    exitFullscreen();
  }
  plShow();
});

function enterFullscreen(){
  pl.fs = true;
  $('ico-fs').style.display='none'; $('ico-xfs').style.display='';
  const modal = $('modal');
  modal.classList.add('vp-fullscreen');
  // requestFullscreen sur le modal → cache la barre du navigateur
  const req = modal.requestFullscreen || modal.webkitRequestFullscreen;
  if(req) req.call(modal).catch(()=>{});
  screen.orientation?.lock?.('landscape').catch(()=>{});
}

function exitFullscreen(){
  pl.fs = false;
  $('ico-fs').style.display=''; $('ico-xfs').style.display='none';
  $('modal').classList.remove('vp-fullscreen');
  screen.orientation?.unlock?.();
  if(document.fullscreenElement || document.webkitFullscreenElement){
    (document.exitFullscreen||document.webkitExitFullscreen)?.call(document)?.catch?.(()=>{});
  }
}

function applyForcedLandscape(){ $('modal').classList.add('vp-fullscreen'); }
function removeForcedLandscape(){ $('modal').classList.remove('vp-fullscreen'); }

function applyForcedLandscape(){
  const modal = $('modal');
  if(!modal) return;
  modal.classList.add('fs-landscape');
}

function removeForcedLandscape(){
  const modal = $('modal');
  if(!modal) return;
  modal.classList.remove('fs-landscape');
  document.body.style.height='';
  document.documentElement.style.height='';
  window.dispatchEvent(new Event('resize'));
}

document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement && pl.fs){
    exitFullscreen();
  }
});
document.addEventListener('webkitfullscreenchange',()=>{
  if(!document.webkitFullscreenElement && pl.fs){
    exitFullscreen();
  }
});
$('vp-close').addEventListener('click',closeSingle);
$('mi-close').addEventListener('click',closeSingle);
// pointermove retiré — conflictait avec vp-tap click sur mobile
$('mi-fav').addEventListener('click',()=>{if(pl.match){toggleFav(pl.match.id);syncFavBtn();}});
$('mi-share').addEventListener('click',()=>{if(navigator.share&&pl.match)navigator.share({title:`${pl.match.homeTeam.name} vs ${pl.match.awayTeam.name}`,url:location.href}).catch(()=>{});else toast('Lien copié');});

let swipeY0=0,swipeStage=false;
$('modal').addEventListener('touchstart',e=>{swipeY0=e.touches[0].clientY;swipeStage=$('vp-stage').contains(e.target);},{passive:true});
$('modal').addEventListener('touchmove',e=>{if(swipeStage&&!pl.dragging&&e.touches[0].clientY-swipeY0>90)closeSingle();},{passive:true});
document.addEventListener('keydown',e=>{
  if($('modal').classList.contains('open')){if(e.key==='Escape')closeSingle();if(e.key===' '){e.preventDefault();plToggle();}if(e.key==='ArrowRight'){const v=$('main-vid');if(v?.duration)v.currentTime=Math.min(v.duration,v.currentTime+10);}if(e.key==='ArrowLeft'){const v=$('main-vid');if(v?.duration)v.currentTime=Math.max(0,v.currentTime-10);}}
  if(multiOpen&&e.key==='Escape')closeMulti();
});

// ═══════════════════════════════════════════════════════
// ─── MULTI-STREAM ─────────────────────────────────────
// ═══════════════════════════════════════════════════════

function openMulti(firstMatch){
  multiOpen=true;slots=[];drawerOpen=false;
  $('multi-ov').classList.add('open');
  document.body.style.overflow='hidden';
  if(firstMatch)addToMulti(firstMatch);
  else renderGrid();
}

function addToMulti(m){
  if(slots.length>=4){toast('Maximum 4 streams');return;}
  if(slots.find(s=>s.match.id===m.id)){toast('Match déjà en grille');return;}
  // Une source FLS doit être résolue avant d'entrer dans la grille, sinon la
  // tuile afficherait un carré noir le temps de l'aller-retour serveur.
  const sel = m.streamSources && m.streamSources[m.streamActiveIdx||0];
  if(sel && sel.fls && !m._flsChecking){
    m._flsChecking = true;
    flsPreflight(sel).then(ok => { m._flsChecking = false; if(ok) addToMulti(m); });
    return;
  }
  slots.push({match:m,muted:false});
  closeDrawer();
  renderGrid();
  toast(`${m.homeTeam.shortName||m.homeTeam.name} ajouté`);
}

function removeSlot(idx){
  destroySlotPlayer(idx);
  const vid=document.querySelector(`#ms-vid-${idx}`);
  if(vid){vid.pause();vid.src='';}
  // Réindexer les players restants
  const newPlayers={};
  slots.forEach((_,i)=>{ if(i<idx && msPlayers[i]) newPlayers[i]=msPlayers[i]; });
  slots.splice(idx,1);
  Object.keys(msPlayers).forEach(k=>{ const ki=parseInt(k); if(ki>idx&&msPlayers[ki]){newPlayers[ki-1]=msPlayers[ki];}});
  Object.keys(msPlayers).forEach(k=>delete msPlayers[k]);
  Object.assign(msPlayers,newPlayers);
  if(!slots.length){closeMulti();return;}
  renderGrid();
}

function toggleSlotMute(idx){
  slots[idx].muted=!slots[idx].muted;
  const vid=document.querySelector(`#ms-vid-${idx}`);
  if(vid)vid.muted=slots[idx].muted;
  const btn=document.querySelector(`#ms-mute-${idx}`);
  if(btn)btn.classList.toggle('muted',slots[idx].muted);
}

function destroySlotPlayer(idx){
  const p = msPlayers[idx];
  if(!p) return;
  try{
    if(p._type==='mpegts'){ p.unload(); p.detachMediaElement(); p.destroy(); }
    else if(p._type==='hls'){ p.destroy(); }
  }catch(e){}
  delete msPlayers[idx];
}

function loadStreamSlot(vid, url, muted, idx){
  destroySlotPlayer(idx);
  if(!url){ vid.src=''; return; }
  const proxied = proxyUrl(url);
  const u = url.toLowerCase();
  vid.muted = muted;
  const isTsStream = !u.includes('.m3u8')&&!u.includes('manifest')&&(u.includes(':8080')||u.includes(':8000')||u.includes(':1935')||u.includes('extension=ts'));
  if(isTsStream && typeof mpegts !== 'undefined' && mpegts.isSupported()){
    const p = mpegts.createPlayer({
      type:'mse', url:proxied, isLive:true, enableWorker:true,
      liveBufferLatencyChasing:true, liveBufferLatencyMaxLatency:3, liveBufferLatencyMinRemain:0.5,
    });
    p._type = 'mpegts';
    p.attachMediaElement(vid);
    p.load();
    p.play().catch(()=>{});
    msPlayers[idx] = p;
  } else if(typeof Hls !== 'undefined' && Hls.isSupported()){
    const h = new Hls({enableWorker:true, lowLatencyMode:true, backBufferLength:4, maxBufferLength:8});
    h._type = 'hls';
    h.loadSource(proxied);
    h.attachMedia(vid);
    h.on(Hls.Events.MANIFEST_PARSED, ()=>{ vid.play().catch(()=>{}); });
    msPlayers[idx] = h;
  } else {
    vid.src = proxied;
    vid.play().catch(()=>{});
  }
}

function renderGrid(){
  const grid=$('multi-grid'),n=slots.length;
  const empty=$('multi-empty');
  if(empty)empty.style.display=n?'none':'flex';

  // Layout classes
  grid.className='multi-grid g'+n;

  // Supprimer ancien contenu slots (garder empty)
  grid.querySelectorAll('.ms-slot').forEach(e=>e.remove());

  slots.forEach((s,i)=>{
    const m=s.match,live=isLive(m),fin=isFin(m),min=getMin(m);
    const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;
    const div=document.createElement('div');
    div.className='ms-slot';div.dataset.idx=i;
    div.innerHTML=`
      <video id="ms-vid-${i}" playsinline preload="none" style="width:100%;height:100%;object-fit:contain;background:#000;${m.streamUrl?'':'display:none'}"></video>
      ${!m.streamUrl?`<div class="ms-fallback"><span class="ms-score">${getScore(m)}</span><span class="ms-teams">${hn} — ${an}</span></div>`:''}
      <div class="ms-hud">
        <span class="ms-hud-teams">${hn} <span class="ms-hud-sc">${getScore(m)}</span> ${an}</span>
        ${live?`<span class="ms-hud-live">${min||'LIVE'}</span>`:fin?`<span class="ms-hud-ft">FT</span>`:''}
      </div>
      <div class="ms-ctrl">
        <button id="ms-mute-${i}" class="ms-btn${s.muted?' muted':''}" title="${s.muted?'Activer le son':'Couper le son'}">
          ${s.muted
            ?`<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`
            :`<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`
          }
        </button>
        <button class="ms-btn" title="Caster">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/></svg>
        </button>
        <button class="ms-btn remove" title="Retirer">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>`;
    grid.appendChild(div);

    // Events
    const btns=div.querySelectorAll('.ms-btn');
    btns[0].addEventListener('click',e=>{e.stopPropagation();toggleSlotMute(i);});
    btns[1].addEventListener('click',e=>{e.stopPropagation();const v=document.querySelector(`#ms-vid-${i}`);tryCast(v);});
    btns[2].addEventListener('click',e=>{e.stopPropagation();removeSlot(i);});

    // Charger vidéo via mpegts/hls selon le type
    if(m.streamUrl){
      setTimeout(()=>{
        const vid=document.querySelector(`#ms-vid-${i}`);
        if(vid) loadStreamSlot(vid, m.streamUrl, s.muted, i);
      }, 50);
    }
  });

  // Dots indicateur en bas
  const dots=$('multi-bar-dots');
  if(dots)dots.innerHTML=slots.map((_,i)=>`<div class="multi-dot"></div>`).join('');
}

// Tiroir "ajouter un match"
function openDrawer(){
  drawerOpen=true;
  $('multi-drawer').classList.add('open');
  renderDrawerContent('matches');
}

function renderDrawerContent(tab){
  const list=$('multi-drawer-list');
  const tabsHtml=`<div class="drawer-tabs">
    <button class="drawer-tab${tab==='matches'?' on':''}" onclick="renderDrawerContent('matches')">Matchs</button>
    <button class="drawer-tab${tab==='channels'?' on':''}" onclick="renderDrawerContent('channels')">Chaînes TV</button>
  </div>`;

  if(tab==='matches'){
    const today=selectedDate||todayKey();
    const allMatches=[
      ...(data.byDate[today]||[]),
      ...Object.entries(data.byDate).filter(([k])=>k!==today).flatMap(([,v])=>v)
    ].filter(m=>!slots.find(s=>s.match.id===m.id));
    if(!allMatches.length){
      list.innerHTML=tabsHtml+`<div style="padding:20px;color:var(--t3);font-size:13px;text-align:center">Tous les matchs sont déjà en grille</div>`;
      return;
    }
    list.innerHTML=tabsHtml+allMatches.map(m=>{
      const live=isLive(m),fin=isFin(m);
      const hn=m.homeTeam.shortName||m.homeTeam.name,an=m.awayTeam.shortName||m.awayTeam.name;
      return`<div class="drawer-item${live?' is-live':''}" data-did="${m.id}">
        <div class="drawer-item-info">
          <span class="drawer-item-comp">${m._cname}</span>
          <span class="drawer-item-match">${hn} <b>vs</b> ${an}</span>
        </div>
        <div class="drawer-item-right">
          ${live?`<span class="drawer-live-dot"></span>`:fin?`<span class="drawer-ft">FT</span>`:`<span class="drawer-time">${fmtTime(m.utcDate)}</span>`}
          ${m.streamUrl?`<span class="drawer-has-stream">●</span>`:''}
        </div>
      </div>`;
    }).join('');
    const byId={};for(const m of allMatches)byId[String(m.id)]=m;
    list.querySelectorAll('[data-did]').forEach(e=>e.addEventListener('click',()=>{const m=byId[e.dataset.did];if(m)addToMulti(m);}));

  } else {
    // Onglet Chaînes TV
    const alreadyIn=new Set(slots.map(s=>s.match.id));
    const cats=[...new Set(ADMIN_CHANNELS.filter(c=>c.url!=='__custom__').map(c=>c.cat))];
    const chHtml=cats.map(cat=>{
      const chs=ADMIN_CHANNELS.filter(c=>c.cat===cat&&c.url!=='__custom__'&&!alreadyIn.has('tv_'+c.name.replace(/\s+/g,'_')));
      if(!chs.length)return'';
      return`<div class="drawer-section-head">${cat}</div>`+chs.map(ch=>`
        <div class="drawer-ch-item"
          data-churl="${escHtml(ch.url)}"
          data-chname="${escHtml(ch.name)}"
          data-chshort="${escHtml(ch.short)}"
          data-chcat="${escHtml(ch.cat)}"
          data-chcolor="${escHtml(ch.color)}">
          <div class="drawer-ch-dot" style="background:${ch.color}"></div>
          <div class="drawer-item-info">
            <span class="drawer-item-comp">${ch.cat}</span>
            <span class="drawer-ch-name">${ch.name}</span>
          </div>
          <span class="drawer-ch-live">● LIVE</span>
        </div>`).join('');
    }).join('');
    list.innerHTML=tabsHtml+(chHtml||`<div style="padding:20px;color:var(--t3);font-size:13px;text-align:center">Toutes les chaînes sont déjà en grille</div>`);
    list.querySelectorAll('[data-churl]').forEach(e=>e.addEventListener('click',()=>{
      const fakeMatch={
        id:'tv_'+e.dataset.chname.replace(/\s+/g,'_'),
        _isTV:true,_tvName:e.dataset.chname,
        _cname:e.dataset.chcat,_cflag:'',
        homeTeam:{name:e.dataset.chname,shortName:e.dataset.chshort,crest:null},
        awayTeam:{name:'',shortName:'',crest:null},
        status:'IN_PLAY',
        streamUrl:e.dataset.churl,
        streamSources:[{url:e.dataset.churl,label:e.dataset.chname}],
        streamActiveIdx:0,
        utcDate:new Date().toISOString(),
        goals:{home:null,away:null},
      };
      addToMulti(fakeMatch);
    }));
  }
}

function closeDrawer(){
  drawerOpen=false;
  $('multi-drawer').classList.remove('open');
}

function closeMulti(){
  slots.forEach((_,i)=>{
    destroySlotPlayer(i);
    const v=document.querySelector(`#ms-vid-${i}`);if(v){v.pause();v.src='';}
  });
  slots=[];multiOpen=false;drawerOpen=false;
  $('multi-ov').classList.remove('open');
  $('multi-drawer').classList.remove('open');
  document.body.style.overflow='';
}

$('multi-close').addEventListener('click',closeMulti);
$('multi-add-btn').addEventListener('click',()=>{if(drawerOpen)closeDrawer();else openDrawer();});
$('multi-drawer-close').addEventListener('click',closeDrawer);



// ─── PAGE COMPTE ─────────────────────────────────────
const ADMIN_CHANNELS = [
  // ── beIN Sports ──────────────────────────────────────
  {name:"beIN Sport 1",    short:"B1",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/53324"},
  {name:"beIN Max 4",      short:"B4",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49620"},
  {name:"beIN Max 5",      short:"B5",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49619"},
  {name:"beIN Max 6",      short:"B6",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49618"},
  {name:"beIN Max 7",      short:"B7",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49617"},
  {name:"beIN Max 8",      short:"B8",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49616"},
  {name:"beIN Max 9",      short:"B9",  color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49615"},
  {name:"beIN Max 10",     short:"B10", color:"#006633", cat:"beIN Sports",  url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49614"},
  // ── Canal+ ───────────────────────────────────────────
  {name:"Canal+ Foot",     short:"CF",  color:"#0055aa", cat:"Canal+",       url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/53295"},
  {name:"Canal+ Sport",    short:"CS",  color:"#0055aa", cat:"Canal+",       url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49208"},
  {name:"Canal+ Sport 360",short:"C36", color:"#0055aa", cat:"Canal+",       url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/54657"},
  {name:"Canal+ Live 1",   short:"CL1", color:"#0066cc", cat:"Canal+",       url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/56553"},
  {name:"Canal+ Live 2",   short:"CL2", color:"#0066cc", cat:"Canal+",       url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/56554"},
  // ── Eurosport ────────────────────────────────────────
  {name:"Eurosport 1",     short:"E1",  color:"#ff6600", cat:"Eurosport",    url:"http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/51644"},
  {name:"Eurosport 2",     short:"E2",  color:"#cc5500", cat:"Eurosport",    url:"http://151.80.18.177:86/Eurosport_2_HD/index.m3u8"},
  // ── RMC Sport ────────────────────────────────────────
  {name:"RMC Sport 1",     short:"R1",  color:"#cc0000", cat:"RMC Sport",    url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=32835&extension=ts"},
  {name:"RMC Sport 2",     short:"R2",  color:"#cc0000", cat:"RMC Sport",    url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=275813&extension=ts"},
  {name:"RMC Sport 3",     short:"R3",  color:"#cc0000", cat:"RMC Sport",    url:"http://sewv654wfcsdwfi87fwvgbngh.siauliairsavlt.pw/iptv/VEXVELA6Z7PXH6/2547/index.m3u8"},
  // ── Ligue 1+ ─────────────────────────────────────────
  {name:"Ligue 1+ 1",      short:"L1",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1813243&extension=ts"},
  {name:"Ligue 1+ 2",      short:"L2",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1813244&extension=ts"},
  {name:"Ligue 1+ 3",      short:"L3",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1102180&extension=ts"},
  {name:"Ligue 1+ 4",      short:"L4",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523611&extension=ts"},
  {name:"Ligue 1+ 5",      short:"L5",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523612&extension=ts"},
  {name:"Ligue 1+ 6",      short:"L6",  color:"#8800cc", cat:"Ligue 1+",     url:"http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523613&extension=ts"},
  // ── Autres ───────────────────────────────────────────
  {name:"Africa 24 Sport", short:"A24", color:"#009900", cat:"Autres",       url:"https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8"},
  // ── URL personnalisée ────────────────────────────────
  {name:"URL perso",       short:"✎",   color:"#666680", cat:"Autre",        url:"__custom__"},
];

// ═══════════════════════════════════════════════════
// ─── TV DIRECT ───────────────────────────────────
// ═══════════════════════════════════════════════════

// Sources TV par défaut (modifiables via admin)
// Stockées dans localStorage sous 'okin_tv_streams'
let tvStreams = {};

function loadTvStreams(){
  try{ tvStreams = JSON.parse(localStorage.getItem('okin_tv_streams')||'{}'); }catch(e){}
  // Defaults — utilisés si pas de config admin
  TV_CHANNELS.forEach(ch=>{
    if(!tvStreams[ch.id]) tvStreams[ch.id]={url:ch.defaultUrl,label:ch.name,sources:[{url:ch.defaultUrl,label:ch.name}],updatedAt:0};
  });
  // Firebase sync
  if(db){
    db.ref('tv_streams').on('value', snap=>{
      const fb = snap.val()||{};
      Object.entries(fb).forEach(([k,v])=>{
        const local=tvStreams[k];
        if(!local||(v?.updatedAt||0)>(local?.updatedAt||0)) tvStreams[k]=v;
      });
      try{localStorage.setItem('okin_tv_streams',JSON.stringify(tvStreams));}catch(e){}
    });
  }
}

const TV_GROUPS = [
  {id:'bein',   name:'beIN Sports', color:'#00843d', grad:'135deg,#005a29,#00a050'},
  {id:'canal',  name:'Canal+',      color:'#0055cc', grad:'135deg,#003399,#0077ff'},
  {id:'rmc',    name:'RMC Sport',   color:'#e00',    grad:'135deg,#aa0000,#ff3333'},
  {id:'euro',   name:'Eurosport',   color:'#e05000', grad:'135deg,#c04000,#ff7700'},
  {id:'l1plus', name:'Ligue 1+',    color:'#7700cc', grad:'135deg,#550099,#9900ff'},
];

const TV_CHANNELS = [
  // beIN Sports
  {id:'bein1',   group:'bein', name:'beIN 1',      short:'B1',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/53324'},
  {id:'bein4',   group:'bein', name:'beIN Max 4',  short:'B4',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49620'},
  {id:'bein5',   group:'bein', name:'beIN Max 5',  short:'B5',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49619'},
  {id:'bein6',   group:'bein', name:'beIN Max 6',  short:'B6',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49618'},
  {id:'bein7',   group:'bein', name:'beIN Max 7',  short:'B7',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49617'},
  {id:'bein8',   group:'bein', name:'beIN Max 8',  short:'B8',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49616'},
  {id:'bein9',   group:'bein', name:'beIN Max 9',  short:'B9',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49615'},
  {id:'bein10',  group:'bein', name:'beIN Max 10', short:'B10', defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49614'},
  // Canal+
  {id:'cfoot',   group:'canal', name:'Canal+ Foot',      short:'C+F', defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/53295'},
  {id:'csport',  group:'canal', name:'Canal+ Sport',     short:'C+S', defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/49208'},
  {id:'c360',    group:'canal', name:'Canal+ Sport 360', short:'360', defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/54657'},
  {id:'clive1',  group:'canal', name:'Canal+ Live 1',    short:'L1',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/56553'},
  {id:'clive2',  group:'canal', name:'Canal+ Live 2',    short:'L2',  defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/56554'},
  // RMC Sport
  {id:'rmc1',    group:'rmc',   name:'RMC Sport 1', short:'R1', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=32835&extension=ts'},
  {id:'rmc2',    group:'rmc',   name:'RMC Sport 2', short:'R2', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=275813&extension=ts'},
  {id:'rmc3',    group:'rmc',   name:'RMC Sport 3', short:'R3', defaultUrl:'http://sewv654wfcsdwfi87fwvgbngh.siauliairsavlt.pw/iptv/VEXVELA6Z7PXH6/2547/index.m3u8'},
  // Eurosport
  {id:'euro1',   group:'euro',   name:'Eurosport 1', short:'E1', defaultUrl:'http://vip.sibfungold.org:8080/restream1/LKuZiN5Idu2DpgG4y4pa/51644'},
  {id:'euro2',   group:'euro',   name:'Eurosport 2', short:'E2', defaultUrl:'http://151.80.18.177:86/Eurosport_2_HD/index.m3u8'},
  // Ligue 1+
  {id:'l1p1',    group:'l1plus', name:'Ligue 1+ 1', short:'L1', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1813243&extension=ts'},
  {id:'l1p2',    group:'l1plus', name:'Ligue 1+ 2', short:'L2', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1813244&extension=ts'},
  {id:'l1p3',    group:'l1plus', name:'Ligue 1+ 3', short:'L3', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1102180&extension=ts'},
  {id:'l1p4',    group:'l1plus', name:'Ligue 1+ 4', short:'L4', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523611&extension=ts'},
  {id:'l1p5',    group:'l1plus', name:'Ligue 1+ 5', short:'L5', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523612&extension=ts'},
  {id:'l1p6',    group:'l1plus', name:'Ligue 1+ 6', short:'L6', defaultUrl:'http://eagle2024.xyz:80/play/live.php?mac=00:1A:79:84:0F:1B&stream=1523613&extension=ts'},
];

let tvGroupOpen = false;
let tvGroupCurrent = null;

function openTVGroup(groupId){
  haptic(6);
  const g = TV_GROUPS.find(x=>x.id===groupId);
  if(!g) return;
  tvGroupOpen = true;
  tvGroupCurrent = groupId;

  const channels = TV_CHANNELS.filter(c=>c.group===groupId);
  const ov = document.getElementById('tv-group-ov');
  if(!ov) return;

  const titleEl = document.getElementById('tv-group-title');
  const bgEl = document.getElementById('tv-group-header-bg');
  const countEl = document.getElementById('tv-group-count');
  if(titleEl) titleEl.textContent = g.name;
  if(bgEl) bgEl.style.background = `linear-gradient(${g.grad})`;
  if(countEl) countEl.textContent = `${channels.length} chaîne${channels.length>1?'s':''} • En direct`;
  // Mettre à jour le CSS variable sur l'overlay pour les cards
  const ov2 = document.getElementById('tv-group-ov');
  if(ov2){ ov2.style.setProperty('--gcolor', g.color); ov2.style.setProperty('--ggrad', g.grad); }

  const body = document.getElementById('tv-group-body');
  body.innerHTML = `<div class="tv-ch-list">` + channels.map((ch,i)=>{
    return`<div class="tv-ch-row" onclick="openTVChannel('${ch.id}')" style="--delay:${i*40}ms;--gcolor:${g.color}">
      <div class="tv-ch-row-badge" style="background:${g.color}18;border-color:${g.color}35;color:${g.color}">${ch.short}</div>
      <div class="tv-ch-row-info">
        <div class="tv-ch-row-name">${ch.name}</div>
        <div class="tv-ch-row-status"><span class="tv-ch-row-dot"></span><span>En direct</span></div>
      </div>
      <div class="tv-ch-row-play" style="color:${g.color}">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>`;
  }).join('') + `</div>`;

  ov.classList.add('open');
  document.body.style.overflow='hidden';
  history.pushState({tvGroup:true},'');
}

function closeTVGroup(){
  const ov=document.getElementById('tv-group-ov');
  if(!ov)return;
  ov.classList.remove('open');
  setTimeout(()=>{ document.body.style.overflow=''; },300);
  tvGroupOpen=false;
  tvGroupCurrent=null;
}

function openTVChannel(chId){
  haptic(8);
  const ch = TV_CHANNELS.find(x=>x.id===chId);
  if(!ch) return;
  const g = TV_GROUPS.find(x=>x.id===ch.group);
  const ts = tvStreams[chId];
  const url = ts?.sources?.length ? ts.sources[ts.activeIdx||0]?.url : ts?.url || ch.defaultUrl;
  const sources = ts?.sources?.length ? ts.sources : [{url:ch.defaultUrl,label:ch.name}];

  const fakeMatch = {
    id: 'tv_'+chId,
    homeTeam:{name:ch.name, shortName:ch.short, crest:null},
    awayTeam:{name:'Direct', shortName:'TV', crest:null},
    status:'IN_PLAY',
    utcDate:new Date().toISOString(),
    goals:{home:null,away:null},
    _cname: g?.name||'TV',
    _cflag:null,
    _dayKey:todayKey(),
    streamUrl:url,
    streamSources:sources,
    streamActiveIdx:ts?.activeIdx||0,
    _isTV:true, _tvChId:chId, _tvName:ch.name, _tvColor:g?.color||'var(--acc)',
  };

  // Fermer l'overlay TV instantanément (sans animation) puis ouvrir le lecteur
  // Le lecteur est z-index 100, l'overlay TV z-index 210 → il faut fermer l'overlay
  const ov = document.getElementById('tv-group-ov');
  if(ov){
    ov.style.transition = 'none';
    ov.classList.remove('open');
    tvGroupOpen = false;
    tvGroupCurrent = null;
    document.body.style.overflow = '';
    // Forcer reflow avant d'ouvrir le lecteur
    ov.offsetHeight;
    // Remettre la transition pour les prochaines fois
    setTimeout(()=>{ ov.style.transition = ''; }, 50);
  }
  openSingle(fakeMatch);
}

function renderTVBar(){
  return`<div class="tv-section">
    <div class="tv-section-head">
      <span class="tv-section-title">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
        TV Direct
      </span>
    </div>
    <div class="tv-groups-row" id="tv-groups-row">
      ${TV_GROUPS.map(g=>{
        const count = TV_CHANNELS.filter(c=>c.group===g.id).length;
        return`<div class="tv-group-pill" onclick="openTVGroup('${g.id}')" style="--gcolor:${g.color};--ggrad:${g.grad}">
          <div class="tv-pill-dot"></div>
          <span class="tv-pill-name">${g.name}</span>
          <span class="tv-pill-count">${count}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ─── ADMIN TV ─────────────────────────────────────
let adminTab = 'matches'; // 'matches' | 'tv'
let _tvAdmSources = {}; // {chId: [{url,label}]}

function admTvSave(chId){
  const srcs = [...(_tvAdmSources[chId]||[])];
  const inp = document.getElementById(`tvadm-custom-${chId}`);
  const cu = inp?.value.trim();
  if(cu&&!srcs.find(s=>s.url===cu)) srcs.push({url:cu,label:'Custom'});
  if(!srcs.length){ toast('❌ Sélectionne au moins une source'); return; }
  const ts = Date.now();
  const obj = {sources:srcs, activeIdx:0, updatedAt:ts, url:srcs[0].url, label:srcs[0].label};
  tvStreams[chId] = obj;
  _tvAdmSources[chId] = [...srcs];
  try{ localStorage.setItem('okin_tv_streams', JSON.stringify(tvStreams)); }catch(e){}
  if(db) db.ref(`tv_streams/${chId}`).set(obj).catch(()=>{});
  toast(`✅ ${srcs.length} source${srcs.length>1?'s':''} sauvegardée${srcs.length>1?'s':''} !`);
  // Mise à jour DOM de la card
  const card = document.getElementById(`tvadm-card-${chId}`);
  if(card){
    card.classList.add('has-stream');
    const badge = card.querySelector('.tvadm-badge');
    if(badge) badge.textContent = srcs.length>1?`${srcs.length} sources`:srcs[0].label;
  }
}

function admTvDel(chId){
  const ch = TV_CHANNELS.find(x=>x.id===chId);
  if(!ch) return;
  // Remettre la source par défaut
  const def = {sources:[{url:ch.defaultUrl,label:ch.name}], activeIdx:0, updatedAt:0, url:ch.defaultUrl, label:ch.name};
  tvStreams[chId] = def;
  _tvAdmSources[chId] = [{url:ch.defaultUrl,label:ch.name}];
  try{ localStorage.setItem('okin_tv_streams', JSON.stringify(tvStreams)); }catch(e){}
  if(db) db.ref(`tv_streams/${chId}`).remove().catch(()=>{});
  toast('🔄 Source par défaut restaurée');
  const card = document.getElementById(`tvadm-card-${chId}`);
  if(card){
    card.classList.remove('has-stream');
    const badge = card.querySelector('.tvadm-badge');
    if(badge) badge.textContent = 'Source par défaut';
  }
}

function admTvSelectChannel(chId, url, name){
  if(!_tvAdmSources[chId]) _tvAdmSources[chId]=[];
  const idx = _tvAdmSources[chId].findIndex(s=>s.url===url);
  if(idx>=0) _tvAdmSources[chId].splice(idx,1);
  else _tvAdmSources[chId].push({url,label:name});
  // Update UI
  const form = document.getElementById(`tvadmf-${chId}`);
  if(!form) return;
  form.querySelectorAll('.adm-ch-btn[data-url]').forEach(btn=>{
    const sel = _tvAdmSources[chId].some(s=>s.url===btn.dataset.url);
    const order = _tvAdmSources[chId].findIndex(s=>s.url===btn.dataset.url);
    btn.classList.toggle('selected',sel);
    const badge = btn.querySelector('.adm-ch-badge');
    if(badge){badge.textContent=sel?order+1:'';badge.style.display=sel?'flex':'none';}
  });
  const counter = form.querySelector('.adm-src-count');
  const n = _tvAdmSources[chId].length;
  if(counter) counter.textContent = n?`${n} source${n>1?'s':''} sélectionnée${n>1?'s':''}`:'Aucune source';
}

function admTvSaveCustom(chId){
  const inp = document.getElementById(`tvadm-custom-${chId}`);
  const u = inp?.value.trim();
  if(!u){ toast('❌ URL vide'); return; }
  if(!_tvAdmSources[chId]) _tvAdmSources[chId]=[];
  if(!_tvAdmSources[chId].find(s=>s.url===u)){
    _tvAdmSources[chId].push({url:u,label:'Custom'});
    toast('✅ URL ajoutée');
  } else { toast('URL déjà dans la liste'); }
  inp.value='';
  const counter = document.querySelector(`#tvadmf-${chId} .adm-src-count`);
  const n = _tvAdmSources[chId].length;
  if(counter) counter.textContent = `${n} source${n>1?'s':''} sélectionnée${n>1?'s':''}`;
}

function toggleTvAdmCard(chId){
  const f = document.getElementById(`tvadmf-${chId}`);
  if(!f) return;
  const isOpen = f.style.display==='flex';
  document.querySelectorAll('.tvadm-form').forEach(el=>el.style.display='none');
  document.querySelectorAll('.tvadm-chevron').forEach(el=>el.style.transform='');
  if(!isOpen){
    f.style.display='flex';
    const chev = document.querySelector(`#tvadm-card-${chId} .tvadm-chevron`);
    if(chev) chev.style.transform='rotate(180deg)';
  }
}

function renderAdminTV(){
  const catGroups={};
  ADMIN_CHANNELS.forEach(ch=>{if(!catGroups[ch.cat])catGroups[ch.cat]=[];catGroups[ch.cat].push(ch);});

  // Init _tvAdmSources
  TV_CHANNELS.forEach(ch=>{
    if(document.getElementById(`tvadmf-${ch.id}`)?.style.display==='flex') return;
    const s = tvStreams[ch.id];
    if(s?.sources?.length) _tvAdmSources[ch.id]=[...s.sources];
    else if(s?.url) _tvAdmSources[ch.id]=[{url:s.url,label:s.label||ch.name}];
    else _tvAdmSources[ch.id]=[{url:ch.defaultUrl,label:ch.name}];
  });

  const groupedChannels = TV_GROUPS.map(g=>({
    group:g,
    channels:TV_CHANNELS.filter(c=>c.group===g.id)
  }));

  const rows = groupedChannels.map(({group:g,channels})=>`
    <div class="tvadm-group-header" style="--gcolor:${g.color}">
      <div class="tvadm-group-dot" style="background:${g.color}"></div>
      <span>${g.name}</span>
      <span class="adm-comp-count">${channels.length} chaîne${channels.length>1?'s':''}</span>
    </div>
    ${channels.map(ch=>{
      const s = tvStreams[ch.id];
      const hasCustom = s?.updatedAt>0;
      const label = s?.sources?.length>1?`${s.sources.length} sources`:s?.label||ch.name;
      return`<div class="adm-match tvadm-card${hasCustom?' has-stream':''}" id="tvadm-card-${ch.id}">
        <div class="adm-match-header" onclick="toggleTvAdmCard('${ch.id}')">
          <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
            <div class="tvadm-ch-badge" style="background:${g.color}20;color:${g.color};border:1px solid ${g.color}40;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:900;border-radius:8px;padding:5px 10px;flex-shrink:0">${ch.short}</div>
            <div style="min-width:0">
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.2px;color:var(--t1)">${ch.name}</div>
              <div class="tvadm-badge" style="font-size:11px;color:${hasCustom?'var(--green)':'var(--t3)'}${hasCustom?';font-weight:600':''}">${hasCustom?'✓ '+label:'Source par défaut'}</div>
            </div>
          </div>
          <div class="adm-match-footer-row" style="gap:8px">
            <svg class="tvadm-chevron" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
          </div>
        </div>
        <div class="adm-match-form tvadm-form" id="tvadmf-${ch.id}">
          ${Object.entries(catGroups).map(([cat,chs])=>`
            <div class="adm-ch-cat-label">${cat}</div>
            <div class="adm-ch-grid">
              ${chs.filter(c=>c.url!=='__custom__').map(c=>{
                const isSel=(_tvAdmSources[ch.id]||[]).some(x=>x.url===c.url);
                const order=(_tvAdmSources[ch.id]||[]).findIndex(x=>x.url===c.url);
                return`<button class="adm-ch-btn${isSel?' selected':''}" data-url="${c.url}" style="--ch-color:${c.color}" onclick="admTvSelectChannel('${ch.id}','${c.url}','${c.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')"><span class="adm-ch-badge" style="display:${isSel?'flex':'none'}">${isSel?order+1:''}</span><span class="adm-ch-short">${c.short}</span><span class="adm-ch-name">${c.name}</span></button>`;
              }).join('')}
            </div>`).join('')}
          <div class="adm-src-status">
            <div class="adm-src-status-row">
              <span class="adm-src-count">${(_tvAdmSources[ch.id]?.length||0)>0?`${_tvAdmSources[ch.id].length} source${_tvAdmSources[ch.id].length>1?'s':''} sélectionnée${_tvAdmSources[ch.id].length>1?'s':''}`:'Aucune source sélectionnée'}</span>
            </div>
            ${(_tvAdmSources[ch.id]?.length||0)>0?`<div class="adm-src-pills">${_tvAdmSources[ch.id].map((src,i)=>`<span class="adm-src-pill">${i+1}. ${src.label}</span>`).join('')}</div>`:''}
          </div>
          <div class="adm-custom-row">
            <input class="adm-custom" id="tvadm-custom-${ch.id}" placeholder="🔗 URL personnalisée...">
            <button class="adm-custom-save" onclick="admTvSaveCustom('${ch.id}')">OK</button>
          </div>
          <div class="adm-form-actions">
            <button class="adm-save-btn" onclick="admTvSave('${ch.id}')">
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
              Sauvegarder
            </button>
            ${s?.updatedAt>0?`<button class="adm-del-btn" onclick="admTvDel('${ch.id}')" title="Remettre par défaut"><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>`:''}
          </div>
        </div>
      </div>`;
    }).join('')}`).join('');

  return`<div class="adm-matches-wrap">${rows}</div>`;
}


const ADMIN_EMAIL = 'nmeskhia22@gmail.com'; // Propriétaire unique — seul lui peut nommer/retirer des admins
let isAdminCache = false; // true si currentUser est dans /admins (maintenu à jour par un listener live)

// Propriétaire du site (toi) — pouvoir absolu, seul à pouvoir gérer les admins
function isOwner(){ return !!(currentUser && currentUser.email === ADMIN_EMAIL); }
// Admin (propriétaire OU quelqu'un promu) — mêmes pouvoirs sauf gérer les autres admins
function isAdmin(){ return isOwner() || !!(currentUser && isAdminCache); }

// Écoute en direct /admins/{uid} pour savoir si l'utilisateur connecté est admin.
// Utilise .on (pas .once) : si le propriétaire retire un admin, ça se répercute immédiatement.
function attachAdminListener(uid){
  if(!db || !uid) return;
  db.ref('admins/'+uid).on('value', snap=>{
    isAdminCache = snap.exists();
    updateAuthUI();
    // Le statut admin arrive de façon asynchrone, souvent APRÈS les tentatives
    // d'affichage programmées au démarrage : c'est pour ça que le bouton de
    // débogage n'apparaissait pas. On le monte dès que le statut est confirmé.
    try{ dbgMount(); }catch(e){}
  });
}
function detachAdminListener(uid){
  if(!db || !uid) return;
  db.ref('admins/'+uid).off();
  isAdminCache = false;
}
let adminOpen = false;
let adminDate = null;

// Entrée "Installer l'application" — visible seulement si l'app n'est pas déjà
// installée ET que le navigateur la déclare installable (ou qu'on est sur iOS,
// où l'installation est manuelle).
function pwaInstallItem(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if(standalone || !pwaCanInstall) return '';
  return '<button class="pf-list-item" onclick="installPWA()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    + '<span>Installer l\'application</span>'
    + '<svg class="pf-list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg>'
  + '</button>';
}

function renderReferralCard(){
  if(!currentUser) return '';
  if(!referralInfo){
    loadReferralInfo().then(()=>{ if(page==='account') renderContent(); });
    return '<div class="pf-card pf-ref-card"><div class="pf-ref-loading"><div class="spinner" style="width:20px;height:20px"></div></div></div>';
  }
  const link = location.origin + '/?ref=' + referralInfo.code;
  const dots = [0,1,2].map(i => '<span class="pf-ref-dot'+(i < referralInfo.progress ? ' on' : '')+'"></span>').join('');
  return '<div class="pf-card pf-ref-card">'
    + '<div class="pf-ref-head">'
      + '<div class="pf-ref-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>'
      + '<div><div class="pf-ref-title">Parraine tes amis</div><div class="pf-ref-sub">3 amis VIP = 3 mois offerts pour toi</div></div>'
    + '</div>'
    + '<div class="pf-ref-link-row">'
      + '<span class="pf-ref-link-txt">'+escHtml(link)+'</span>'
      + '<button class="pf-ref-copy-btn" onclick="copyReferralLink()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'
    + '</div>'
    + '<div class="pf-ref-progress-row">'
      + '<div class="pf-ref-dots">'+dots+'</div>'
      + '<span class="pf-ref-progress-txt">'+referralInfo.progress+'/3 filleuls VIP</span>'
    + '</div>'
    + (referralInfo.monthsEarned > 0 ? '<div class="pf-ref-earned">🎁 '+referralInfo.monthsEarned+' mois VIP déjà offerts grâce à toi</div>' : '')
    + '<button class="pf-ref-howto-btn" onclick="toggleRefHowto()">'
      + '<span>Comment ça marche ?</span>'
      + '<svg id="pf-ref-howto-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M6 9l6 6 6-6"/></svg>'
    + '</button>'
    + '<div class="pf-ref-howto" id="pf-ref-howto" style="display:none">'
      + '<div class="pf-ref-howto-step"><span class="pf-ref-howto-num">1</span><span>Partage ton lien avec tes amis (bouton copier ci-dessus)</span></div>'
      + '<div class="pf-ref-howto-step"><span class="pf-ref-howto-num">2</span><span>Un ami clique ton lien puis crée son compte — il est automatiquement lié à toi</span></div>'
      + '<div class="pf-ref-howto-step"><span class="pf-ref-howto-num">3</span><span>Dès qu\'il <b>paie un abonnement VIP</b> (une clé test ne compte pas), il devient un filleul validé</span></div>'
      + '<div class="pf-ref-howto-step"><span class="pf-ref-howto-num">🎁</span><span>Tous les <b>3 filleuls payants</b>, tu reçois automatiquement <b>3 mois de VIP gratuits</b>, ajoutés à ton compte</span></div>'
    + '</div>'
  + '</div>';
}

function renderAccount(){
  const vipActive = isVIP();
  const vipExpTxt = (vipActive && vipLive.exp && vipLive.exp!==Infinity) ? new Date(vipLive.exp).toLocaleDateString('fr-FR') : '';

  const ICON_VIP = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg>';

  if(currentUser){
    const rawName = currentUser.displayName || currentUser.email.split('@')[0] || 'Utilisateur';
    const name = escHtml(rawName);
    const email = escHtml(currentUser.email || '');
    // myPhoto (Realtime DB) prioritaire sur photoURL (photo Google par défaut)
    const photo = myPhoto || currentUser.photoURL;
    const initial = rawName[0].toUpperCase();
    const nameClass = (vipActive && myNameColor) ? ' name-shine name-shine-'+myNameColor : '';

    // Badge avatar : upload photo réservé aux VIP, cadenas sinon
    const ICON_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const avatarBadge = vipActive
      ? '<button class="pf-avatar-upload-btn" onclick="triggerAvatarUpload()" title="Changer la photo (VIP)">'+ICON_CAMERA+'</button>'
      : '<div class="pf-avatar-locked" onclick="openVIP()" title="Photo de profil réservée aux VIP">'+ICON_LOCK+'</div>';

    // Couleur de pseudo — VIP uniquement. Pastille discrète à côté du pseudo
    // qui déplie un petit panneau, plutôt qu'une grosse card fixe.
    const colorNames = ['Or','Chrome','Braise','Glacier','Améthyste','Émeraude'];
    const colorToggle = vipActive
      ? '<button class="pf-color-toggle'+(myNameColor?' pf-color-toggle-'+myNameColor:'')+'" onclick="togglePseudoColors()" title="Couleur du pseudo (VIP)"><span class="pf-color-toggle-dot"></span></button>'
      : '';
    const colorPanel = vipActive
      ? '<div class="pf-color-pop" id="pf-color-pop" style="display:'+(_pseudoColorsOpen?'':'none')+'">'
        + '<div class="pf-color-pop-title">Couleur du pseudo</div>'
        + '<div class="pf-color-pop-grid">'
          + [1,2,3,4,5,6].map(n=>'<button class="pf-color-swatch pf-color-swatch-'+n+(myNameColor==n?' on':'')+'" onclick="setNameColor('+n+')" title="'+colorNames[n-1]+'"></button>').join('')
        + '</div>'
        + '<button class="pf-color-none'+(!myNameColor?' on':'')+'" onclick="setNameColor(null)">Aucune couleur</button>'
      + '</div>'
      : '';

    return '<div class="pf-wrap">'

      // ── Hero ──
      + '<div class="pf-hero">'
        + '<div class="pf-avatar-wrap">'
          + (photo
              ? '<img src="'+escHtml(photo)+'" class="pf-avatar-photo" referrerpolicy="no-referrer" alt="">'
              : '<div class="pf-avatar-initials">'+initial+'</div>')
          + avatarBadge
        + '</div>'
        + '<input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="uploadAvatarPhoto(this.files[0])">'
        + '<div class="pf-name-row">'
          + '<span class="pf-name'+nameClass+'">'+name+'</span>'
          + (vipActive ? '<span style="color:var(--gold-3,#e8a527);display:flex" title="VIP">'+ICON_VIP+'</span>' : '')
          + colorToggle
          + '<button class="pf-edit-btn" onclick="openEditPseudo()" title="Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        + '</div>'
        + colorPanel
        + '<div class="pf-email">'+email+'</div>'
        + '<button class="pf-uid-chip" onclick="copyMyUid()" title="Copier mon identifiant">'
          + '<span>ID '+escHtml(currentUser.uid.slice(0,10))+'…</span>'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>'
      + '</div>'

      + '<div class="pf-pseudo-edit" id="pseudo-edit-block" style="display:none">'
        + '<label class="pf-pseudo-label">Nouveau pseudo</label>'
        + '<div class="pf-pseudo-row">'
          + '<input id="pseudo-input" class="pf-pseudo-input" type="text" placeholder="Ton pseudo" maxlength="24" autocomplete="off">'
          + '<button id="pseudo-save-btn" class="pf-pseudo-ok" onclick="savePseudo()">OK</button>'
          + '<button class="pf-pseudo-cancel" onclick="cancelEditPseudo()"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>'
        + '</div>'
      + '</div>'

      // ── VIP (card dorée — animations déjà gérées en CSS via ::before) ──
      + '<div class="pf-card pf-vip-card'+(vipActive?' pf-vip-card-active':'')+'" onclick="openVIP()">'
        + '<div class="pf-vip-ico">'+ICON_VIP+'</div>'
        + '<div class="pf-vip-info">'
          + '<div class="pf-vip-title">'+(vipActive?'VIP actif':'Passer en VIP')+'</div>'
          + '<div class="pf-vip-sub">'+(vipActive?'Expire le '+vipExpTxt:'Sans pub · Streams HD · Multi-stream')+'</div>'
        + '</div>'
        + '<svg class="pf-vip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>'
      + '</div>'

      // ── Parrainage ──
      + renderReferralCard()

      // ── Compte ──
      + '<div class="pf-section-label">Compte</div>'
      + '<div class="pf-list">'
        + '<button class="pf-list-item" onclick="openFeedbackModal()">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
          + '<span>Signaler un bug / Suggérer</span>'
          + (vipActive ? '<span class="pf-prio-tag">Prioritaire</span>' : '')
          + '<svg class="pf-list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg>'
        + '</button>'
        + pwaInstallItem()
        + (isAdmin() ? '<button class="pf-list-item" onclick="openAdminPanel()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Administration</span><svg class="pf-list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg></button>' : '')
        + '<button class="pf-list-item pf-list-item-danger" onclick="signOut()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Se déconnecter</span></button>'
      + '</div>'

      + '<div class="pf-footer">© 2026 Okin Stream</div>'
    + '</div>';
  }

  // ── NON CONNECTE ──
  const G_BTN = '<button class="pf-auth-google" onclick="signInWithGoogle()"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continuer avec Google</button>';

  let pendingRef = null;
  try{ pendingRef = localStorage.getItem('pending_referral'); }catch(e){}

  return '<div class="pf-wrap">'
    + '<div class="pf-hero pf-hero-guest">'
      + '<div class="pf-hero-ball"><img src="/ball.png" width="56" height="56" style="object-fit:contain;display:block" alt=""></div>'
      + '<div class="pf-app-name">OKIN STREAM</div>'
      + '<div class="pf-hero-tagline">Connecte-toi pour synchroniser ton VIP</div>'
    + '</div>'

    + (pendingRef ? '<div class="pf-ref-invite-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>Tu as été invité·e par un ami — connecte-toi pour en profiter</span></div>' : '')

    + '<div class="pf-card pf-auth-card">'
      + G_BTN
      + '<div class="pf-auth-or"><span>ou</span></div>'
      + '<button class="pf-auth-email" onclick="openAuthModal(\'login\')">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
        + ' Connexion par email'
      + '</button>'
      + '<div class="pf-auth-hint">Pas encore de compte ? '
        + '<button class="pf-auth-hint-link" onclick="openAuthModal(\'register\')">S\'inscrire</button>'
      + '</div>'
    + '</div>'

    + (isAdmin() ? '<div class="pf-list"><button class="pf-list-item" onclick="openAdminPanel()"><span>⚙️ Administration</span></button></div>' : '')

    + '<div class="pf-card pf-vip-card" onclick="openVIP()">'
      + '<div class="pf-vip-ico">'+ICON_VIP+'</div>'
      + '<div class="pf-vip-info"><div class="pf-vip-title">Passer en VIP</div><div class="pf-vip-sub">Sans pub · Streams HD · Multi-stream</div></div>'
      + '<svg class="pf-vip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>'
    + '</div>'

    + '<div class="pf-section-label">Pourquoi se connecter</div>'
    + '<div class="pf-list">'
      + '<div class="pf-feature"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg><div><div class="pf-feature-title">VIP lié au compte</div><div class="pf-feature-sub">Ton accès VIP suit ton compte partout</div></div></div>'
      + '<div class="pf-feature"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><div><div class="pf-feature-title">Favoris synchronisés</div><div class="pf-feature-sub">Retrouve tes matchs sur tous tes appareils</div></div></div>'
      + '<div class="pf-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><div><div class="pf-feature-title">Programme de parrainage</div><div class="pf-feature-sub">3 amis VIP = 3 mois offerts pour toi</div></div></div>'
    + '</div>'
    + '<div class="pf-footer">© 2026 Okin Stream</div>'
  + '</div>';
}

// Fix #2 : fonctions modification du pseudo
// ── Photo de profil — upload réservé aux VIP (Firebase Storage) ──
function triggerAvatarUpload(){
  if(!isVIP()){ toast('Réservé aux membres VIP'); return; }
  document.getElementById('avatar-file-input')?.click();
}
function uploadAvatarPhoto(file){
  if(!file) return;
  if(!isVIP()){ toast('Réservé aux membres VIP'); return; }
  if(!currentUser || !db){ toast('Non connecté'); return; }
  if(!file.type.startsWith('image/')){ toast('Choisis une image'); return; }
  if(file.size > 10*1024*1024){ toast('Image trop lourde (10 Mo max)'); return; }
  toast('📤 Traitement de la photo…');

  const reader = new FileReader();
  reader.onerror = () => toast('❌ Lecture du fichier impossible');
  reader.onload = ev => {
    const img = new Image();
    img.onerror = () => toast('❌ Image illisible');
    img.onload = () => {
      try{
        // Recadrage carré centré + redimensionnement 256px + compression JPEG
        const SIZE = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width-min)/2, (img.height-min)/2, min, min, 0, 0, SIZE, SIZE);

        // On descend la qualité par paliers jusqu'à passer sous 90 Ko, pour ne
        // pas alourdir la Realtime Database avec une énorme chaîne base64.
        let dataUrl = '', q = 0.82;
        for(let i=0; i<5; i++){
          dataUrl = canvas.toDataURL('image/jpeg', q);
          if(dataUrl.length < 90000) break;
          q -= 0.15;
        }
        if(dataUrl.length > 120000){ toast('❌ Image trop lourde après compression'); return; }

        db.ref('users/'+currentUser.uid+'/photo').set(dataUrl)
          .then(() => { myPhoto = dataUrl; toast('✅ Photo mise à jour !'); renderContent(); })
          .catch(err => {
            console.warn('[avatar] écriture Firebase refusée:', err && err.message);
            toast('❌ Enregistrement refusé (règles Firebase)');
          });
      }catch(e){
        console.warn('[avatar]', e);
        toast('❌ Traitement de l\'image impossible');
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeAvatarPhoto(){
  if(!currentUser || !db) return;
  db.ref('users/'+currentUser.uid+'/photo').remove()
    .then(()=>{ myPhoto=null; toast('Photo retirée'); renderContent(); })
    .catch(()=>toast('Échec de la suppression'));
}

function copyMyUid(){
  if(!currentUser) return;
  navigator.clipboard?.writeText(currentUser.uid)
    .then(()=>toast('📋 Identifiant copié — envoie-le au propriétaire pour devenir admin'))
    .catch(()=>toast('Impossible de copier'));
}

function openEditPseudo(){
  const block = document.getElementById('pseudo-edit-block');
  if(!block) return;
  block.style.display = 'block';
  const inp = document.getElementById('pseudo-input');
  if(inp){
    inp.value = currentUser?.displayName || '';
    setTimeout(()=>inp.focus(), 80);
  }
}

function cancelEditPseudo(){
  const block = document.getElementById('pseudo-edit-block');
  if(block) block.style.display = 'none';
}

function savePseudo(){
  const inp = document.getElementById('pseudo-input');
  const val = inp?.value.trim();
  if(!val){ toast('Entre un pseudo'); return; }
  if(val.length > 24){ toast('Pseudo trop long (24 max)'); return; }
  if(!currentUser){ toast('Non connecté'); return; }
  const btn = document.getElementById('pseudo-save-btn');
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  currentUser.updateProfile({displayName: val})
    .then(()=>{
      toast('✅ Pseudo mis à jour !');
      cancelEditPseudo();
      // Mettre à jour l'affichage en live sans re-render complet
      const nameEl = document.getElementById('acc-display-name');
      if(nameEl) nameEl.textContent = val;
    })
    .catch(()=>{ toast('❌ Erreur lors de la mise à jour'); })
    .finally(()=>{ if(btn){ btn.disabled=false; btn.textContent='OK'; } });
}

function openAdminPanel(){
  if(!isAdmin()){ toast("❌ Accès réservé à l'administrateur"); return; }
  adminOpen = true;
  adminDate = adminDate || todayKey();
  attachFeedbackListener(); // alimente la pastille de l'onglet Retours dès l'ouverture
  renderAdminPanel();
  document.querySelectorAll('.bi[data-pg]').forEach(e => {
    e.onclick = () => setPage(e.dataset.pg);
  });
}

function renderAdminPanel(){
  $('scroll').style.pointerEvents='auto';
  const dayMatches=(data.byDate[adminDate]||[]);
  const today=new Date();
  const days=Array.from({length:9},(_,i)=>{const d=addDays(today,i-3);return{key:dayKey(d),d};});
  const dateNav=days.map(({key,d})=>{
    const lbl=key===todayKey()?'Auj.':d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'});
    return`<button class="adm-date-btn${key===adminDate?' active':''}" onclick="adminSetDate('${key}')">${lbl}</button>`;
  }).join('');
  const byComp={};
  dayMatches.forEach(m=>{const k=m._cname||'Autre';if(!byComp[k])byComp[k]=[];byComp[k].push(m);});
  const catGroups={};
  ADMIN_CHANNELS.forEach(ch=>{if(!catGroups[ch.cat])catGroups[ch.cat]=[];catGroups[ch.cat].push(ch);});
  const streamsCount=dayMatches.filter(m=>streams[String(m.id)]).length;
  const pct=dayMatches.length?Math.round(streamsCount/dayMatches.length*100):0;

  // ── Init _admSources depuis streams (toujours, sauf si l'user est en train d'éditer) ──
  // Un match est "en cours d'édition" seulement si son form est ouvert
  dayMatches.forEach(m=>{
    const id=String(m.id);
    const formOpen=document.getElementById(`admf-${id}`)?.style.display==='flex';
    if(formOpen) return; // ne pas écraser une sélection en cours
    const s=streams[id];
    if(!s){_admSources[id]=[];return;}
    if(s.sources?.length) _admSources[id]=[...s.sources];
    else if(s.url) _admSources[id]=[{url:s.url,label:s.label||'Source 1'}];
    else _admSources[id]=[];
  });


  const matchRows=Object.entries(byComp).map(([comp,ms])=>`
    <div class="adm-comp-header">
      <img src="https://crests.football-data.org/${ms[0]._cid}.png" onerror="this.style.display='none'" width="14" height="14" style="object-fit:contain">
      <span>${comp}</span>
      <span class="adm-comp-count">${ms.length} match${ms.length>1?'s':''}</span>
    </div>
    ${ms.map(m=>{
      const id=String(m.id);
      const s=streams[id];
      const ch=s?ADMIN_CHANNELS.find(c=>c.url===s.url):null;
      const chName=ch?.name||s?.label||'Custom';
      const chColor=ch?.color||'var(--acc)';
      const hn=m.homeTeam?.shortName||m.homeTeam?.name||'?';
      const an=m.awayTeam?.shortName||m.awayTeam?.name||'?';
      const live=isLive(m),fin=isFin(m);
      const score=live||fin?getScore(m):null;
      return`
      <div class="adm-match${s?' has-stream':''}" id="adm-card-${id}">
        <div class="adm-match-header" onclick="toggleAdmMatch('${id}')">
          <div class="adm-match-crests">
            ${m.homeTeam?.crest?`<img src="${m.homeTeam.crest}" onerror="this.style.display='none'" alt="">`:'<div style="width:36px;height:36px"></div>'}
            <div class="adm-match-vs-block">
              ${score?`<div class="adm-match-score">${score}</div>`:`<div class="adm-match-time">${fmtTime(m.utcDate)}</div>`}
              ${live?'<div class="adm-match-live">LIVE</div>':fin?'<div class="adm-match-fin">FT</div>':''}
            </div>
            ${m.awayTeam?.crest?`<img src="${m.awayTeam.crest}" onerror="this.style.display='none'" alt="">`:'<div style="width:36px;height:36px"></div>'}
          </div>
          <div class="adm-match-teams">
            <span class="adm-team-name">${hn}</span>
            <span class="adm-team-sep">—</span>
            <span class="adm-team-name">${an}</span>
          </div>
          <div class="adm-match-footer-row">
            ${s?(()=>{const srcs=s.sources||[{url:s.url,label:s.label||'?'}];const statusEl=`<span class="adm-status-dot" id="adm-dot-${id}"></span>`;return`<div class="adm-assigned-badge" style="--ch-color:${chColor}">${statusEl}<span>${srcs.length>1?`${srcs.length} sources`:chName}</span></div>`;})():`<div class="adm-no-stream">Aucun stream</div>`}
            <svg class="adm-chevron" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
          </div>
        </div>
        <div class="adm-match-form" id="admf-${id}">
          ${Object.entries(catGroups).map(([cat,chs])=>`
            <div class="adm-ch-cat-label">${cat}</div>
            <div class="adm-ch-grid">
              ${chs.filter(c=>c.url!=='__custom__').map(c=>{const isSel=(_admSources[id]||[]).some(x=>x.url===c.url);const order=(_admSources[id]||[]).findIndex(x=>x.url===c.url);return`<button class="adm-ch-btn${isSel?' selected':''}" data-url="${c.url}" style="--ch-color:${c.color}" onclick="admSelectChannel('${id}','${c.url}','${c.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')"><span class="adm-ch-badge" style="display:${isSel?'flex':'none'}">${isSel?order+1:''}</span><span class="adm-ch-short">${c.short}</span><span class="adm-ch-name">${c.name}</span></button>`;}).join('')}
            </div>`).join('')}
          <div class="adm-src-status">
            <div class="adm-src-status-row">
              <span class="adm-src-count">${(_admSources[id]?.length||0)>0?`${_admSources[id].length} source${_admSources[id].length>1?'s':''} sélectionnée${_admSources[id].length>1?'s':''}`:'Aucune source sélectionnée'}</span>
              ${s?`<button class="adm-check-btn" onclick="admCheckSources('${id}')">
                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                Tester
              </button>`:''}
            </div>
            ${(_admSources[id]?.length||0)>0?`<div class="adm-src-pills" id="adm-pills-${id}">${(_admSources[id]).map((src,i)=>`<span class="adm-src-pill" data-url="${src.url}">${i+1}. ${src.label}</span>`).join('')}</div>`:''}
          </div>
          <div class="adm-custom-row">
            <input class="adm-custom" id="admcustom-${id}" placeholder="🔗 URL personnalisée...">
            <button class="adm-custom-save" onclick="admSaveCustom('${id}')">OK</button>
          </div>
          <!-- Marque l'URL personnalisée comme source VIP (meilleure qualité) -->
          <label class="adm-vip-check">
            <input type="checkbox" id="admvip-${id}">
            <span>★ Source VIP — meilleure qualité, réservée aux abonnés</span>
          </label>
          <div class="adm-form-actions">
            <button class="adm-save-btn" onclick="admSave('${id}')">
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
              Sauvegarder
            </button>
            ${s?`<button class="adm-del-btn" onclick="admDel('${id}')"><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>`:''}
          </div>
        </div>
      </div>`;
    }).join('')}`).join('');

  document.getElementById('content').innerHTML=`
  <div class="adm-panel">
    <div class="adm-panel-head">
      <div>
        <div class="adm-panel-title">ADMIN</div>
        <div class="adm-panel-subtitle">${adminTab==='vip'?'Clés VIP':adminTab==='tv'?'Chaînes TV':streamsCount+'/'+dayMatches.length+' streams — '+pct+'%'}</div>
      </div>
      <button class="adm-close-btn" onclick="closeAdminPanel()">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        Fermer
      </button>
    </div>
    <div class="adm-tabs">
      <button class="adm-tab${adminTab==='matches'?' active':''}" onclick="adminTab='matches';renderAdminPanel()">⚽ Matchs</button>
      <button class="adm-tab${adminTab==='tv'?' active':''}" onclick="adminTab='tv';renderAdminPanel()">📺 Chaînes TV</button>
      <button class="adm-tab${adminTab==='vip'?' active':''}" onclick="adminTab='vip';renderAdminPanel()">🔑 Clés VIP</button>
      <button class="adm-tab${adminTab==='admins'?' active':''}" onclick="adminTab='admins';renderAdminPanel()">👤 Admins</button>
      <button class="adm-tab${adminTab==='dlive'?' active':''}" onclick="adminTab='dlive';renderAdminPanel()">🔗 dlive</button>
      <button class="adm-tab${adminTab==='fls'?' active':''}" onclick="adminTab='fls';renderAdminPanel()">📡 FLS</button>
      <button class="adm-tab${adminTab==='feedback'?' active':''}" onclick="adminTab='feedback';renderAdminPanel()">📬 Retours${_fbOpenCount?`<span class="adm-tab-dot">${_fbOpenCount}</span>`:''}</button>
    </div>
    ${adminTab==='vip'?renderAdminVIP():adminTab==='tv'?`${renderAdminTV()}`:adminTab==='admins'?renderAdminUsers():adminTab==='dlive'?renderAdminDlive():adminTab==='fls'?renderAdminFls():adminTab==='feedback'?renderAdminFeedback():`<div class="adm-progress-bar"><div class="adm-progress-fill" style="width:${pct}%"></div></div>
    <div class="adm-stats-row">
      <div class="adm-stat-item"><div class="adm-stat-val">${dayMatches.length}</div><div class="adm-stat-lbl">Matchs</div></div>
      <div class="adm-stat-item"><div class="adm-stat-val" style="color:var(--green)">${streamsCount}</div><div class="adm-stat-lbl">Streamés</div></div>
      <div class="adm-stat-item"><div class="adm-stat-val" style="color:var(--t3)">${dayMatches.length-streamsCount}</div><div class="adm-stat-lbl">Sans stream</div></div>
    </div>
    <div class="adm-date-nav">${dateNav}</div>
    <div class="adm-matches-wrap">
      ${dayMatches.length?matchRows:'<div class="adm-empty"><svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style="opacity:.3;margin-bottom:8px"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg><br>Aucun match ce jour</div>'}
    </div>`}
    <div style="height:40px"></div>
  </div>`;
  if(adminTab==='matches') setTimeout(admAutoCheck, 300);
  if(adminTab==='vip') setTimeout(loadAdminVIPKeys, 100);
  if(adminTab==='admins') setTimeout(loadAdminUsersList, 100);
  if(adminTab==='dlive' && !dliveSyncMeta.lastSync) setTimeout(()=>syncDlive().then(()=>{ if(adminOpen) renderAdminPanel(); }), 100);
  // Garde-fou : syncFls() finit par re-rendre le panneau, donc sans ce test
  // d'ancienneté on repartirait en boucle infinie rendu → sync → rendu.
  if(adminTab==='fls' && Date.now()-(flsSyncMeta.lastSync||0) > 60000){
    setTimeout(()=>syncFls().then(()=>{ if(adminOpen && adminTab==='fls') renderAdminPanel(); }).catch(()=>{}), 100);
  }
  if(adminTab==='feedback') setTimeout(loadAdminFeedback, 60);
}

// ─── Onglet admin dlive ───
function renderAdminDlive(){
  const meta = dliveSyncMeta;
  const lastSyncTxt = meta.lastSync ? new Date(meta.lastSync).toLocaleString('fr-FR') : 'Jamais';
  const pendingList = (kind) => {
    const list = kind==='channel' ? dlivePendingChannels : dlivePendingEvents;
    if(!list.length) return `<div class="adm-empty" style="padding:20px 0">Rien à valider ${kind==='channel'?'côté chaînes':'côté matchs'} 👍</div>`;
    return list.map(p => `
      <div class="dlive-pending-card">
        <div class="dlive-pending-name">${escHtml(p.dliveName)}</div>
        <div class="dlive-pending-candidates">
          ${p.candidates.map(c => `
            <button class="dlive-candidate-btn" onclick="confirmDliveMapping('${kind}','${p.key}',${JSON.stringify(p.dliveName)},${JSON.stringify(p.dliveId)},${JSON.stringify(c.target)})">
              <span>${escHtml(c.label||c.target)}</span>
              <span class="dlive-candidate-score">${Math.round(c.score*100)}%</span>
            </button>`).join('')}
        </div>
        <button class="dlive-ignore-btn" onclick="ignoreDliveMapping('${p.key}')">🚫 Ignorer définitivement</button>
      </div>`).join('');
  };
  return `
    <div class="dlive-admin-wrap">
      <div class="dlive-sync-card">
        <div class="dlive-sync-row"><span>Dernière sync</span><b>${lastSyncTxt}</b></div>
        <div class="dlive-sync-row"><span>Chaînes matchées auto</span><b style="color:var(--green)">${meta.channelsMatched||0}</b></div>
        <div class="dlive-sync-row"><span>Matchs matchés auto</span><b style="color:var(--green)">${meta.eventsMatched||0}</b></div>
        <div class="dlive-sync-row"><span>En attente de validation</span><b style="color:var(--acc)">${(meta.channelsPending||0)+(meta.eventsPending||0)}</b></div>
        <button class="dlive-sync-btn" onclick="adminSyncDlive()" id="dlive-sync-btn">🔄 Synchroniser maintenant</button>
      </div>
      <div class="adm-comp-header"><span>📺 Chaînes à valider (${dlivePendingChannels.length})</span></div>
      ${pendingList('channel')}
      <div class="adm-comp-header"><span>⚽ Matchs à valider (${dlivePendingEvents.length})</span></div>
      ${pendingList('event')}
    </div>`;
}
// ─── Onglet admin FLS (Football Live Stream API) ───
// Le quota est la donnée la plus importante à afficher : chaque appel compte,
// et l'admin doit voir d'un coup d'œil combien de lectures il reste avant
// minuit UTC.
function renderAdminFls(){
  const q = flsQuota || {};
  const meta = flsSyncMeta;
  const lastSyncTxt = meta.lastSync ? new Date(meta.lastSync).toLocaleTimeString('fr-FR') : 'jamais';
  const srvSyncTxt  = meta.serverSync ? new Date(meta.serverSync).toLocaleString('fr-FR') : 'jamais';
  const resetTxt    = q.resetAt ? new Date(q.resetAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const used = q.used||0, limit = q.limit||0;
  const pct  = limit ? Math.min(100, Math.round(used/limit*100)) : 0;
  const barColor = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--acc)' : 'var(--green)';

  const pendingCards = !flsPending.length
    ? '<div class="adm-empty" style="padding:20px 0">Rien à valider 👍</div>'
    : flsPending.map(p => `
      <div class="dlive-pending-card">
        <div class="dlive-pending-name">${escHtml(p.title)}</div>
        <div class="fls-pending-meta">${escHtml(p.league||'—')}${p.kickoff?' · '+escHtml(new Date(p.kickoff).toLocaleString('fr-FR')):''}</div>
        <div class="dlive-pending-candidates">
          ${p.candidates.map(c => `
            <button class="dlive-candidate-btn" onclick='confirmFlsMapping(${JSON.stringify(p.key)},${JSON.stringify(p.flsId)},${JSON.stringify(c.target)},${JSON.stringify(p.title)})'>
              <span>${escHtml(c.label)}</span>
              <span class="dlive-candidate-score">${Math.round(c.score*100)}%</span>
            </button>`).join('')}
        </div>
        <button class="dlive-ignore-btn" onclick='ignoreFlsMapping(${JSON.stringify(p.key)})'>🚫 Ignorer définitivement</button>
      </div>`).join('');

  return `
    <div class="dlive-admin-wrap">
      <div class="dlive-sync-card">
        <div class="fls-quota-head">
          <span>Quota RapidAPI du jour</span>
          <b style="color:${barColor}">${used}/${limit||'?'}</b>
        </div>
        <div class="fls-quota-bar"><div class="fls-quota-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="fls-quota-legend">
          <span>Liste : ${q.listUsed||0}/${q.listReserve||0}</span>
          <span>Lectures : ${q.linkUsed||0}</span>
          <span>Reset ${resetTxt}</span>
        </div>
        <div class="dlive-sync-row"><span>État</span><b style="color:${!q.enabled?'var(--red)':q.blocked?'var(--acc)':'var(--green)'}">${!q.enabled?'Clé absente':q.blocked?'Bloqué — '+escHtml(q.blockedReason||''):'Actif ('+(q.mode||'proxy')+')'}</b></div>
        ${q.blocked?`<div class="dlive-sync-row"><span>Reprise des appels</span><b>${new Date(q.blockedUntil).toLocaleString('fr-FR')}</b></div>`:''}
        <div class="dlive-sync-row"><span>Dernier refresh serveur</span><b>${srvSyncTxt}</b></div>
        <div class="dlive-sync-row"><span>Dernier matching local</span><b>${lastSyncTxt}</b></div>
        <div class="dlive-sync-row"><span>Matchs proposés par l'API</span><b>${meta.total||0}</b></div>
        <div class="dlive-sync-row"><span>Sources assignées auto</span><b style="color:var(--green)">${meta.matched||0}</b></div>
        <div class="dlive-sync-row"><span>En attente de validation</span><b style="color:var(--acc)">${flsPending.length}</b></div>
        ${meta.error?`<div class="dlive-sync-row"><span>Erreur</span><b style="color:var(--red)">${escHtml(String(meta.error))}</b></div>`:''}
        <button class="dlive-sync-btn" onclick="adminSyncFls()" id="fls-sync-btn">🔄 Rematcher (gratuit)</button>
        <button class="dlive-sync-btn" onclick="adminForceFlsRefresh()" id="fls-force-btn" style="margin-top:6px;opacity:.85">⚠️ Forcer un refresh API (−1 appel)</button>
      </div>
      <div class="adm-comp-header"><span>⚽ Matchs à valider (${flsPending.length})</span></div>
      ${pendingCards}
    </div>`;
}

// Rematch local : relit le cache serveur, ne coûte aucun appel RapidAPI.
async function adminSyncFls(){
  const btn = $('fls-sync-btn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Matching…'; }
  try{ await syncFls(); toast('✅ Matching FLS terminé'); }
  catch(e){ toast('❌ Erreur de matching'); }
  if(adminOpen) renderAdminPanel();
}

// Refresh forcé de la liste côté serveur — dépense un appel du quota du jour,
// d'où la confirmation explicite.
async function adminForceFlsRefresh(){
  if(!confirm('Forcer un appel /all-match ?\n\nCela consomme 1 appel sur le quota quotidien.')) return;
  const btn = $('fls-force-btn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Appel en cours…'; }
  try{
    const r = await fetch('/api/fls/sync', {method:'POST'}).then(res=>res.json());
    if(r.quota) flsQuota = r.quota;
    toast(r.ok ? `✅ ${r.count??r.matches??0} matchs récupérés` : '⚠️ ' + (r.error||'échec'));
    await syncFls();
  }catch(e){ toast('❌ Erreur réseau'); }
  if(adminOpen) renderAdminPanel();
}

// ═══════════════════════════════════════════════════
// ── ADMIN — onglet Retours (bugs / failles / idées) ──
// ═══════════════════════════════════════════════════
let _fbItems = [];
let _fbOpenCount = 0;
let _fbFilter = 'open';
let _fbListenerOn = false;

function attachFeedbackListener(){
  if(!db || _fbListenerOn) return;
  _fbListenerOn = true;
  db.ref('feedback').limitToLast(200).on('value', snap => {
    const v = snap.val() || {};
    _fbItems = Object.keys(v).map(k => Object.assign({id:k}, v[k]));
    // Tri : d'abord les VIP (prioritaires), puis du plus récent au plus ancien
    _fbItems.sort((a,b) => (b.vip?1:0)-(a.vip?1:0) || (b.ts||0)-(a.ts||0));
    _fbOpenCount = _fbItems.filter(i => i.status !== 'done').length;
    if(adminOpen && adminTab === 'feedback') renderAdminPanel();
  }, err => console.warn('[feedback] lecture refusée:', err && err.message));
}
function loadAdminFeedback(){ attachFeedbackListener(); }

function setFbFilter(f){ _fbFilter = f; renderAdminPanel(); }

function fbSetStatus(id, status){
  if(!db) return;
  db.ref('feedback/'+id+'/status').set(status)
    .then(()=>toast(status==='done'?'✅ Marqué traité':'Rouvert'))
    .catch(()=>toast('Action refusée'));
}
function fbDelete(id){
  if(!db) return;
  if(!confirm('Supprimer définitivement ce signalement ?')) return;
  db.ref('feedback/'+id).remove()
    .then(()=>toast('Supprimé'))
    .catch(()=>toast('Suppression refusée'));
}
function fbOpenShot(src){
  const w = window.open('');
  if(w) w.document.write('<img src="'+src+'" style="max-width:100%">');
}

function renderAdminFeedback(){
  const TYPE = {bug:{l:'Bug',c:'#e5484d',i:'🐞'}, security:{l:'Faille',c:'#f59e0b',i:'🔐'}, idea:{l:'Idée',c:'#3b8bff',i:'💡'}};
  const list = _fbItems.filter(i => _fbFilter==='all' ? true : (_fbFilter==='done' ? i.status==='done' : i.status!=='done'));
  const counts = {
    open: _fbItems.filter(i=>i.status!=='done').length,
    done: _fbItems.filter(i=>i.status==='done').length,
  };
  return `
    <div class="fba-wrap">
      <div class="fba-filters">
        <button class="fba-filter${_fbFilter==='open'?' on':''}" onclick="setFbFilter('open')">À traiter (${counts.open})</button>
        <button class="fba-filter${_fbFilter==='done'?' on':''}" onclick="setFbFilter('done')">Traités (${counts.done})</button>
        <button class="fba-filter${_fbFilter==='all'?' on':''}" onclick="setFbFilter('all')">Tous (${_fbItems.length})</button>
      </div>
      ${!list.length ? '<div class="adm-empty" style="padding:36px 0">Aucun signalement ici</div>' : list.map(it => {
        const t = TYPE[it.type] || TYPE.bug;
        const when = it.ts ? new Date(it.ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        return `
        <div class="fba-card${it.status==='done'?' fba-done':''}">
          <div class="fba-top">
            <span class="fba-type" style="--tc:${t.c}">${t.i} ${t.l}</span>
            ${it.vip ? '<span class="fba-vip">VIP</span>' : ''}
            <span class="fba-date">${escHtml(when)}</span>
          </div>
          <div class="fba-title">${escHtml(it.title||'(sans titre)')}</div>
          <div class="fba-text">${escHtml(it.text||'')}</div>
          ${Array.isArray(it.shots)&&it.shots.length ? `<div class="fba-shots">${it.shots.map(sh=>`<img src="${escHtml(sh)}" onclick="fbOpenShot(this.src)" alt="">`).join('')}</div>` : ''}
          <div class="fba-meta">
            <span>${escHtml(it.pseudo||'?')}</span>
            ${it.email?`<span>· ${escHtml(it.email)}</span>`:''}
          </div>
          <div class="fba-actions">
            ${it.status==='done'
              ? `<button class="fba-btn" onclick="fbSetStatus('${it.id}','open')">↩ Rouvrir</button>`
              : `<button class="fba-btn fba-btn-ok" onclick="fbSetStatus('${it.id}','done')">✓ Traité</button>`}
            <button class="fba-btn fba-btn-del" onclick="fbDelete('${it.id}')">Supprimer</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function adminSyncDlive(){
  const btn = $('dlive-sync-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Synchronisation...'; }
  try{
    await fetch('/api/dlive/sync', {method:'POST'}); // force le serveur à refetch dlive
    await syncDlive(); // relance le matching côté client avec les données fraîches
    toast('✅ Sync dlive terminée');
  }catch(e){ toast('❌ Erreur de sync'); }
  if(adminOpen) renderAdminPanel();
}

const _admSelected={};
const _admSources={}; // {matchId:[{url,label},...]}

function closeAdminPanel(){
  adminOpen=false;
  applyStreams();
  renderContent();
}

function adminSetDate(dk){
  adminDate=dk;
  renderAdminPanel();
}

function toggleAdmMatch(id){
  const f=document.getElementById(`admf-${id}`);
  if(!f)return;
  const isOpen=f.style.display==='flex';
  document.querySelectorAll('.adm-match-form').forEach(el=>el.style.display='none');
  document.querySelectorAll('.adm-chevron').forEach(el=>el.style.transform='');
  if(!isOpen){
    f.style.display='flex';
    const chev=document.querySelector(`#adm-card-${id} .adm-chevron`);
    if(chev)chev.style.transform='rotate(180deg)';
  }
}

function admSelectChannel(id,url,name){
  if(!_admSources[id])_admSources[id]=[];
  const idx=_admSources[id].findIndex(s=>s.url===url);
  if(idx>=0){
    _admSources[id].splice(idx,1); // désélectionner
  } else {
    _admSources[id].push({url,label:name}); // ajouter
  }
  _admSelected[id]=url;
  // Update UI
  const form=document.getElementById(`admf-${id}`);
  if(!form)return;
  form.querySelectorAll('.adm-ch-btn[data-url]').forEach(btn=>{
    const sel=_admSources[id].some(s=>s.url===btn.dataset.url);
    const order=_admSources[id].findIndex(s=>s.url===btn.dataset.url);
    btn.classList.toggle('selected',sel);
    const badge=btn.querySelector('.adm-ch-badge');
    if(badge){badge.textContent=sel?order+1:'';badge.style.display=sel?'flex':'none';}
  });
  const counter=form.querySelector('.adm-src-count');
  const n=_admSources[id].length;
  if(counter)counter.textContent=n?`${n} source${n>1?'s':''} sélectionnée${n>1?'s':''}`:'Aucune source';
}

// ─── VÉRIFICATION DES SOURCES ────────────────────────
const _streamStatus={}; // {url: 'ok'|'fail'|'checking'|null}

async function checkUrl(url){
  if(!url) return 'fail';
  // Utiliser /check (endpoint dédié côté serveur) — /proxy est pour le streaming, pas la vérification
  try{
    const checkUrl=`/check?url=${encodeURIComponent(url)}`;
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),10000);
    const res=await fetch(checkUrl,{signal:ctrl.signal});
    clearTimeout(tid);
    if(!res.ok) return 'fail';
    const json=await res.json();
    return json.ok?'ok':'fail';
  }catch(e){
    return 'fail';
  }
}

async function admCheckSources(id){
  const s=streams[id];
  if(!s) return;
  const srcs=s.sources?.length?s.sources:[{url:s.url,label:s.label}];
  if(!srcs[0]?.url) return;

  const card=document.getElementById(`adm-card-${id}`);
  const dot=document.getElementById(`adm-dot-${id}`);

  // État "checking" sur la card
  if(card) card.dataset.status='checking';
  if(dot){dot.className='adm-status-dot checking';dot.title='Vérification...';}

  const results=await Promise.all(srcs.map(async(src,i)=>{
    _streamStatus[src.url]='checking';
    // Colorer le bouton ch-btn correspondant en "checking"
    const chBtn=document.querySelector(`#adm-card-${id} .adm-ch-btn[data-url="${CSS.escape(src.url)}"]`);
    if(chBtn) chBtn.dataset.srcStatus='checking';

    const status=await checkUrl(src.url);
    _streamStatus[src.url]=status;

    // Colorer le bouton ch-btn avec le résultat
    if(chBtn) chBtn.dataset.srcStatus=status;
    return status;
  }));

  const allOk=results.every(r=>r==='ok');
  const allFail=results.every(r=>r==='fail');
  const globalStatus=allOk?'ok':allFail?'fail':'partial';

  if(card) card.dataset.status=globalStatus;
  if(dot){
    dot.className=`adm-status-dot ${globalStatus}`;
    dot.title=allOk?'✅ Sources OK':allFail?'❌ Sources KO':'⚠️ Certaines KO';
  }
}

// Auto-tester tous les streams assignés quand le panel s'ouvre
async function admAutoCheck(){
  const dayMatches=data.byDate[adminDate]||[];
  const withStreams=dayMatches.filter(m=>streams[String(m.id)]);
  for(const m of withStreams){
    await admCheckSources(String(m.id));
  }
}

function admSaveCustom(id){
  const inp=document.getElementById(`admcustom-${id}`);
  const u=inp?.value.trim();
  if(!u){toast('❌ URL vide');return;}
  if(!_admSources[id])_admSources[id]=[];
  if(!_admSources[id].find(s=>s.url===u)){
    _admSources[id].push({url:u,label:'Custom'});
    toast('✅ URL ajoutée — Sauvegarder pour confirmer');
  } else {
    toast('URL déjà dans la liste');
  }
  inp.value='';
  const counter=document.querySelector(`#admf-${id} .adm-src-count`);
  const n=_admSources[id].length;
  if(counter)counter.textContent=`${n} source${n>1?'s':''} sélectionnée${n>1?'s':''}`;
}

function admSave(id){
  const srcs=[...(_admSources[id]||[])];
  const inp=document.getElementById(`admcustom-${id}`);
  const cu=inp?.value.trim();
  const vipChk=document.getElementById(`admvip-${id}`);
  const asVip=!!(vipChk&&vipChk.checked);
  if(cu&&!srcs.find(s=>s.url===cu)) srcs.push(asVip?{url:cu,label:'HD (VIP)',vipOnly:true}:{url:cu,label:'Custom'});
  if(!srcs.length){toast('❌ Sélectionne au moins une source');return;}
  const ts=Date.now();
  // activeIdx par défaut = première source NON VIP, pour que les visiteurs
  // sans abonnement ne tombent pas sur une source verrouillée.
  const defIdx=Math.max(0,srcs.findIndex(x=>!x.vipOnly));
  const obj={sources:srcs,activeIdx:defIdx,updatedAt:ts,url:srcs[defIdx].url,label:srcs[defIdx].label};

  // 1. Mémoire immédiate (AVANT Firebase pour bloquer la race condition)
  streams[id]=obj;
  _admSources[id]=[...srcs];
  try{localStorage.setItem('okin_streams',JSON.stringify(streams));}catch(e){}

  // 2. Sync match en mémoire
  const allM=Object.values(data.byDate).flat();
  const m=allM.find(x=>String(x.id)===id);
  if(m){m.streamUrl=srcs[defIdx].url;m.streamSources=srcs;m.streamActiveIdx=defIdx;}

  // 3. Mise à jour DOM chirurgicale sans full re-render
  admUpdateCardBadge(id, obj, srcs);

  // 4. Firebase async
  if(db)db.ref(`streams/${id}`).set(obj).catch(()=>{});

  toast(`✅ ${srcs.length} source${srcs.length>1?'s':''} sauvegardée${srcs.length>1?'s':''} !`);
  applyStreams();
}

// Met à jour visuellement une card admin sans re-render complet
function admUpdateCardBadge(id, obj, srcs){
  const card=document.getElementById(`adm-card-${id}`);
  if(!card) return;

  card.classList.add('has-stream');

  const footerRow=card.querySelector('.adm-match-footer-row');
  if(footerRow){
    const ch=ADMIN_CHANNELS.find(c=>c.url===obj.url);
    const chName=ch?.name||obj.label||'Custom';
    const chColor=ch?.color||'var(--acc)';
    footerRow.innerHTML=`
      <div class="adm-assigned-badge" style="--ch-color:${chColor}">
        <span class="adm-status-dot" id="adm-dot-${id}"></span>
        <span>${srcs.length>1?`${srcs.length} sources`:chName}</span>
      </div>
      <svg class="adm-chevron" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="transform:rotate(180deg)"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`;
  }

  const counter=document.querySelector(`#admf-${id} .adm-src-count`);
  const n=srcs.length;
  if(counter) counter.textContent=`${n} source${n>1?'s':''} sélectionnée${n>1?'s':''}`;

  const pillsEl=document.getElementById(`adm-pills-${id}`);
  if(pillsEl) pillsEl.innerHTML=srcs.map((src,i)=>`<span class="adm-src-pill">${i+1}. ${src.label}</span>`).join('');

  // Rafraîchir les stats
  const panelSub=document.querySelector('.adm-panel-subtitle');
  if(panelSub){
    const dayMatches=data.byDate[adminDate]||[];
    const sc=dayMatches.filter(m=>streams[String(m.id)]).length;
    const pct=dayMatches.length?Math.round(sc/dayMatches.length*100):0;
    panelSub.textContent=`${sc}/${dayMatches.length} streams — ${pct}%`;
    const fill=document.querySelector('.adm-progress-fill');
    if(fill) fill.style.width=pct+'%';
    const scEl=document.querySelector('.adm-stat-item:nth-child(2) .adm-stat-val');
    if(scEl) scEl.textContent=sc;
    const noScEl=document.querySelector('.adm-stat-item:nth-child(3) .adm-stat-val');
    if(noScEl) noScEl.textContent=dayMatches.length-sc;
  }

  setTimeout(()=>admCheckSources(id), 200);
}

function admDel(id){
  delete streams[id];
  delete _admSelected[id];
  delete _admSources[id];
  try{localStorage.setItem('okin_streams',JSON.stringify(streams));}catch(e){}
  const allM=Object.values(data.byDate).flat();
  const m=allM.find(x=>String(x.id)===id);
  if(m){delete m.streamUrl;delete m.streamSources;delete m.streamActiveIdx;}
  if(db)db.ref(`streams/${id}`).remove().catch(()=>{});
  toast('🗑 Stream supprimé');

  // DOM chirurgical
  const card=document.getElementById(`adm-card-${id}`);
  if(card){
    card.classList.remove('has-stream');
    const footerRow=card.querySelector('.adm-match-footer-row');
    if(footerRow){
      footerRow.innerHTML=`
        <div class="adm-no-stream">Aucun stream</div>
        <svg class="adm-chevron" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`;
    }
  }
  // Rafraîchir les stats
  const panelSub=document.querySelector('.adm-panel-subtitle');
  if(panelSub){
    const dayMatches=data.byDate[adminDate]||[];
    const sc=dayMatches.filter(m=>streams[String(m.id)]).length;
    const pct=dayMatches.length?Math.round(sc/dayMatches.length*100):0;
    panelSub.textContent=`${sc}/${dayMatches.length} streams — ${pct}%`;
    const fill=document.querySelector('.adm-progress-fill');
    if(fill) fill.style.width=pct+'%';
  }
}



// ─── NAV INIT ────────────────────────────────────────
// ─── INIT ────────────────────────────────────────────
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// ─── PAGE CLUB ───────────────────────────────────
// ═══════════════════════════════════════════════════
let clubOpen=false;

// Mapping compId → ligue nationale (pour détecter si équipe est dans cette ligue)
const LEAGUE_COMPS={PL:39,PD:140,BL1:78,SA:135,FL1:61,PPL:94,DED:88};
const CL_ID='CL'; // football-data id pour Champions League

function openClub(team, compId){
  if(!team)return;
  clubOpen=true;
  const ov=document.getElementById('club-ov');
  ov.classList.add('open');
  document.body.style.overflow='hidden';
  // Rebind le bouton retour à chaque ouverture
  const backBtn=document.getElementById('club-back');
  if(backBtn){ backBtn.onclick=closeClub; }
  // Reset
  document.getElementById('club-hero-name').textContent=team.shortName||team.name||'—';
  document.getElementById('club-hero-country').textContent=team.area?.name||'';
  const crestEl=document.getElementById('club-hero-crest');
  crestEl.innerHTML=team.crest
    ?`<img src="${team.crest}" alt="" onerror="this.style.display='none'">`
    :`<div class="cp" style="font-size:20px;font-weight:900">${abbr(team.name||'')}</div>`;
  document.getElementById('club-loading').style.display='flex';
  document.getElementById('club-content').style.display='none';
  document.getElementById('club-content').innerHTML='';
  loadClubData(team, compId);
}

function closeClub(){
  clubOpen=false;
  const ov=document.getElementById('club-ov');
  ov.style.animation='clubOut .2s var(--ease) both';
  setTimeout(()=>{ov.classList.remove('open');ov.style.animation='';document.body.style.overflow='';},200);
}

async function loadClubData(team, compId){
  const teamId=team.id;
  if(!teamId){showClubContent(`<div class="club-empty">Données indisponibles</div>`);return;}

  // Déterminer quels classements charger
  // 1. Ligue du match cliqué (compId)
  // 2. Champions League si l'équipe y participe (on essaie toujours)
  const requests=[
    fdFetch(`/teams/${teamId}/matches?status=SCHEDULED&limit=5`),
    fdFetch(`/teams/${teamId}/matches?status=FINISHED&limit=5`),
    compId&&compId!==CL_ID ? fdFetch(`/competitions/${compId}/standings`) : Promise.resolve(null),
    fdFetch(`/competitions/${CL_ID}/standings`)
  ];

  const [upcoming, past, leagueStanding, clStanding]=await Promise.allSettled(requests)
    .then(r=>r.map(x=>x.status==='fulfilled'?x.value:null));

  let html='';

  // ── Prochains matchs ──
  const upMatches=(upcoming?.matches||[]).slice(0,5);
  html+=`<div class="cs"><div class="cs-title">Prochains matchs</div>`;
  html+=upMatches.length
    ? upMatches.map(m=>clubRow(m,teamId)).join('')
    : `<div class="cs-empty">Aucun match programmé</div>`;
  html+=`</div>`;

  // ── Derniers résultats ──
  const pastMatches=(past?.matches||[]).slice().reverse().slice(0,5);
  html+=`<div class="cs"><div class="cs-title">Derniers résultats</div>`;
  html+=pastMatches.length
    ? pastMatches.map(m=>clubRow(m,teamId)).join('')
    : `<div class="cs-empty">Aucun résultat récent</div>`;
  html+=`</div>`;

  // ── Classement ligue ──
  if(leagueStanding?.standings){
    html+=renderStanding(leagueStanding, teamId);
  }

  // ── Classement Champions League ──
  if(clStanding?.standings){
    // Vérifier si l'équipe est dans le classement CL
    const allCLTeams=(clStanding.standings||[]).flatMap(g=>g.table||[]);
    const inCL=allCLTeams.some(r=>r.team?.id===teamId);
    if(inCL) html+=renderStanding(clStanding, teamId);
  }

  showClubContent(html);
}

function clubRow(m, teamId){
  const isHome=m.homeTeam?.id===teamId;
  const opp=isHome?m.awayTeam:m.homeTeam;
  const oppName=opp?.shortName||opp?.name||'—';
  const fin=m.status==='FINISHED';
  const ft=m.score?.fullTime;
  let score='', result='';
  if(fin&&ft?.home!=null){
    const gs=isHome?ft.home:ft.away, gc=isHome?ft.away:ft.home;
    score=`${gs}–${gc}`;
    result=gs>gc?'W':gs<gc?'L':'D';
  }
  const date=m.utcDate?new Date(m.utcDate):null;
  const dateStr=date?date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}):'';
  const timeStr=date?date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
  const loc=isHome?'D':'E';
  return`<div class="cr">
    <span class="cr-loc">${loc}</span>
    ${opp?.crest?`<img class="cr-crest" src="${opp.crest}" alt="" onerror="this.style.display='none'">`:
      `<div class="cr-crest-fb">${abbr(oppName)}</div>`}
<span class="cr-name">${oppName}</span>
    <span class="cr-score${fin?result==='W'?' win':result==='L'?' loss':' draw':''}">${fin?score:timeStr||'—'}</span>
    <span class="cr-date">${dateStr}</span>
  </div>`;
}

function renderStanding(data, teamId){
  const comp=data.competition?.name||'';
  // Groupes (CL) ou tableau simple
  const standings=data.standings||[];
  let html=`<div class="cs"><div class="cs-title">${comp}</div>`;

  for(const group of standings){
    const table=group.table||[];
    if(!table.length)continue;
    const hasTeam=table.some(r=>r.team?.id===teamId);
    // Pour CL avec groupes : afficher seulement le groupe de l'équipe
    if(standings.length>1&&!hasTeam)continue;
    if(group.group)html+=`<div class="cs-group">${group.group.replace('GROUP_','Groupe ')}</div>`;
html+=table.map(r=>{
const isTeam=r.team?.id===teamId;
return`<div class="sr${isTeam?' me':''}">
<span class="sr-pos">${r.position}</span>
${r.team?.crest?`<img class="sr-crest" src="${r.team.crest}" alt="" onerror="this.style.display='none'">`:
          `<div class="sr-crest-fb">${abbr(r.team?.name||'')}</div>`}
        <span class="sr-name">${r.team?.shortName||r.team?.name||'—'}</span>
        <span class="sr-gd">${r.goalDifference>0?'+'+r.goalDifference:r.goalDifference}</span>
<span class="sr-pts">${r.points}</span>
      </div>`;
    }).join('');
  }
  html+=`</div>`;
  return html;
}

function showClubContent(html){
document.getElementById('club-loading').style.display='none';
  const content=document.getElementById('club-content');
  content.innerHTML=html;
  content.style.display='block';
}

document.getElementById('club-back')?.addEventListener('click', closeClub);

// Ajouter keyframe clubOut au style
const clubStyle = document.createElement('style');
clubStyle.textContent = '@keyframes clubOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(18px)}}';
document.head.appendChild(clubStyle);


// ─── PULL TO REFRESH ─────────────────────────────────
(function initPullToRefresh(){
const el=$('scroll');
  if(!el) return;
  let startY=0, pulling=false, triggered=false;
  const THRESHOLD=140; // tirage franc requis avant déclenchement (était 72 — beaucoup trop sensible)
  const START_MOVE=42; // ignore les micro-mouvements (~quelques mm) avant même de commencer à réagir visuellement

// Injecter CSS
  const s=document.createElement('style');
  s.textContent=`
#ptr-pill{position:absolute;top:10px;left:50%;transform:translateX(-50%) translateY(-60px) scale(0.7);opacity:0;pointer-events:none;z-index:20;
      display:flex;align-items:center;gap:7px;padding:7px 14px 7px 10px;background:var(--s3);
      border:1px solid var(--line2);border-radius:99px;white-space:nowrap;
      transition:opacity .22s var(--ease),transform .28s var(--spring);will-change:transform,opacity}
#ptr-pill.visible{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
    #ptr-pill.ready{background:var(--acc);border-color:var(--acc)}
    #ptr-pill.ready #ptr-lbl{color:var(--bg)}
    #ptr-pill.ready #ptr-ring{border-color:var(--bg);border-top-color:var(--bg)}
    #ptr-pill.bouncing{animation:ptr-bounce .35s var(--spring) both}
    @keyframes ptr-bounce{0%{transform:translateX(-50%) scale(1.08)}60%{transform:translateX(-50%) scale(0.88)}100%{transform:translateX(-50%) translateY(-60px) scale(0.7);opacity:0}}
    #ptr-ring{width:16px;height:16px;border-radius:50%;border:2px solid var(--t3);border-top-color:var(--acc);flex-shrink:0;transition:transform .25s var(--ease),border-color .2s}
    #ptr-ring.spin{animation:ptr-spin .6s linear infinite}
    @keyframes ptr-spin{to{transform:rotate(360deg)}}
    #ptr-lbl{font-size:12px;font-weight:600;color:var(--t2);transition:color .2s}
`;
  document.head.appendChild(s);

  const pill=document.createElement('div');
  pill.id='ptr-pill';
pill.innerHTML='<div id="ptr-ring"></div><span id="ptr-lbl">Tirer pour actualiser</span>';
  el.style.position='relative';
  el.insertBefore(pill,el.firstChild);

  const ring=pill.querySelector('#ptr-ring');
  const lbl=pill.querySelector('#ptr-lbl');

  el.addEventListener('touchstart',e=>{
    if(el.scrollTop===0){startY=e.touches[0].clientY;triggered=false;}
    else startY=0;
  },{passive:true});

  el.addEventListener('touchmove',e=>{
    if(!startY)return;
    const dy=e.touches[0].clientY-startY;
    if(dy>START_MOVE&&el.scrollTop===0){
      pulling=true;
      const pct=Math.min((dy-START_MOVE)/(THRESHOLD-START_MOVE),1);
      const ready=pct>=1;
      pill.classList.toggle('visible',pct>0.2);
      pill.classList.toggle('ready',ready);
ring.style.transform=`rotate(${pct*300}deg)`;
      lbl.textContent=ready?'Relâcher pour actualiser':'Tirer pour actualiser';
}
},{passive:true});

  el.addEventListener('touchend',e=>{
    if(!pulling){startY=0;return;}
    const dy=e.changedTouches[0].clientY-startY;
    pulling=false;startY=0;
const shouldRefresh=dy>=THRESHOLD;
    if(shouldRefresh){
      // Animation spin + feedback haptique
      ring.classList.add('spin');
      haptic(20);
      toast('Actualisation…');
      loadMatches();
setTimeout(()=>{
        ring.classList.remove('spin');
        pill.classList.remove('visible','ready');
        pill.classList.add('bouncing');
setTimeout(()=>pill.classList.remove('bouncing'),400);
      },800);
} else {
      // Relâché trop tôt — retract sans actualiser
      pill.classList.remove('visible','ready');
    }
  },{passive:true});
})();

// ─── BOUTON RETOUR ANDROID ───────────────────────────
window.addEventListener('popstate', ()=>{
  if(clubOpen)          { closeClub();     history.pushState(null,'',''); return; }
  if(document.getElementById('modal')?.classList.contains('open')) { closeSingle(); history.pushState(null,'',''); return; }
  if(tvGroupOpen)        { closeTVGroup();   history.pushState(null,'',''); return; }
  if(multiOpen)         { closeMulti();    history.pushState(null,'',''); return; }
if(document.getElementById('settings-drawer')?.classList.contains('open')) { closeSettings(); history.pushState(null,'',''); return; }
});
// Pousser un état initial pour intercepter le premier retour
history.pushState(null,'','');


// ─── PAGES LÉGALES ───────────────────────────────────
const LEGAL_CONTENT = {
  cgu: {
    title: "Conditions d'utilisation",
    html: `
      <div class="legal-hero">
        <div class="legal-hero-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-2 9H7v-2h4v2zm4-4H7v-2h8v2zm0-4H7V8h8v2z"/></svg></div>
        <div class="legal-hero-title">Conditions d'utilisation</div>
        <div class="legal-hero-date">En vigueur depuis le 1er janvier 2026 · Version 1.0</div>
      </div>
      <div class="legal-highlight">
        <div class="legal-highlight-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></div>
        <div class="legal-highlight-text">En utilisant Okin Stream, vous acceptez les présentes conditions. <strong>L'application est fournie gratuitement</strong> et n'héberge aucun contenu vidéo.</div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>Présentation du service</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Qu'est-ce qu'Okin Stream ?</div>
            <div class="legal-card-row-body">Okin Stream est une application web permettant de suivre les matchs de football en direct : scores, compositions, horaires et accès à des flux vidéo. Elle agrège des données publiques issues de services tiers.</div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Accès au service</div>
            <div class="legal-card-row-body">L'accès à Okin Stream est libre et gratuit. Aucun compte ni inscription n'est requis. L'application est accessible via navigateur web (iOS Safari, Chrome Android, etc.).</div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/></svg>Responsabilités</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Flux vidéo</div>
            <div class="legal-card-row-body">Okin Stream ne stocke, n'héberge ni ne retransmet aucun contenu vidéo. Les flux sont fournis par des sources tierces externes. Leur disponibilité, légalité et qualité relèvent de l'entière responsabilité de leurs diffuseurs.</div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Données sportives</div>
            <div class="legal-card-row-body">Les scores et résultats proviennent d'API tierces (football-data.org, api-sports.io). Okin Stream ne garantit pas l'exactitude ou la complétude de ces informations en temps réel.</div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Propriété intellectuelle</div>
            <div class="legal-card-row-body">Les logos, emblèmes et marques des clubs et ligues sont la propriété exclusive de leurs détenteurs. Okin Stream n'est affilié à aucune ligue, fédération ou club sportif.</div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>Règles d'utilisation</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-body">
              <div class="legal-list">
                <div class="legal-list-item"><div class="legal-list-dot"></div>L'utilisation d'Okin Stream est strictement personnelle et non commerciale.</div>
                <div class="legal-list-item"><div class="legal-list-dot"></div>Toute reproduction ou redistribution du code est interdite.</div>
                <div class="legal-list-item"><div class="legal-list-dot"></div>Toute utilisation automatisée (bots, scrapers) est interdite.</div>
                <div class="legal-list-item"><div class="legal-list-dot"></div>Okin Stream se réserve le droit de modifier ou interrompre le service à tout moment.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/></svg>Droit applicable</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-body">Les présentes conditions sont soumises au droit français. Tout litige sera de la compétence exclusive des tribunaux français. Les modifications entrent en vigueur dès leur publication.</div>
          </div>
        </div>
      </div>
      <div class="legal-footer">
        <div class="legal-footer-logo">OKIN STREAM</div>
        <div class="legal-footer-copy">© 2026 Okin Stream · Tous droits réservés</div>
        <div class="legal-footer-contact"><a href="mailto:okinstreamssf@gmail.com" style="color:inherit">okinstreamssf@gmail.com</a></div>
      </div>`
  },
  privacy: {
    title: "Politique de confidentialité",
    html: `
      <div class="legal-hero">
        <div class="legal-hero-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4.5l5 2.2V11c0 3.54-2.45 6.86-5 7.93-2.55-1.07-5-4.39-5-7.93V7.7l5-2.2z"/></svg></div>
        <div class="legal-hero-title">Confidentialité</div>
        <div class="legal-hero-date">Mise à jour le 1er janvier 2026 · RGPD conforme</div>
      </div>
      <div class="legal-highlight">
        <div class="legal-highlight-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
        <div class="legal-highlight-text"><strong>Okin Stream ne collecte aucune donnée personnelle.</strong> Aucun compte, aucun tracking, aucune pub. Vos données restent sur votre appareil.</div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>Données collectées</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--green)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Aucune donnée personnelle</div>
            <div class="legal-card-row-body">Okin Stream ne collecte, ne traite et ne transmet aucune donnée permettant de vous identifier : pas de nom, pas d'email, pas d'IP stockée, pas de localisation.</div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Stockage local uniquement</div>
            <div class="legal-card-row-body">Vos préférences (thème, favoris, filtres) sont sauvegardées <strong>uniquement sur votre appareil</strong> via le localStorage de votre navigateur. Ces données ne quittent jamais votre téléphone.</div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2z"/></svg>Services tiers</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>Firebase (Google)</div>
            <div class="legal-card-row-body">Utilisé exclusivement pour synchroniser les URLs de streams. Aucune donnée utilisateur transmise. <a href="https://firebase.google.com/support/privacy" target="_blank" style="color:var(--acc)">Politique Firebase →</a></div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--acc)"><circle cx="12" cy="12" r="10"/></svg>football-data.org / api-sports.io</div>
            <div class="legal-card-row-body">Ces API fournissent les données de matchs. Les requêtes contiennent uniquement les paramètres nécessaires — aucune information personnelle transmise.</div>
          </div>
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:#ff0000"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14c-1.88-.5-9.38-.5-9.38-.5s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81z"/></svg>YouTube (Google)</div>
            <div class="legal-card-row-body">Les résumés de matchs utilisent l'API YouTube. Les recherches sont soumises à la <a href="https://policies.google.com/privacy" target="_blank" style="color:var(--acc)">politique de confidentialité Google</a>.</div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>Vos droits (RGPD)</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-body">
              Puisqu'aucune donnée personnelle n'est collectée, les droits RGPD s'appliquent uniquement aux services tiers.
              <div class="legal-list" style="margin-top:10px">
                <div class="legal-list-item"><div class="legal-list-dot"></div>Favoris et préférences : effaçables dans Paramètres → Effacer les favoris</div>
                <div class="legal-list-item"><div class="legal-list-dot"></div>Données Firebase : aucune donnée personnelle stockée</div>
                <div class="legal-list-item"><div class="legal-list-dot"></div>Données YouTube/Google : gérables via votre compte Google</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="legal-section">
        <div class="legal-section-title"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/></svg>Cookies et traceurs</div>
        <div class="legal-card">
          <div class="legal-card-row">
            <div class="legal-card-row-title"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="color:var(--green)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Aucun cookie tiers</div>
            <div class="legal-card-row-body">Okin Stream n'utilise aucun cookie publicitaire ni traceur de comportement. Le localStorage est utilisé uniquement pour vos préférences locales. Aucune donnée n'est transmise à des tiers à des fins marketing.</div>
          </div>
        </div>
      </div>
      <div class="legal-footer">
        <div class="legal-footer-logo">OKIN STREAM</div>
        <div class="legal-footer-copy">© 2026 Okin Stream · Application non lucrative<br>Données hébergées en France / UE</div>
        <div class="legal-footer-contact"><a href="mailto:okinstreamssf@gmail.com" style="color:inherit">okinstreamssf@gmail.com</a></div>
      </div>`
  }
};

function openLegal(type) {
  const ov = document.getElementById('legal-ov');
  const content = LEGAL_CONTENT[type];
  if (!ov || !content) return;
  document.getElementById('legal-head-title').textContent = content.title;
  document.getElementById('legal-scroll').innerHTML = content.html;
  ov.style.display = 'flex';
  document.getElementById('legal-scroll').scrollTop = 0;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { ov.style.transform = 'translateX(0)'; });
  });
  document.body.style.overflow = 'hidden';
}

function closeLegal() {
  const ov = document.getElementById('legal-ov');
  if (!ov) return;
  ov.style.transform = 'translateX(100%)';
  setTimeout(() => { ov.style.display = 'none'; ov.style.transform = ''; document.body.style.overflow = ''; }, 300);
}


// ═══════════════════════════════════════════════════
// ─── SYSTÈME VIP ─────────────────────────────────
// ═══════════════════════════════════════════════════

// ─── PAIEMENT PAYPAL ─────────────────────────────
// Offre unique : 5€ / an — ⚠️ REMPLACE le lien ci-dessous par ton vrai lien
// de paiement PayPal (bouton "Payer avec PayPal" créé sur paypal.com/ncp).
function startPaymentAnnual(){
  window.open('https://www.paypal.com/ncp/payment/REMPLACE_MOI_5AN', '_blank');
}

// isVIP() ne lit QUE le cache maintenu par le listener Firebase live (vipLive).
// Plus aucune confiance accordée à localStorage seul → impossible de se faire
// VIP en tapant 2 lignes dans la console du navigateur.
function isVIP(){
  return vipLive.active && vipLive.exp > Date.now();
}

function updateVIPCard(){
  const title=document.getElementById('vip-card-title');
  const sub=document.getElementById('vip-card-sub');
  const badge=document.getElementById('vip-badge-txt');
  const card=document.querySelector('.vip-card');
  if(!title)return;
  if(isVIP()){
    title.textContent='VIP Actif ✓';
    sub.textContent='Accès Premium · Sans pub';
    if(badge)badge.textContent='Gérer';
    if(card)card.classList.add('vip-active');
  }else{
    title.textContent='Passer en VIP';
    sub.textContent='Accès illimité · Sans pub';
    if(badge)badge.textContent='Voir les offres';
    if(card)card.classList.remove('vip-active');
  }
}
function openVIP(){
  const ov=document.getElementById('vip-ov');
  if(!ov)return;
  updateVIPOv();
  ov.classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(()=>{ if(typeof renderPaypalBtn==='function') renderPaypalBtn(); }, 100);
}
function closeVIP(){
  const ov=document.getElementById('vip-ov');
  if(!ov)return;
  ov.classList.remove('open');
  document.body.style.overflow='';
  updateVIPCard();
}
function updateVIPOv(){
  const statusEl=document.getElementById('vip-status-block');
  const offersEl=document.getElementById('vip-offers-block');
  const keyBlock=document.getElementById('vip-key-block');
  if(!statusEl||!offersEl)return;
  if(isVIP()){
    const expTxt = vipLive.exp && vipLive.exp!==Infinity ? new Date(vipLive.exp).toLocaleDateString('fr-FR') : 'Illimité';
    statusEl.style.display='';
    statusEl.innerHTML=`<div class="vip-status-active">
      <div class="vip-status-crown"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg></div>
      <div class="vip-status-info"><div class="vip-status-title">VIP Actif</div><div class="vip-status-exp">Expire le ${expTxt}</div></div>
      <div class="vip-status-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg></div>
    </div>`;
    // Les avantages ne sont plus répétés ici : la liste détaillée plus bas
    // (vip-perks-list) fait déjà le travail, les afficher deux fois alourdissait
    // le haut de la page pour rien.
    // Offres et champ clé toujours visibles même si VIP actif
    offersEl.style.display='';
    if(keyBlock)keyBlock.style.display='';
  }else{
    statusEl.style.display='none';
    offersEl.style.display='';
    if(keyBlock)keyBlock.style.display='';
  }
}

// ── Activation d'une clé VIP ──
// Toute la validation (clé valide ? pas déjà utilisée ? calcul de l'expiration ?
// marquage "utilisée") se fait maintenant sur le SERVEUR (avec le secret admin),
// jamais côté client. Le compte doit être connecté : sans compte, il n'existe
// aucun endroit fiable où stocker un statut VIP qui résiste à un utilisateur
// qui modifierait son navigateur.
function activateVIPKey(){
  if(!currentUser){
    toast('🔒 Connecte-toi d\'abord pour activer une clé VIP');
    closeVIP();
    openAuthModal('login');
    return;
  }
  var input = document.getElementById('vip-key-input');
  if(!input) return;
  var key = input.value.trim().toUpperCase();
  if(!key){ toast('Entre une clé VIP'); return; }
  var btn = document.querySelector('.vip-key-submit');
  if(btn){ btn.disabled=true; btn.style.opacity='.5'; }
  var reset = function(){ if(btn){ btn.disabled=false; btn.style.opacity='1'; } };

  fetch('/api/vip/activate', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({key, uid: currentUser.uid, email: currentUser.email})
  })
    .then(r => r.json())
    .then(json => {
      reset();
      if(!json.ok){
        const messages = {
          not_found: 'Clé invalide', disabled: 'Clé désactivée',
          already_used: 'Clé déjà utilisée', invalid_input: 'Clé invalide',
          rate_limited: 'Trop de tentatives, réessaie dans quelques minutes',
          // Le serveur n'a pas pu écrire dans Firebase (secret absent/expiré) :
          // on le dit clairement au lieu d'annoncer un faux succès.
          write_failed: 'Erreur serveur — la clé n\'a pas pu être activée, contacte le support',
        };
        toast('❌ ' + (messages[json.error] || 'Erreur de vérification'));
        if(json.error === 'write_failed') console.error('[VIP] write_failed:', json.detail);
        return;
      }
      // vipLive sera mis à jour automatiquement par le listener live sur users/{uid}/vip
      // (écrit par le serveur) — pas besoin de le faire à la main ici.
      closeVIP();
      showVIPActivationScreen();
    })
    .catch(function(){
      reset();
      toast('❌ Impossible de contacter le serveur');
    });
}
function logoutVIP(){
  toast('Pour retirer ton VIP, contacte un administrateur');
  closeVIP();
}


// ═══════════════════════════════════════════════════
// ─── GATE PUBLICITAIRE ────────────────────────────
// ═══════════════════════════════════════════════════
const AD_URL = 'https://www.propellerads.com'; // ← Remplace par ton lien PropellerAds

let _adPendingMatch = null;

function showAdGate(m){
  if(isVIP()){ _launchStream(m); return; }
  _adPendingMatch = m;
  const gate = document.getElementById('ad-gate');
  if(!gate) return;
  gate.classList.add('open');

  const onReturn = () => {
    if(document.visibilityState === 'visible'){
      document.removeEventListener('visibilitychange', onReturn);
      closeAdGate(true);
    }
  };
  document.addEventListener('visibilitychange', onReturn);
}

function closeAdGate(launch){
  const gate = document.getElementById('ad-gate');
  if(!gate) return;
  gate.classList.remove('open');
  if(launch && _adPendingMatch){
    const m = _adPendingMatch;
    _adPendingMatch = null;
    setTimeout(()=> openSingle(m, true), 200);
  } else {
    _adPendingMatch = null;
  }
}

function openAd(){
  window.open(AD_URL, '_blank', 'noopener');
}

function _launchStream(m){ openSingle(m, true); }

// ═══════════════════════════════════════════════════
// ─── ADMIN VIP — GESTION DES CLÉS ────────────────
// ═══════════════════════════════════════════════════

function generateVIPKey(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg=n=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  return `OKIN-${seg(4)}-${seg(4)}-${seg(4)}`;
}

// ═══════════════════════════════════════════════════
// ─── ADMIN — GESTION DES ADMINISTRATEURS ─────────
// ═══════════════════════════════════════════════════
// Seul le propriétaire (isOwner()) peut nommer/retirer un admin — imposé
// aussi côté Firebase (règles ".write" sur /admins). Les admins promus voient
// la liste mais n'ont pas les boutons pour la modifier.
function renderAdminUsers(){
  return `<div id="adm-users-wrap">
    <div class="adm-users-my-id">
      <div class="adm-users-my-id-label">Ton identifiant (à donner aux autres si besoin)</div>
      <div class="adm-users-my-id-val" onclick="copyMyUid()">${currentUser?escHtml(currentUser.uid):''}</div>
    </div>
    ${isOwner() ? `
    <div class="adm-vip-gen-block">
      <div class="adm-vip-gen-title">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        Promouvoir un administrateur
      </div>
      <div class="adm-vip-gen-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <input id="adm-new-admin-uid" class="adm-custom" placeholder="Identifiant de l'utilisateur (collé depuis son compte)" style="width:100%">
        <input id="adm-new-admin-label" class="adm-custom" placeholder="Pseudo / note pour t'en souvenir (optionnel)" style="width:100%">
        <button class="adm-save-btn" onclick="admPromoteUser()">
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          Promouvoir admin
        </button>
      </div>
    </div>` : `<div class="adm-users-readonly-note">Seul le propriétaire du site peut ajouter ou retirer un administrateur.</div>`}
    <div class="adm-vip-keys-list" id="adm-users-list">
      <div class="adm-empty" style="padding:30px 0"><div class="spinner"></div></div>
    </div>
  </div>`;
}

function loadAdminUsersList(){
  var wrap = document.getElementById('adm-users-list');
  if(!wrap) return;
  wrap.innerHTML = '<div class="adm-empty" style="padding:30px 0"><div class="spinner"></div></div>';
  fbFetch('/admins.json')
    .then(r=>r.json())
    .then(data=>{
      const entries = Object.entries(data||{});
      if(!entries.length){ wrap.innerHTML = '<div class="adm-empty" style="padding:30px 0">Aucun administrateur promu</div>'; return; }
      wrap.innerHTML = entries.map(([uid, info])=>{
        const label = info?.label ? escHtml(info.label) : 'Sans nom';
        const addedTxt = info?.addedAt ? new Date(info.addedAt).toLocaleDateString('fr-FR') : '';
        return `<div class="adm-vip-key-row">
          <div class="adm-vip-key-top">
            <div class="adm-vip-key-code">${label}</div>
          </div>
          <div class="adm-vip-key-meta">
            <span>🆔 ${escHtml(uid.slice(0,14))}…</span>
            <span>🕐 Promu le ${addedTxt}</span>
          </div>
          ${isOwner() ? `<div class="adm-vip-key-actions">
            <button class="adm-del-btn" onclick="admRemoveAdmin('${uid}','${label.replace(/'/g,"\\'")}')" style="flex:1;justify-content:center;gap:6px;font-size:12px;background:rgba(255,59,59,.08);border-color:rgba(255,59,59,.2);color:var(--red)">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>
              Retirer les droits admin
            </button>
          </div>` : ''}
        </div>`;
      }).join('');
    })
    .catch(()=>{ wrap.innerHTML = '<div class="adm-empty" style="padding:30px 0">Erreur de chargement</div>'; });
}

function admPromoteUser(){
  if(!isOwner()){ toast('❌ Réservé au propriétaire'); return; }
  const uidInput = document.getElementById('adm-new-admin-uid');
  const labelInput = document.getElementById('adm-new-admin-label');
  // On nettoie : espaces, et une éventuelle ellipse "…" collée par erreur
  // depuis un identifiant tronqué ailleurs.
  let uid = (uidInput?.value || '').trim().replace(/[…\s]+$/,'');
  const label = labelInput?.value.trim() || 'Sans nom';
  // Les UID Firebase Auth font typiquement 28 caractères — sous 20, c'est
  // presque toujours un identifiant tronqué copié à la main par erreur.
  if(!uid || uid.length < 20){
    toast('❌ Identifiant incomplet — utilise le bouton "copier" depuis la page Compte de la personne');
    return;
  }
  fbFetch('/admins/'+uid+'.json', {
    method:'PUT',
    body: JSON.stringify({ label, addedAt: Date.now(), addedByEmail: currentUser.email }),
    headers:{'Content-Type':'application/json'}
  })
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(()=>{
      toast('✅ '+label+' est maintenant administrateur');
      if(uidInput) uidInput.value='';
      if(labelInput) labelInput.value='';
      loadAdminUsersList();
    })
    .catch(()=> toast('❌ Erreur — vérifie l\'identifiant'));
}

function admRemoveAdmin(uid, label){
  if(!isOwner()){ toast('❌ Réservé au propriétaire'); return; }
  if(!confirm('Retirer les droits admin de '+label+' ?')) return;
  fbFetch('/admins/'+uid+'.json', {method:'DELETE'})
    .then(()=>{ toast('✅ Droits admin retirés'); loadAdminUsersList(); })
    .catch(()=> toast('❌ Erreur'));
}

function renderAdminVIP(){
  return `<div id="adm-vip-wrap">
    <div class="adm-vip-gen-block">
      <div class="adm-vip-gen-title">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
        Générer une nouvelle clé VIP
      </div>
      <div class="adm-vip-gen-row">
        <select id="adm-vip-duration" class="adm-vip-select">
          <option value="30">30 jours</option>
          <option value="60">60 jours</option>
          <option value="90">90 jours</option>
          <option value="183">6 mois</option>
          <option value="365">1 an</option>
        </select>
        <button class="adm-save-btn" onclick="admGenerateVIPKey()" style="flex:1">
          <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
          Générer
        </button>
      </div>
    </div>
    <!-- Recherche d'un utilisateur par son identifiant -->
    <div class="adm-lookup-block">
      <div class="adm-vip-gen-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Rechercher un utilisateur
      </div>
      <div class="adm-vip-gen-row">
        <input id="adm-lookup-input" class="adm-lookup-input" type="text" placeholder="Coller un ID utilisateur…" autocomplete="off" spellcheck="false"
               onkeydown="if(event.key==='Enter'){event.preventDefault();admLookupUser();}">
        <button class="adm-save-btn" onclick="admLookupUser()" id="adm-lookup-btn">Chercher</button>
      </div>
      <div id="adm-lookup-result" class="adm-lookup-result"></div>
    </div>

    <div class="adm-vip-keys-list" id="adm-vip-keys-list">
      <div class="adm-empty" style="padding:30px 0"><div class="spinner"></div></div>
    </div>
  </div>`;
}

function loadAdminVIPKeys(){
  var wrap = document.getElementById('adm-vip-keys-list');
  if(!wrap) return;
  wrap.innerHTML = '<div class="adm-empty" style="padding:30px 0"><div class="spinner"></div></div>';
  fbFetch('/vip_keys.json')
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(all){
      var cur = document.getElementById('adm-vip-keys-list');
      if(!cur) return;
      if(!all || typeof all !== 'object'){
        cur.innerHTML = '<div class="adm-empty" style="padding:24px 0;font-size:13px">Aucune clé générée</div>';
        return;
      }
      var entries = Object.keys(all).map(function(k){ return [k, all[k]]; })
                      .sort(function(a,b){ return (b[1].createdAt||0)-(a[1].createdAt||0); });
      if(!entries.length){
        cur.innerHTML = '<div class="adm-empty" style="padding:24px 0;font-size:13px">Aucune clé générée</div>';
        return;
      }
      cur.innerHTML = entries.map(function(p){ return renderVIPKeyRow(p[0], p[1]); }).join('');
    })
    .catch(function(err){
      var cur = document.getElementById('adm-vip-keys-list');
      if(!cur) return;
      cur.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--red)">'
        + '❌ Erreur lecture (' + (err.message||'') + ')<br><br>'
        + '<button onclick="loadAdminVIPKeys()" style="color:var(--acc);background:none;border:none;cursor:pointer;font-weight:700">↻ Réessayer</button></div>';
    });
}

// ── Recherche d'un utilisateur par son identifiant (admin) ──
// Passe par le serveur : les règles Firebase interdisent à un admin de lire
// depuis le navigateur le nœud d'un autre utilisateur.
async function admLookupUser(uid){
  const inp = document.getElementById('adm-lookup-input');
  const target = (uid || (inp && inp.value) || '').trim();
  const out = document.getElementById('adm-lookup-result');
  if(!out) return;
  if(uid && inp) inp.value = uid;      // clic depuis une clé : on remplit le champ
  if(!target){ out.innerHTML = '<div class="adm-lk-hint">Entre un identifiant utilisateur</div>'; return; }

  out.innerHTML = '<div class="adm-lk-loading"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div></div>';
  try{
    const token = await getAuthToken();
    if(!token){ out.innerHTML = '<div class="adm-lk-err">Session expirée, reconnecte-toi</div>'; return; }
    const res = await fetch('/api/admin/lookup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ idToken: token, targetUid: target }),
    });
    const j = await res.json();
    if(!j.ok){
      const msgs = {
        invalid_input:'Identifiant invalide',
        invalid_token:'Session expirée, reconnecte-toi',
        not_admin:'Accès refusé',
        rate_limited:'Trop de recherches, patiente un peu',
      };
      out.innerHTML = '<div class="adm-lk-err">'+(msgs[j.error]||'Introuvable')+'</div>';
      return;
    }
    out.innerHTML = admRenderLookup(j);
  }catch(e){
    console.error('[lookup]', e && e.message);
    out.innerHTML = '<div class="adm-lk-err">Erreur réseau</div>';
  }
}

function admRenderLookup(u){
  const fmt = t => t ? new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
  const vipActive = u.vip && u.vip.exp && u.vip.exp > Date.now();
  const row = (label, val) => '<div class="adm-lk-row"><span>'+label+'</span><b>'+escHtml(String(val==null?'—':val))+'</b></div>';
  return '<div class="adm-lk-card">'
    + '<div class="adm-lk-head">'
      + '<div class="adm-lk-name">'+escHtml(u.pseudo||'(sans pseudo)')+'</div>'
      + (vipActive?'<span class="adm-lk-vip">VIP</span>':'<span class="adm-lk-novip">Non VIP</span>')
    + '</div>'
    + row('Email', u.email)
    + row('Identifiant', u.uid)
    + row('Dernière visite', fmt(u.lastSeen))
    + (u.vip ? row('VIP expire le', fmt(u.vip.exp)) : '')
    + (u.vip && u.vip.source ? row('Origine', u.vip.source === 'parrainage' ? 'Parrainage' : u.vip.source) : '')
    + (u.referralStats ? row('Filleuls payants', (u.referralStats.paidCount||0)+' · '+(u.referralStats.monthsEarned||0)+' mois gagnés') : '')
    + (u.referredBy ? '<div class="adm-lk-row"><span>Parrainé par</span><button class="avku-uid" onclick="admLookupUser(\''+escHtml(u.referredBy)+'\')">'+escHtml(u.referredBy)+'</button></div>' : '')
    + (u.keys && u.keys.length
        ? '<div class="adm-lk-keys"><div class="adm-lk-keys-t">Clés activées ('+u.keys.length+')</div>'
          + u.keys.map(k => '<div class="adm-lk-key"><code>'+escHtml(k.key)+'</code><span>'+fmt(k.usedAt)+'</span></div>').join('')
          + '</div>'
        : '<div class="adm-lk-keys"><div class="adm-lk-keys-t">Aucune clé activée</div></div>')
  + '</div>';
}

function renderVIPKeyRow(key, v){
  const created = v.createdAt ? new Date(v.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
  const usedAt  = v.usedAt   ? new Date(v.usedAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null;
  const dur     = v.duration||30;
  const used    = !!v.used;
  const disabled = !!v.disabled;
  const statusClass = disabled?'vip-key-status-off':used?'vip-key-status-used':'vip-key-status-active';
  const statusTxt   = disabled?'Désactivée':used?'Utilisée':'Active';
  return`<div class="adm-vip-key-row${disabled?' disabled':''}${used?' used':''}" id="vkrow-${key}">
    <div class="adm-vip-key-top">
      <div class="adm-vip-key-code" onclick="admCopyKey('${key}')" title="Copier">${key}</div>
      <div class="vip-key-status ${statusClass}">${statusTxt}</div>
    </div>
    <div class="adm-vip-key-meta">
      <span>⏳ ${dur}j</span>
      <span>🕐 Créée : ${created}</span>
      ${usedAt?`<span>✅ Utilisée : ${usedAt}</span>`:''}
    </div>
    ${v.activatedByUid?`<div class="adm-vip-key-user">
      <span class="avku-label">Activée par</span>
      <button class="avku-uid" onclick="admLookupUser('${escHtml(v.activatedByUid)}')" title="Voir la fiche de cet utilisateur">${escHtml(v.activatedByUid)}</button>
      ${v.activatedByEmail?`<span class="avku-mail">${escHtml(v.activatedByEmail)}</span>`:''}
    </div>`:''}
    <div class="adm-vip-key-actions">
      <button class="adm-vip-copy-btn" onclick="admCopyKey('${key}')">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        Copier
      </button>
      ${!disabled?`<button class="adm-del-btn" onclick="admDisableVIPKey('${key}')" title="Désactiver" style="flex:1;justify-content:center;gap:6px;font-size:12px">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>
        Désactiver
      </button>`:`<button class="adm-save-btn" onclick="admEnableVIPKey('${key}')" style="flex:1;justify-content:center;gap:6px;font-size:12px;background:rgba(0,200,100,.12);color:var(--green);border-color:rgba(0,200,100,.25)">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/></svg>
        Réactiver
      </button>`}
      <button class="adm-del-btn" onclick="admDeleteVIPKey('${key}')" title="Supprimer" style="flex-shrink:0;padding:0 10px;background:rgba(255,59,59,.08);border-color:rgba(255,59,59,.2);color:var(--red)">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  </div>`;
}

function admGenerateVIPKey(){
  if(!auth || !auth.currentUser){ toast('❌ Connecte-toi d\'abord'); return; }
  const dur = parseInt(document.getElementById('adm-vip-duration')?.value||'30');
  const key = generateVIPKey();
  const payload = { createdAt: Date.now(), duration: dur, used: false, disabled: false };
  // Force token refresh avant d'écrire pour éviter "Permission denied"
  auth.currentUser.getIdToken(true).then(function(){
    return fbFetch('/vip_keys/'+key+'.json',{method:'PUT',body:JSON.stringify(payload),headers:{'Content-Type':'application/json'}});
  })
    .then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+' '+t); });
    })
    .then(function(){
      toast('✅ '+key+' — copiée !');
      navigator.clipboard?.writeText(key).catch(function(){});
      setTimeout(loadAdminVIPKeys, 500);
    })
    .catch(function(e){ toast('❌ Erreur écriture : '+(e.message||e)); });
}

function admCopyKey(key){
  navigator.clipboard?.writeText(key).then(()=>toast('📋 Clé copiée !')).catch(()=>{
    // Fallback
    const ta=document.createElement('textarea');ta.value=key;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('📋 Clé copiée !');
  });
}

function admDisableVIPKey(key){
  fbFetch('/vip_keys/'+key+'/disabled.json',{method:'PUT',body:'true',headers:{'Content-Type':'application/json'}})
    .then(function(r){if(!r.ok)throw new Error(r.status);})
    .then(function(){
      toast('🔒 Clé désactivée');
      if(localStorage.getItem('vip_key')===key){localStorage.removeItem('vip_key');localStorage.removeItem('vip_exp');updateVIPCard();}
      loadAdminVIPKeys();
    })
    .catch(function(){toast('❌ Erreur désactivation');});
}

function admEnableVIPKey(key){
  fbFetch('/vip_keys/'+key+'/disabled.json',{method:'PUT',body:'false',headers:{'Content-Type':'application/json'}})
    .then(function(r){if(!r.ok)throw new Error(r.status);})
    .then(function(){toast('🔓 Clé réactivée');loadAdminVIPKeys();})
    .catch(function(){toast('❌ Erreur réactivation');});
}

function admDeleteVIPKey(key){
  if(!confirm('Supprimer définitivement cette clé ?')) return;
  fbFetch('/vip_keys/'+key+'.json',{method:'DELETE'})
    .then(function(r){if(!r.ok)throw new Error(r.status);})
    .then(function(){
      toast('🗑️ Clé supprimée');
      if(localStorage.getItem('vip_key')===key){localStorage.removeItem('vip_key');localStorage.removeItem('vip_exp');updateVIPCard();}
      var row=document.getElementById('vkrow-'+key);
      if(row){row.style.transition='opacity .25s,transform .25s';row.style.opacity='0';row.style.transform='scale(.95)';setTimeout(function(){row.remove();},260);}
    })
    .catch(function(){toast('❌ Erreur suppression');});
}

// ─── ANIMATION VIP PREMIUM ───────────────────────────
function showVIPActivationScreen(){
  // Supprimer si déjà affiché
  document.getElementById('vip-activation-screen')?.remove();

  const el = document.createElement('div');
  el.id = 'vip-activation-screen';
  el.innerHTML = `
    <div class="vip-act-overlay">
      <div class="vip-act-burst" id="vip-burst"></div>
      <div class="vip-act-crown">
        <svg viewBox="0 0 24 24" fill="currentColor" width="56" height="56"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg>
      </div>
      <div class="vip-act-title">VIP Activé !</div>
      <div class="vip-act-sub">Bienvenue dans le club 👑</div>
      <div class="vip-act-perks">
        <div class="vip-act-perk"><span>✦</span> Zéro publicité</div>
        <div class="vip-act-perk"><span>✦</span> Streams prioritaires</div>
        <div class="vip-act-perk"><span>✦</span> Accès 30 jours</div>
      </div>
    </div>`;
  el.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:all;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)';
  document.body.appendChild(el);

  // Haptic fort
  haptic(50);
  setTimeout(()=>haptic(30),200);

  // Fermer après 3s
  setTimeout(()=>{
    el.style.transition='opacity .4s';
    el.style.opacity='0';
    setTimeout(()=>el.remove(),400);
  },3000);
}



// ─── SWIPE HORIZONTAL → CHANGER DATE ────────────────
(function initSwipeDate(){
  const el=$('scroll');
  if(!el) return;
  let x0=0,y0=0,locked=null,aborted=false;

  el.addEventListener('touchstart',e=>{
    // Ignore si le touch démarre sur la date-bar, comp-bar ou tout élément scrollable horizontal
    const t=e.target.closest('.date-bar,.comp-bar,.multi-drawer-list,.vp-panel,.club-body,.tv-groups-row,.tv-section');
    if(t){ aborted=true; return; }
    aborted=false;
    x0=e.touches[0].clientX;
    y0=e.touches[0].clientY;
    locked=null;
  },{passive:true});

  el.addEventListener('touchmove',e=>{
    if(aborted||locked==='scroll') return;
    const dx=e.touches[0].clientX-x0;
    const dy=e.touches[0].clientY-y0;
    if(locked===null){
      // Seuil plus élevé (18px) pour éviter les déclenchements accidentels
      if(Math.abs(dx)>Math.abs(dy)*1.5 && Math.abs(dx)>18) locked='swipe';
      else if(Math.abs(dy)>8) locked='scroll';
    }
    if(locked==='swipe') e.preventDefault();
  },{passive:false});

  el.addEventListener('touchend',e=>{
    if(aborted||locked!=='swipe') return;
    const dx=e.changedTouches[0].clientX-x0;
    // Seuil minimum 65px pour changer de jour
    if(Math.abs(dx)<65) return;
    if(page!=='home'&&page!=='schedule') return;
    const today=new Date();
    const keys=Array.from({length:10},(_,i)=>dayKey(addDays(today,i-3)));
    const cur=selectedDate||todayKey();
    const idx=keys.indexOf(cur);
    if(dx<0&&idx<keys.length-1) setDate(keys[idx+1]);
    else if(dx>0&&idx>0) setDate(keys[idx-1]);
  },{passive:true});
})();

const bs = $('btn-search');
if(bs) bs.onclick = () => setPage('search');
document.querySelectorAll('.bi[data-pg]').forEach(e => e.addEventListener('click', () => setPage(e.dataset.pg)));

// Clic sur le logo → retour accueil
const navLogo = document.querySelector('.nav-logo');
if(navLogo){ navLogo.style.cursor='pointer'; navLogo.addEventListener('click', () => { haptic(6); setPage('dashboard'); }); }


// ═══════════════════════════════════════════════════════
// ─── CHAT EN DIRECT ──────────────────────────────────
// ═══════════════════════════════════════════════════════

let _chatMatchId = null;
let _chatLastSend = 0;
let _chatBanned = false;
let _chatKnownIds = new Set(); // cache local du statut ban
const CHAT_COOLDOWN = 5000; // 5 secondes entre 2 messages (sauf admins)
const CHAT_MAX_MSGS = 80;
const CHAT_MSG_TTL = 3 * 60 * 60 * 1000;

// ─── CHAT — SDK Firebase temps réel (même mécanisme fiable que streams/VIP/admin,
// au lieu d'appels fetch() bruts vers l'API REST qui posaient problème) ───
var _chatMsgsRef = null;   // référence Firebase actuellement écoutée
var _chatBanRef  = null;
var _chatConnRef = null;   // écoute .info/connected (état réel de la connexion)
var _chatConnected = true;      // optimiste : on ne bloque pas l'UI sans preuve
var _chatGraceTimer = null;
var _chatOrphanTimer = null;

function chatOpen(matchId){
  if(!matchId || !db) return;
  var sec = document.getElementById('chat-section');
  if(!sec) return;
  var newId = String(matchId);
  if(_chatMatchId === newId && _chatMsgsRef){ sec.style.display=''; return; } // déjà ouvert sur ce match
  chatClose(); // nettoie l'état précédent (et cache la section — normal, on la remontre juste après)
  sec.style.display = '';
  chatUpdateAuthUI();
  _chatMatchId = newId;
  _chatKnownIds = new Set();
  var wrap = document.getElementById('chat-messages');
  if(wrap) wrap.innerHTML = '<div class="chat-loading"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div></div>';
  _chatBanned = false;

  if(currentUser){
    _chatBanRef = db.ref('chat_bans/'+currentUser.uid);
    _chatBanRef.on('value', function(snap){
      var d = snap.val();
      // Banni si : bannedAt existe ET (bannedUntil est null [définitif] OU pas encore expiré)
      _chatBanned = !!(d && d.bannedAt && (d.bannedUntil == null || d.bannedUntil > Date.now()));
      chatUpdateAuthUI();
    });
  }

  // Écoute en direct des messages. En théorie Firebase renvoie tout de suite la
  // valeur actuelle (même vide = null) puis pousse les nouveaux messages en temps
  // réel — mais si la connexion à Firebase est bloquée (extension, réseau,
  // pare-feu, règles de sécurité qui refusent silencieusement), ni le callback de
  // succès ni celui d'erreur ne se déclenchent : le spinner reste alors affiché
  // indéfiniment et l'utilisateur ne peut ni voir ni écrire. On sécurise donc
  // avec un timeout : si rien ne répond en 8s, on affiche un message avec un
  // bouton "Réessayer" au lieu de laisser tourner le spinner à l'infini.
  var openId = newId;
  var gotFirstResponse = false;

  // Firebase expose son état de connexion réel via .info/connected. On s'en sert
  // au lieu de deviner : si la connexion temps réel est coupée (WebSocket bloqué,
  // réseau HS), on le dit clairement au lieu de laisser tourner un spinner.
  // BUG CORRIGÉ : .info/connected émet "false" DE FAÇON SYNCHRONE dès qu'on s'y
  // abonne, avant même la moindre tentative de connexion. On désactivait donc
  // le champ de saisie à chaque ouverture du chat, et chez quelqu'un dont la
  // connexion met quelques secondes, ça restait bloqué sur "Connexion
  // impossible". On part optimiste et on n'accuse la connexion qu'après un
  // délai de grâce.
  if(_chatConnRef){ _chatConnRef.off(); }
  _chatConnected = true;
  _chatConnRef = db.ref('.info/connected');
  _chatConnRef.on('value', function(snap){
    var up = snap.val() === true;
    if(up){
      _chatConnected = true;
      clearTimeout(_chatGraceTimer);
      chatUpdateAuthUI();
      if(!gotFirstResponse){
        // .info/connected se déclenche de façon synchrone, AVANT que
        // "var chatTimeout" plus bas ne soit affecté : on utilisait donc un
        // timer orphelin jamais annulé. On le suit dans une variable dédiée.
        clearTimeout(_chatOrphanTimer);
        _chatOrphanTimer = setTimeout(showChatTimeout, 10000);
      }
    } else {
      // Firebase rétablit très souvent le lien tout seul en une seconde ou deux
      // (chargement de page, changement de réseau) : on attend avant de
      // verrouiller l'interface.
      clearTimeout(_chatGraceTimer);
      _chatGraceTimer = setTimeout(function(){
        _chatConnected = false;
        chatUpdateAuthUI();
      }, 6000);
    }
  });

  function showChatTimeout(){
    if(gotFirstResponse || _chatMatchId !== openId) return;
    var wrapEl = document.getElementById('chat-messages');
    if(!wrapEl) return;
    var msg = _chatConnected
      ? 'Le chat met du temps à répondre'
      : 'Connexion au chat impossible<br><span style="font-size:11px;opacity:.7">Vérifie ta connexion ou désactive un éventuel bloqueur</span>';
    wrapEl.innerHTML = '<div class="chat-empty">' + msg + '<br>'
      + '<button onclick="chatOpen(\''+openId+'\')" style="margin-top:8px;background:var(--s2);border:1px solid var(--line2);color:var(--t1);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer">Réessayer</button></div>';
  }
  var chatTimeout = setTimeout(showChatTimeout, 10000);

  _chatMsgsRef = db.ref('chats/'+newId+'/messages').limitToLast(CHAT_MAX_MSGS);
  _chatMsgsRef.on('value', function(snap){
    gotFirstResponse = true;
    clearTimeout(chatTimeout);
    clearTimeout(_chatOrphanTimer);
    var data = snap.val();
    var msgs = [];
    if(data && typeof data === 'object'){
      Object.keys(data).forEach(function(k){
        var v = data[k]; if(v && v.ts) msgs.push(Object.assign({id:k}, v));
      });
      msgs.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
    }
    // Si le rendu lève une exception (message malformé, champ inattendu…), le
    // spinner restait affiché pour toujours et le chat paraissait « bloqué en
    // chargement » alors que les données étaient bien arrivées. On isole donc
    // le rendu et on affiche une vraie erreur en cas de pépin.
    try{
      chatRender(msgs);
    }catch(renderErr){
      console.error('[chat] erreur de rendu:', renderErr, msgs && msgs.length);
      var w = document.getElementById('chat-messages');
      if(w) w.innerHTML = '<div class="chat-empty">Impossible d\'afficher les messages<br>'
        + '<button onclick="chatOpen(\''+openId+'\')" style="margin-top:8px;background:var(--s2);border:1px solid var(--line2);color:var(--t1);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer">Réessayer</button></div>';
    }
    // Pas de purge côté client : elle est faite par le serveur (purgeChats),
    // seul à pouvoir supprimer des messages. La déclencher ici rechargerait
    // 200 messages à chaque rafraîchissement pour rien.
  }, function(err){
    gotFirstResponse = true;
    clearTimeout(chatTimeout);
    console.warn('[chat]', err && err.message);
    var wrapEl = document.getElementById('chat-messages');
    if(wrapEl && _chatKnownIds.size === 0){
      wrapEl.innerHTML = '<div class="chat-empty">Impossible de charger le chat<br>'
        + '<button onclick="chatOpen(\''+openId+'\')" style="margin-top:8px;background:var(--s2);border:1px solid var(--line2);color:var(--t1);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer">Réessayer</button></div>';
    }
  });
}

function chatClose(){
  if(_chatMsgsRef){ _chatMsgsRef.off(); _chatMsgsRef = null; }
  if(_chatBanRef){ _chatBanRef.off(); _chatBanRef = null; }
  if(_chatConnRef){ _chatConnRef.off(); _chatConnRef = null; }
  clearTimeout(_chatGraceTimer);
  clearTimeout(_chatOrphanTimer);
  _chatMatchId  = null;
  _chatKnownIds = new Set();
  var sec = document.getElementById('chat-section');
  if(sec) sec.style.display = 'none';
  var wrap = document.getElementById('chat-messages');
  if(wrap) wrap.innerHTML = '';
}


function chatUpdateAuthUI(){
  var li = document.getElementById('chat-logged-in');
  var lh = document.getElementById('chat-login-hint');
  if(!li || !lh) return;
  if(!currentUser){
    li.style.display='none'; lh.style.display='flex';
  } else if(_chatBanned){
    li.style.display='none'; lh.style.display='flex';
    lh.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg><span style="color:var(--red)">Tu as été banni du chat</span>';
  } else {
    li.style.display='flex'; lh.style.display='none';
  }
  // Indication visuelle quand la connexion temps réel est coupée : avant, le
  // champ restait actif et l'envoi échouait sans explication.
  var inp = document.getElementById('chat-input');
  var sbtn = document.getElementById('chat-send-btn');
  var offline = currentUser && !_chatBanned && !_chatConnected;
  if(inp){
    inp.disabled = !!offline;
    inp.placeholder = offline ? 'Reconnexion au chat…' : 'Écrire un message…';
  }
  if(sbtn) sbtn.disabled = !!offline;
}

var _chatReply = null;

function chatSetReply(pseudo, text){
  _chatReply = {pseudo:pseudo, text:text};
  var bar = document.getElementById('chat-reply-bar');
  var wrap = document.getElementById('chat-input-wrap');
  if(!bar && wrap){
    bar = document.createElement('div');
    bar.id = 'chat-reply-bar';
    bar.className = 'chat-reply-bar';
    bar.innerHTML = '<div class="chat-reply-bar-line"></div>'
      + '<div class="chat-reply-bar-content">'
      + '<div class="chat-reply-bar-pseudo" id="chat-reply-pseudo"></div>'
      + '<div class="chat-reply-bar-text" id="chat-reply-text"></div>'
      + '</div>'
      + '<button class="chat-reply-bar-x" onclick="chatCancelReply()">'
      + '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      + '</button>';
    wrap.insertBefore(bar, wrap.firstChild);
  }
  var rp = document.getElementById('chat-reply-pseudo');
  var rt = document.getElementById('chat-reply-text');
  if(rp) rp.textContent = pseudo;
  if(rt) rt.textContent = text.slice(0,60) + (text.length>60?'…':'');
  if(bar) bar.style.display = 'flex';
  document.getElementById('chat-input')?.focus();
  haptic(8);
}

function chatCancelReply(){
  _chatReply = null;
  var bar = document.getElementById('chat-reply-bar');
  if(bar) bar.style.display = 'none';
}

function _chatMsgHtml(msg){
  var isMe = currentUser && msg.uid === currentUser.uid;
  var time = msg.ts ? new Date(msg.ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';
  var text = escHtml(String(msg.text||''));
  var pseudo = escHtml(String(msg.pseudo||'Anonyme'));
  var safeText = text.replace(/"/g,'&quot;');
  var safePseudo = pseudo.replace(/"/g,'&quot;');
  var replyHtml = msg.replyTo
    ? '<div class="chat-msg-reply-ref"><div class="chat-msg-reply-pseudo">'+escHtml(msg.replyTo.pseudo||'')+'</div><div class="chat-msg-reply-text">'+escHtml((msg.replyTo.text||'').slice(0,60))+'</div></div>'
    : '';
  var adminBadge = msg.admin
    ? ' <span class="chat-admin-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg> Admin</span>'
    : '';
  var nameColorClass = (msg.nameColor >= 1 && msg.nameColor <= 6) ? ' name-shine name-shine-'+msg.nameColor : '';
  // Badge VIP visible par tout le monde. Le champ "vip" est validé côté règles
  // Firebase contre la date d'expiration réelle : impossible de se l'attribuer
  // depuis la console du navigateur.
  var vipBadge = (msg.vip && !msg.admin)
    ? ' <span class="chat-vip-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg> VIP</span>'
    : '';
  var pseudoHtml = msg.admin
    ? '<div class="chat-msg-pseudo chat-msg-pseudo-admin">'+pseudo+adminBadge+'</div>'
    : '<div class="chat-msg-pseudo"><span class="'+('chat-pseudo-name'+nameColorClass)+'">'+pseudo+'</span>'+vipBadge+'</div>';
  var banBtn = (isAdmin() && !isMe && !msg.admin)
    ? '<button class="chat-ban-btn" onclick="chatBanUser(\''+msg.uid+'\',\''+safePseudo+'\')">\uD83D\uDEAB</button>'
    : '';
  return '<div class="chat-msg'+(isMe?' chat-msg-me':'')+'" data-cid="'+(msg.id||'')+'" data-pseudo="'+safePseudo+'" data-text="'+safeText+'">'
    + '<div class="chat-msg-swipe-wrap">'
      + '<div class="chat-reply-ico"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg></div>'
      + '<div class="chat-msg-inner">'
        + (!isMe ? pseudoHtml : '') + banBtn
        + replyHtml
        + '<div class="chat-msg-bubble">'+text+'</div>'
        + '<div class="chat-msg-time">'+time+'</div>'
      + '</div>'
    + '</div>'
  + '</div>';
}

function chatRender(msgs){
  var wrap = document.getElementById('chat-messages');
  if(!wrap) return;
  var countEl = document.getElementById('chat-count');
  if(countEl) countEl.textContent = msgs.length ? msgs.length + ' msg' : '';
  if(!msgs.length){ wrap.innerHTML = '<div class="chat-empty">Sois le premier \u00e0 \u00e9crire !</div>'; return; }
  var wasAtBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 60;

  // Diff : premier rendu ou reset
  if(_chatKnownIds.size === 0 || wrap.querySelector('.chat-loading') || wrap.querySelector('.chat-empty')){
    wrap.innerHTML = msgs.map(_chatMsgHtml).join('');
    _chatKnownIds = new Set(msgs.map(function(m){ return m.id; }));
    wrap.querySelectorAll('.chat-msg').forEach(chatBindSwipe);
    wrap.scrollTop = wrap.scrollHeight;
    return;
  }
  // Ajouter uniquement les nouveaux
  var added = 0;
  msgs.forEach(function(msg){
    if(!msg.id || _chatKnownIds.has(msg.id)) return;
    _chatKnownIds.add(msg.id);
    var div = document.createElement('div');
    div.innerHTML = _chatMsgHtml(msg);
    var el = div.firstElementChild;
    if(el){ wrap.appendChild(el); chatBindSwipe(el); added++; }
  });
  if(added > 0 && wasAtBottom) wrap.scrollTop = wrap.scrollHeight;
}


function chatBindSwipe(el){
  var startX=0, startY=0, swiping=false, threshold=55;
  el.addEventListener('touchstart', function(e){
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = false;
  },{passive:true});
  el.addEventListener('touchmove', function(e){
    var dx = e.touches[0].clientX - startX;
    var dy = e.touches[0].clientY - startY;
    if(Math.abs(dy) > Math.abs(dx)) return;
    if(dx > 0){
      swiping = true;
      var sw = el.querySelector('.chat-msg-swipe-wrap');
      if(sw) sw.style.transform = 'translateX('+Math.min(dx, threshold+10)+'px)';
    }
  },{passive:true});
  el.addEventListener('touchend', function(e){
    var dx = e.changedTouches[0].clientX - startX;
    var sw = el.querySelector('.chat-msg-swipe-wrap');
    if(sw){ sw.style.transition='transform .2s'; sw.style.transform=''; setTimeout(function(){ sw.style.transition=''; },200); }
    if(swiping && dx > threshold){
      chatSetReply(el.dataset.pseudo||'Anonyme', el.dataset.text||'');
    }
    swiping = false;
  },{passive:true});
}

function chatShowOffline(){
  const wrap = document.getElementById('chat-messages');
  if(wrap) wrap.innerHTML = '<div class="chat-empty" style="color:var(--t3)">Chat indisponible</div>';
}

function chatSend(){
  if(!currentUser){ toast('Connecte-toi pour écrire'); return; }
  if(_chatBanned){ toast('⛔ Tu as été banni du chat'); return; }
  _chatSendActual();
}

function _chatSendActual(){
  if(!db || !_chatMatchId) return;
  const input = document.getElementById('chat-input');
  if(!input) return;
  const text = input.value.trim();
  if(!text) return;
  if(text.length > 200){ toast('Message trop long'); return; }
  const now = Date.now();
  // Les admins n'ont pas de cooldown entre les messages
  if(!isAdmin() && now - _chatLastSend < CHAT_COOLDOWN){
    toast('Attends ' + Math.ceil((CHAT_COOLDOWN-(now-_chatLastSend))/1000) + 's');
    return;
  }
  _chatLastSend = now;
  if(!isAdmin()) chatStartCooldownUI();
  const pseudo = (currentUser.displayName || currentUser.email.split('@')[0] || 'Okin').slice(0,24);
  const msg = {uid:currentUser.uid, pseudo:pseudo, text:text, ts:now, admin:isAdmin()};
  if(isVIP()){
    msg.vip = true;                                   // badge VIP visible par tous
    if(myNameColor) msg.nameColor = myNameColor;      // couleur choisie dans le profil
  }
  if(_chatReply) msg.replyTo = {pseudo:_chatReply.pseudo, text:_chatReply.text.slice(0,100)};
  const btn = document.getElementById('chat-send-btn');
  if(btn) btn.disabled = true;
  db.ref('chats/'+_chatMatchId+'/messages').push(msg)
    .then(function(){
      input.value = '';
      chatCancelReply();
      if(btn) btn.disabled = false;
      const wrap = document.getElementById('chat-messages');
      if(wrap) wrap.scrollTop = wrap.scrollHeight;
      chatCleanOld();
    })
    .catch(function(err){
      // L'erreur était totalement avalée : impossible de savoir si c'était un
      // refus des règles, une coupure réseau ou un bannissement. On la logue et
      // on affiche un message utile selon le cas.
      var code = (err && (err.code || err.message) || '').toString();
      console.error('[chat] envoi refusé:', code, err);
      if(/permission|denied/i.test(code)){
        toast('⛔ Envoi refusé — règles Firebase');
      } else if(/network|disconnect|unavailable/i.test(code)){
        toast('📡 Connexion perdue, réessaie');
      } else {
        toast('Erreur envoi');
      }
      if(btn) btn.disabled = false;
      _chatLastSend = 0;
      chatStopCooldownUI();
    });
}

// ── Petit décompte visuel (coin du champ de saisie) pendant le cooldown de 5s ──
let _chatCooldownTimer = null;
function chatStartCooldownUI(){
  const badge = document.getElementById('chat-cooldown-badge');
  const input = document.getElementById('chat-input');
  if(!badge) return;
  clearInterval(_chatCooldownTimer);
  let remaining = Math.ceil(CHAT_COOLDOWN/1000);
  badge.style.display = 'flex';
  badge.textContent = remaining;
  if(input) input.disabled = true;
  _chatCooldownTimer = setInterval(()=>{
    remaining--;
    if(remaining <= 0){ chatStopCooldownUI(); return; }
    badge.textContent = remaining;
  }, 1000);
}
function chatStopCooldownUI(){
  clearInterval(_chatCooldownTimer);
  const badge = document.getElementById('chat-cooldown-badge');
  const input = document.getElementById('chat-input');
  if(badge) badge.style.display = 'none';
  if(input) input.disabled = false;
}

// ── Bannissement — choix temporaire ou définitif ──
function chatBanUser(uid, pseudo){
  if(!isAdmin()) return;
  document.getElementById('chat-ban-ov')?.remove();
  const ov = document.createElement('div');
  ov.id = 'chat-ban-ov';
  ov.className = 'verif-code-ov'; // réutilise le style de popup existant
  ov.innerHTML = `
    <div class="verif-code-modal chat-ban-modal">
      <div class="verif-code-icon">🚫</div>
      <div class="verif-code-title">Bannir ${escHtml(pseudo)}</div>
      <div class="verif-code-sub">Choisis la durée du bannissement</div>
      <div class="chat-ban-options">
        <button class="chat-ban-opt" onclick="_chatDoBan('${uid}','${pseudo.replace(/'/g,"\\'")}',10*60*1000)">10 minutes</button>
        <button class="chat-ban-opt" onclick="_chatDoBan('${uid}','${pseudo.replace(/'/g,"\\'")}',60*60*1000)">1 heure</button>
        <button class="chat-ban-opt" onclick="_chatDoBan('${uid}','${pseudo.replace(/'/g,"\\'")}',24*60*60*1000)">24 heures</button>
        <button class="chat-ban-opt danger" onclick="_chatDoBan('${uid}','${pseudo.replace(/'/g,"\\'")}',null)">Définitif</button>
      </div>
      <button class="verif-code-cancel" onclick="document.getElementById('chat-ban-ov')?.remove()">Annuler</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>ov.classList.add('open'));
}
function _chatDoBan(uid, pseudo, durationMs){
  document.getElementById('chat-ban-ov')?.remove();
  if(!db) return;
  const payload = {
    bannedAt: Date.now(),
    bannedUntil: durationMs ? Date.now()+durationMs : null, // null = définitif (retire la clé)
    pseudo, by: currentUser.uid
  };
  db.ref('chat_bans/'+uid).set(payload)
    .then(function(){ toast('⛔ '+pseudo+(durationMs?' banni temporairement':' banni définitivement')); })
    .catch(function(){ toast('Erreur ban'); });
}

function chatUnbanUser(uid, pseudo){
  if(!isAdmin() || !db) return;
  db.ref('chat_bans/'+uid).remove()
    .then(function(){ toast('✅ '+pseudo+' débanni'); })
    .catch(function(){ toast('Erreur deban'); });
}

function chatDeleteMsg(matchId, msgId){
  if(!isAdmin() || !db) return;
  db.ref('chats/'+matchId+'/messages/'+msgId).remove()
    .then(function(){ toast('Message supprimé'); })
    .catch(function(){ toast('Erreur suppression'); });
}

function chatCleanOld(){
  if(!db || !_chatMatchId) return;
  // Supprimer d'anciens messages est réservé aux admins par les règles Firebase.
  // Pour tous les autres, cette fonction déclenchait à CHAQUE envoi une lecture
  // de 200 messages suivie d'une écriture refusée — inutile et coûteux.
  if(!isAdmin()) return;
  const cutoff = Date.now() - CHAT_MSG_TTL;
  // Lire TOUS les messages pour trouver ceux plus vieux que 3h
  db.ref('chats/'+_chatMatchId+'/messages').limitToFirst(200)
    .once('value', function(snap){
      const updates = {};
      snap.forEach(function(c){
        const ts = c.val()?.ts || 0;
        if(ts < cutoff) updates[c.key] = null; // supprimer seulement les vieux
      });
      const count = Object.keys(updates).length;
      if(count > 0){
        db.ref('chats/'+_chatMatchId+'/messages').update(updates).catch(function(){});
        console.log('[Chat] Nettoyage: '+count+' message(s) supprimé(s)');
      }
    });
}

// Enter pour envoyer
(function(){
  var inp = document.getElementById('chat-input');
  if(inp) inp.addEventListener('keydown', function(e){
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); chatSend(); }
  });
})();

initSettings();
renderContent();
loadMatches();
initFirebase();
// La validité VIP est désormais vérifiée en continu via attachVIPListener (live), plus besoin de polling ici.
loadTvStreams();
startClockTicker(); // chronos live à la seconde

// dlive : première sync 4s après le chargement (laisse le temps aux matchs
// et chaînes de se charger d'abord), puis toutes les 2h — le mapping validé
// par l'admin (Firebase) reste valable même si la sync auto rate un cycle.
setTimeout(()=>syncDlive().catch(e=>console.error('[dlive] sync initiale échouée', e.message)), 4000);
setInterval(()=>{ if(document.visibilityState==='visible') syncDlive().catch(()=>{}); }, 2 * 60 * 60 * 1000);

// FLS (Football Live Stream API) : la sync client ne lit que le cache du
// serveur, elle ne consomme donc AUCUN appel RapidAPI — on peut la lancer
// souvent. C'est le serveur qui décide seul quand rafraîchir réellement, et
// seule une lecture réelle déclenche un appel /link.
startFlsAutoSync();


// ═══════════════════════════════════════════════════════
// ─── PWA — Service Worker + Bannière installation ────
// ═══════════════════════════════════════════════════════

// Enregistrer le Service Worker
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    // ── Mise à jour du Service Worker ──
    // BUG CORRIGÉ : on rechargeait dès l'état "installed", donc AVANT que le
    // nouveau Service Worker ait pris le contrôle. L'ancien, toujours actif,
    // resservait sa version en cache après le rechargement — d'où l'impression
    // que les changements s'appliquaient puis disparaissaient.
    // La bonne pratique : attendre l'événement "controllerchange", qui signale
    // que le NOUVEAU Service Worker pilote réellement la page.
    let _swReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(_swReloading) return;       // garde-fou anti-boucle de rechargement
      _swReloading = true;
      console.log('[SW] nouvelle version active — rechargement');
      location.reload();
    });

    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('SW enregistré:', reg.scope);
        reg.update().catch(()=>{});
        setInterval(() => reg.update().catch(()=>{}), 30 * 60 * 1000);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if(!nw) return;
          nw.addEventListener('statechange', () => {
            if(nw.state === 'installed' && navigator.serviceWorker.controller){
              // On signale seulement : le rechargement est déclenché par
              // controllerchange, une fois la bascule réellement effectuée
              // (sw.js appelle skipWaiting() puis clients.claim()).
              console.log('[SW] nouvelle version prête, bascule en cours');
              try{ toast('🔄 Mise à jour…'); }catch(e){}
            }
          });
        });
      })
      .catch(err => console.log('SW erreur:', err));
  });
}

// Bannière "Installer"
let deferredPrompt = null;
const pwaBanner = document.getElementById('pwa-banner');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');

// Cacher si déjà installé ou si l'user a refusé
const pwaDismissed = localStorage.getItem('pwa-dismissed');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

if(isStandalone || pwaDismissed) {
  if(pwaBanner) pwaBanner.style.display = 'none';
}

// Chrome/Android — intercepter l'événement beforeinstallprompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  pwaCanInstall = true;
  // Rafraîchit le profil pour faire apparaître le bouton "Installer l'application"
  if(typeof page !== 'undefined' && page === 'account') renderContent();
});

// L'app a été installée → on masque l'entrée d'installation
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  pwaCanInstall = false;
  toast('✅ Okin Stream installé !');
  if(typeof page !== 'undefined' && page === 'account') renderContent();
});

// Déclenché par le bouton "Installer l'application" du profil
async function installPWA(){
  if(deferredPrompt){
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    pwaCanInstall = false;
    if(outcome === 'accepted') toast('Installation en cours…');
    if(page === 'account') renderContent();
  } else if(/iphone|ipad|ipod/i.test(navigator.userAgent)){
    showIOSInstallGuide(); // iOS ne fournit aucun prompt natif
  } else {
    toast('Utilise le menu du navigateur → « Installer l\'application »');
  }
}

if(pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
if(deferredPrompt) {
// Chrome Android — prompt natif
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      pwaBanner.classList.remove('show');
      if(outcome === 'accepted') toast('Okin Stream installé !');
    } else {
      // iOS Safari — pas de prompt natif, guider l'utilisateur
      showIOSInstallGuide();
}
  });
}

if(pwaDismissBtn) {
  pwaDismissBtn.addEventListener('click', () => {
    pwaBanner.classList.remove('show');
    localStorage.setItem('pwa-dismissed', '1');
  });
}

// Bannière affichée uniquement depuis le bouton "Installer" de la page À propos
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

function showIOSInstallGuide(){
const guide = document.createElement('div');
  guide.className = 'ios-guide';
  guide.innerHTML = `
    <div class="ios-guide-box">
      <div class="ios-guide-title">Installer sur iPhone</div>
      <div class="ios-guide-steps">
        <div class="ios-step">
          <span class="ios-step-num">1</span>
          <span>Appuie sur <b>Partager</b>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="vertical-align:middle;margin:0 2px"><path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/></svg>
          </span>
        </div>
        <div class="ios-step">
          <span class="ios-step-num">2</span>
<span>Puis <b>Sur l'écran d'accueil</b> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="vertical-align:middle"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span>
        </div>
        <div class="ios-step">
          <span class="ios-step-num">3</span>
          <span>Confirme <b>Ajouter</b></span>
        </div>
      </div>
<button class="ios-guide-close" onclick="this.closest('.ios-guide').remove()">Compris</button>
    </div>`;
  document.body.appendChild(guide);
  setTimeout(() => guide.classList.add('show'), 10);
}

// Appliquer localStorage persistance étendue
// Sauvegarder la dernière page visitée et la date sélectionnée
window.addEventListener('beforeunload', () => {
  localStorage.setItem('last-page', page);
  if(selectedDate) localStorage.setItem('last-date', selectedDate);
  localStorage.setItem('lg-filter', lgFilter);
});

// Restaurer au chargement
(function restoreSession(){
  const lp = localStorage.getItem('last-page');
  const lf = localStorage.getItem('lg-filter');
  // On restaure schedule/favorites seulement — dashboard reste la page d'accueil par défaut
  if(lp && ['schedule','favorites'].includes(lp)) page = lp;
  if(lf) lgFilter = lf;
})();

