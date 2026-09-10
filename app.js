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
      }
      currentUser = user;
      updateAuthUI();
      if(user){
        attachVIPListener(user.uid);
        attachAdminListener(user.uid);
      } else {
        // Déconnecté : le VIP n'est plus garanti par Firebase → on repasse à "non VIP"
        vipLive = {active:false, exp:0, key:null};
        isAdminCache = false;
        try{ localStorage.removeItem('vip_key'); localStorage.removeItem('vip_exp'); }catch(e){}
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

function attachVIPListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/vip').on('value', snap=>{
    const v = snap.val();
    if(!v || !v.key){
      vipLive = {active:false, exp:0, key:null};
      try{ localStorage.removeItem('vip_key'); localStorage.removeItem('vip_exp'); }catch(e){}
      updateVIPCard(); updateVIPOv();
      return;
    }
    const active = v.exp ? Date.now() < v.exp : true;
    vipLive = {active, exp: v.exp || Infinity, key: v.key};
    // Cache local uniquement pour un affichage instantané au prochain chargement —
    // jamais utilisé comme preuve : isVIP() ne lit QUE vipLive.
    try{ localStorage.setItem('vip_key', v.key); localStorage.setItem('vip_exp', String(v.exp||'')); }catch(e){}
    updateVIPCard(); updateVIPOv();
  });
}
function detachVIPListener(uid){
  if(!db || !uid) return;
  db.ref('users/'+uid+'/vip').off();
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
setInterval(checkGoalNotifications, 30000);


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

async function loadLiveData(){
  const res=await afFetch('/fixtures?live=all');if(!res?.response)return;
  for(const f of res.response){const hn=f.teams?.home?.name,an=f.teams?.away?.name;if(!hn||!an)continue;const m=data.live.find(m=>{const mh=m.homeTeam.name||'',ma=m.awayTeam.name||'';return(mh===hn||mh.includes(hn)||hn.includes(mh))&&(ma===an||ma.includes(an)||an.includes(ma));});if(!m)continue;m._status=f.fixture?.status??null;if(f.goals?.home!=null)m.goals={home:f.goals.home,away:f.goals.away};}
  renderTicker();renderContent();
  if(multiOpen)renderGrid();
}
setInterval(()=>{if(Date.now()-lastFetch>60000)loadMatches();},60000);
setInterval(()=>{if(data.live.length)loadLiveData();},30000);

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

const NEWS_FEEDS=[
  {name:"L'Équipe",    color:'#3a8ef6', url:'https://www.lequipe.fr/rss/actu_rss_Football.xml'},
  {name:'RMC Sport',   color:'#e4002b', url:'https://rmcsport.bfmtv.com/rss/football/'},
  {name:'Foot Mercato',color:'#00c87a', url:'https://www.footmercato.net/rss.xml'},
  {name:'France Info', color:'#a259ff', url:'https://www.francetvinfo.fr/sports/football.rss'},
];
const RSS2JSON='https://api.rss2json.com/v1/api.json?rss_url=';

async function fetchNews(){
  if(newsLoading)return;
  newsLoading=true;
  newsCache=[];
  const results=await Promise.allSettled(NEWS_FEEDS.map(async feed=>{
    try{
      const url=RSS2JSON+encodeURIComponent(feed.url)+'&count=7';
      const ctrl=new AbortController();
      const tid=setTimeout(()=>ctrl.abort(),10000);
      const res=await fetch(url,{signal:ctrl.signal});
      clearTimeout(tid);
      if(!res.ok)return[];
      const json=await res.json();
      if(json.status!=='ok'||!json.items?.length)return[];
      return json.items.map(item=>({
        title:  item.title?.trim(),
        link:   item.link,
        desc:   item.description?.replace(/<[^>]+>/g,'').trim().slice(0,130),
        img:    item.thumbnail||item.enclosure?.link||null,
        pubDate:item.pubDate,
        source: feed.name,
        color:  feed.color,
      })).filter(n=>n.title&&n.link);
    }catch(e){return[];}
  }));
  for(const r of results)if(r.status==='fulfilled')newsCache.push(...r.value);
  newsCache.sort((a,b)=>new Date(b.pubDate||0)-new Date(a.pubDate||0));
  newsLoading=false;
  newsLoaded=true;
  // Injecter dans le DOM sans re-render total
  const list=document.getElementById('dash-news-list');
  if(list) list.innerHTML=newsCache.length?renderNewsList():'<div class="news-empty">Aucune actualité disponible</div>';
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

function renderNewsList(){
  if(!newsCache.length)return'<div class="news-empty">Aucune actualité disponible</div>';
  return newsCache.slice(0,20).map((n,i)=>`
    <a class="news-card${i===0?' news-card-featured':''}" href="${n.link}" target="_blank" rel="noopener">
      ${n.img&&i===0?`<div class="news-card-img" style="background-image:url('${n.img}')"><div class="news-card-img-overlay"></div></div>`:''}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="news-source" style="--src-color:${n.color}">${n.source}</span>
          <span class="news-date">${fmtNewsDate(n.pubDate)}</span>
        </div>
        <div class="news-card-title${i===0?' news-title-lg':''}">${n.title}</div>
        ${n.desc&&i>0?`<div class="news-card-desc">${n.desc}…</div>`:''}
      </div>
      <svg class="news-arrow" viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </a>`).join('');
}

function renderDashboard(){
  const today=todayKey();
  const allToday=data.byDate[today]||[];
  const live=allToday.filter(isLive);
  const upcoming=allToday.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');

  if(!newsLoaded&&!newsLoading) fetchNews();

  const totalToday=allToday.length;

  return`<div class="dash-wrap">

    <!-- HERO WELCOME -->
    <div class="dash-hero-card">
      <div class="dash-hero-glow"></div>
      <div class="dash-hero-top">
        <div class="dash-hero-logo"><img src="/ball.png" width="44" height="44" style="object-fit:contain;display:block" alt=""></div>
        <div class="dash-hero-text">
          <div class="dash-hero-title">Bienvenue sur<br><span class="dash-hero-brand">OKIN STREAM</span></div>
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

    <!-- SOUTENIR -->
    <a class="dash-support-card" href="https://www.paypal.com/ncp/payment/ENMYKYCAFGHFE" target="_blank" rel="noopener">
      <div class="dash-sup-icon">
        <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </div>
      <div class="dash-tg-text">
        <div class="dash-sup-title">Soutenir Okin Stream</div>
        <div class="dash-tg-sub">Un café pour garder le site en vie ☕</div>
      </div>
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" class="dash-tg-arrow"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </a>

    <!-- COMPÉTITIONS -->
    <div class="dash-section-head">
      <span class="dash-section-title">Compétitions suivies</span>
    </div>
    <div class="dash-comps-scroll">
      ${Object.entries({CL:'Champions League',EL:'Europa League',PL:'Premier League',PD:'La Liga',BL1:'Bundesliga',SA:'Serie A',FL1:'Ligue 1'}).map(([id,name])=>`
        <div class="dash-comp-pill" onclick="goToCompetition('${id}')">
          <img src="https://crests.football-data.org/${id}.png" onerror="this.style.display='none'" alt="">
          <span>${name}</span>
        </div>`).join('')}
    </div>

    <!-- ADMIN PANEL CARD — visible uniquement si connecté en tant qu'admin -->
    ${isAdmin() ? `<div class="dash-admin-card" onclick="setPage('account');setTimeout(openAdminPanel,150)">
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
    <div class="dash-manifesto-card">
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
    <div class="dash-ads-card">
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
        <div class="feat-center"><div class="feat-score">${live||fin?getScore(m):'-'}</div>${live&&min?`<div class="feat-min">${min}</div>`:''}</div>
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
  if(live){stat=`<span class="mc-status live">● LIVE</span>`;sc='live';time=`<span class="mc-time"><span class="mc-ld"></span>${min||'LIVE'}</span>`;}
  else if(fin){stat=`<span class="mc-status ft">FT</span>`;sc='ft';time=`<span class="mc-time">Terminé</span>`;}
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
      <button class="watch-btn${(getStreamUrl(m))?' has-stream':''}" data-watch="${m.id}">${getStreamUrl(m)?(live?'▶ Live':fin?'▶ Résumé':'▶ Stream'):live?'Live':fin?'FT':'—'}</button>
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
  el.innerHTML=pl.sources.map((s,i)=>`
    <button class="vp-src-btn${i===pl.srcIdx?' active':''}" onclick="switchSource(${i})">
      <span class="vp-src-num">${i+1}</span>
      <span class="vp-src-name">Source ${i+1}</span>
    </button>`).join('');
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
  if(multiOpen){
    // Si multi est ouvert, proposer d'ajouter à la grille plutôt
    if(slots.length<4&&!slots.find(s=>s.match.id===m.id)){
      addToMulti(m);return;
    }
  }
  pl.match=m;
  pl.sources=m.streamSources||[];
  pl.srcIdx=m.streamActiveIdx||0;
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
  // Chat dès qu'une source/chaîne est assignée au match (peu importe si live,
  // à venir ou terminé) — disparaît automatiquement dès qu'il n'y a plus de source.
  if(m.streamUrl){
    setTimeout(function(){ chatOpen(m.id); }, 80);
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
  });
}
function detachAdminListener(uid){
  if(!db || !uid) return;
  db.ref('admins/'+uid).off();
  isAdminCache = false;
}
let adminOpen = false;
let adminDate = null;

function renderAccount(){
  const vipActive = isVIP();
  const vipExpTxt = (vipActive && vipLive.exp && vipLive.exp!==Infinity) ? new Date(vipLive.exp).toLocaleDateString('fr-FR') : '';

  const ICON_VIP = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg>';
  const VIP_CARD_HTML = '<div class="vip-card" onclick="openVIP()"><div class="vip-card-border"></div><div class="vip-card-left"><div class="vip-crown"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg></div><div><div class="vip-card-title" id="vip-card-title">'+(vipActive?'VIP Actif \u2713':'Passer en VIP')+'</div><div class="vip-card-sub" id="vip-card-sub">'+(vipActive?'Acc\u00e8s Premium \u00b7 Sans pub':'Acc\u00e8s illimit\u00e9 \u00b7 Sans pub')+'</div></div></div><div class="vip-badge" id="vip-badge"><span id="vip-badge-txt">'+(vipActive?'G\u00e9rer':'Voir les offres')+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg></div></div>';

  if(currentUser){
    const rawName = currentUser.displayName || currentUser.email.split('@')[0] || 'Utilisateur';
    const name = escHtml(rawName);
    const email = escHtml(currentUser.email || '');
    const photo = currentUser.photoURL;
    const initial = rawName[0].toUpperCase();

    return '<div class="acc-wrap">'
      + '<div class="acc-hero-connected">'
        + '<div class="acc-avatar-wrap">'
          + (photo
              ? '<img src="'+escHtml(photo)+'" class="acc-avatar-photo" referrerpolicy="no-referrer" alt="">'
              : '<div class="acc-avatar-initials">'+initial+'</div>')
          + (vipActive ? '<div class="acc-avatar-vip-dot">'+ICON_VIP+'</div>' : '')
        + '</div>'
        + '<div class="acc-hero-info">'
          + '<div class="acc-display-name-row">'
            + '<span class="acc-display-name" id="acc-display-name">'+name+'</span>'
            + '<button class="acc-edit-pseudo-btn" onclick="openEditPseudo()" title="Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
          + '</div>'
          + '<div class="acc-email-txt">'+email+'</div>'
          + '<div class="acc-uid-row" onclick="copyMyUid()" title="Copier mon identifiant">'
            + '<span class="acc-uid-label">ID :</span><span class="acc-uid-val">'+escHtml(currentUser.uid)+'</span>'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
          + '</div>'
        + '</div>'
      + '</div>'

      + '<div class="acc-pseudo-edit-block" id="pseudo-edit-block" style="display:none">'
        + '<label class="acc-pseudo-label">Nouveau pseudo</label>'
        + '<div class="acc-pseudo-row">'
          + '<input id="pseudo-input" class="acc-pseudo-input" type="text" placeholder="Ton pseudo" maxlength="24" autocomplete="off">'
          + '<button id="pseudo-save-btn" class="acc-pseudo-save-btn" onclick="savePseudo()">OK</button>'
          + '<button class="acc-pseudo-cancel-btn" onclick="cancelEditPseudo()"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>'
        + '</div>'
      + '</div>'

      + (vipActive
          ? '<div class="acc-vip-active-banner">'+ICON_VIP+'<span>VIP actif \u00b7 Expire le '+vipExpTxt+'</span></div>'
          : '')

      + (isAdmin() ? '<div style="display:flex;justify-content:center">'
        + '<button class="acc-admin-trigger" onclick="openAdminPanel()">\u2699\uFE0F Administration</button>'
        + '</div>' : '')

      + VIP_CARD_HTML

      + '<button class="acc-signout-btn" onclick="signOut()">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
        + ' Se d\u00e9connecter'
      + '</button>'

      + '<div class="acc-footer">\u00a9 2026 Okin Stream</div>'
    + '</div>';
  }

  // ── NON CONNECTE ──
  const G_BTN = '<button class="acc-btn-google" onclick="signInWithGoogle()"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continuer avec Google</button>';

  return '<div class="acc-wrap">'
    + '<div class="acc-hero">'
      + '<div class="acc-hero-ball"><img src="/ball.png" width="52" height="52" style="object-fit:contain;display:block" alt=""></div>'
      + '<div class="acc-app-name">OKIN STREAM</div>'
      + '<div class="acc-hero-tagline">Connecte-toi pour synchroniser ton VIP</div>'
    + '</div>'

    + '<div class="acc-auth-card">'
      + G_BTN
      + '<div class="acc-auth-or"><span>ou</span></div>'
      + '<button class="acc-btn-email" onclick="openAuthModal(\'login\')">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
        + ' Connexion par email'
      + '</button>'
      + '<div class="acc-auth-hint">Pas encore de compte ? '
        + '<button class="acc-auth-hint-link" onclick="openAuthModal(\'register\')">S\'inscrire</button>'
      + '</div>'
    + '</div>'

    + (isAdmin() ? '<div style="display:flex;justify-content:center">'
      + '<button class="acc-admin-trigger" onclick="openAdminPanel()">\u2699\uFE0F Administration</button>'
      + '</div>' : '')

    + VIP_CARD_HTML

    + '<div class="acc-features">'
      + '<div class="acc-feature"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm2 2h10v2H7v-2z"/></svg><div><div class="acc-feature-title">VIP li\u00e9 au compte</div><div class="acc-feature-sub">Ton acc\u00e8s VIP suit ton compte partout</div></div></div>'
      + '<div class="acc-feature"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><div><div class="acc-feature-title">Favoris synchronis\u00e9s</div><div class="acc-feature-sub">Retrouve tes matchs sur tous tes appareils</div></div></div>'
    + '</div>'
    + '<div class="acc-footer">\u00a9 2026 Okin Stream</div>'
  + '</div>';
}

// Fix #2 : fonctions modification du pseudo
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
    </div>
    ${adminTab==='vip'?renderAdminVIP():adminTab==='tv'?`${renderAdminTV()}`:adminTab==='admins'?renderAdminUsers():`<div class="adm-progress-bar"><div class="adm-progress-fill" style="width:${pct}%"></div></div>
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
  if(cu&&!srcs.find(s=>s.url===cu)) srcs.push({url:cu,label:'Custom'});
  if(!srcs.length){toast('❌ Sélectionne au moins une source');return;}
  const ts=Date.now();
  const obj={sources:srcs,activeIdx:0,updatedAt:ts,url:srcs[0].url,label:srcs[0].label};

  // 1. Mémoire immédiate (AVANT Firebase pour bloquer la race condition)
  streams[id]=obj;
  _admSources[id]=[...srcs];
  try{localStorage.setItem('okin_streams',JSON.stringify(streams));}catch(e){}

  // 2. Sync match en mémoire
  const allM=Object.values(data.byDate).flat();
  const m=allM.find(x=>String(x.id)===id);
  if(m){m.streamUrl=srcs[0].url;m.streamSources=srcs;m.streamActiveIdx=0;}

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
function startPayment(){
  window.open('https://www.paypal.com/ncp/payment/BH7BQGKEJVLP2', '_blank');
}

function startPaymentLifetime(){
  // Offre 20€ / 6 mois (nom de fonction conservé pour compatibilité avec le HTML existant)
  window.open('https://www.paypal.com/ncp/payment/N8NRJ7FTAVRBN', '_blank');
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
    </div>
    <div class="vip-perks">
      <div class="vip-perk"><span class="vip-perk-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></span><span>Sans publicité</span></div>
      <div class="vip-perk"><span class="vip-perk-ico"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span><span>Streams prioritaires</span></div>
      <div class="vip-perk"><span class="vip-perk-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span><span>Alertes en temps réel</span></div>
      <div class="vip-perk"><span class="vip-perk-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg></span><span>Multi-stream illimité</span></div>
    </div>`;
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
        };
        toast('❌ ' + (messages[json.error] || 'Erreur de vérification'));
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
  var chatTimeout = setTimeout(function(){
    if(gotFirstResponse || _chatMatchId !== openId) return;
    var wrapEl = document.getElementById('chat-messages');
    if(wrapEl){
      wrapEl.innerHTML = '<div class="chat-empty">Le chat met du temps à répondre<br>'
        + '<button onclick="chatOpen(\''+openId+'\')" style="margin-top:8px;background:var(--s2);border:1px solid var(--line2);color:var(--t1);border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer">Réessayer</button></div>';
    }
  }, 8000);

  _chatMsgsRef = db.ref('chats/'+newId+'/messages').limitToLast(CHAT_MAX_MSGS);
  _chatMsgsRef.on('value', function(snap){
    gotFirstResponse = true;
    clearTimeout(chatTimeout);
    var data = snap.val();
    var msgs = [];
    if(data && typeof data === 'object'){
      Object.keys(data).forEach(function(k){
        var v = data[k]; if(v && v.ts) msgs.push(Object.assign({id:k}, v));
      });
      msgs.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
    }
    chatRender(msgs);
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
  var pseudoHtml = msg.admin
    ? '<div class="chat-msg-pseudo chat-msg-pseudo-admin">'+pseudo+adminBadge+'</div>'
    : '<div class="chat-msg-pseudo">'+pseudo+'</div>';
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
    .catch(function(){
      toast('Erreur envoi');
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


// ═══════════════════════════════════════════════════════
// ─── PWA — Service Worker + Bannière installation ────
// ═══════════════════════════════════════════════════════

// Enregistrer le Service Worker
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW enregistré:', reg.scope))
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
  // Stocker le prompt pour plus tard (déclenché depuis À propos)
  // Ne pas afficher automatiquement
});

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

