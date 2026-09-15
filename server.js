// ═══════════════════════════════════════════════════════════════
//  OKIN STREAM — Serveur tout-en-un
//  • Sert les fichiers statiques
//  • Proxy stream (M3U8 + vidéo)
//  • Cache worker intégré : appelle football-data.org toutes les 5 min
//    et écrit dans Firebase → les clients ne touchent JAMAIS l'API
//
//  Variables d'environnement (.env) — AUCUNE clé ne doit être écrite en dur
//  dans ce fichier. Crée un fichier .env (jamais commité / jamais uploadé
//  publiquement) à côté de server.js avec :
//    FD_KEY=ta_clé_football_data
//    AF_KEY=ta_clé_api_sports   (désormais utilisée en BACKUP des compos/détails)
//    FS_BASE=https://...       (hôte FlashScore repéré via DevTools — source PRINCIPALE des compos/détails)
//    FS_FSIGN=...              (header de signature FlashScore si un endpoint l'exige — optionnel)
//    YT_KEY=ta_clé_api_youtube_data_v3
//    FIREBASE_DB_URL=https://okin-stream-765b2-default-rtdb.firebaseio.com
//    FIREBASE_SECRET=ton_database_secret  (Firebase Console → Paramètres → Comptes de service → Anciens secrets)
//    SMTP_HOST=smtp.gmail.com
//    SMTP_PORT=587
//    SMTP_USER=ton_adresse@gmail.com
//    SMTP_PASS=ton_mot_de_passe_application_gmail   (PAS ton mot de passe normal — génère un "mot de passe
//                                                       d'application" sur https://myaccount.google.com/apppasswords)
//
//  ⚠️  Ajoute ".env" à un fichier .gitignore si tu utilises git, et ne
//     partage/upload jamais ce fichier .env ni tes vraies clés.
//
//  Démarrage : node server.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

// ═══════════════════════════════════════════════════
// ── PAYPAL IPN WEBHOOK ───────────────────────────
// URL à renseigner dans PayPal : /webhook/paypal
// ═══════════════════════════════════════════════════

// ── Génération clé VIP ───────────────────────────
function generateVIPKey(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return 'OKIN-' + seg() + '-' + seg() + '-' + seg();
}

// ── Parrainage : génère un code court unique pour un utilisateur ──
function generateReferralCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:7}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}

// ═══════════════════════════════════════════════════
// ── DLIVE.SX — cache serveur, clé jamais exposée au client ──
// ═══════════════════════════════════════════════════
let dliveCache = { channels: [], schedule: [], lastSync: 0, lastError: null };

// dlive peut répondre soit un array direct, soit {success, data:[...]} —
// on gère les deux formats sans savoir lequel sera utilisé en prod.
function extractDliveArray(payload){
  if(Array.isArray(payload)) return payload;
  if(payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function dliveFetch(endpoint){
  return new Promise((resolve, reject) => {
    if(!DLIVE_KEY){ resolve([]); return; }
    const url = `${DLIVE_BASE}?key=${encodeURIComponent(DLIVE_KEY)}&endpoint=${endpoint}`;
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search, method: 'GET', timeout: 15000 };
    const req = https.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => {
        try{ resolve(extractDliveArray(JSON.parse(body))); }
        catch(e){ reject(new Error('dlive_bad_json_'+endpoint)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('dlive_timeout_'+endpoint)); });
    req.end();
  });
}

async function refreshDliveCache(){
  if(!DLIVE_KEY){ dliveCache.lastError = 'no_key'; return dliveCache; }
  try{
    const [channels, schedule] = await Promise.all([
      dliveFetch('channels'),
      dliveFetch('schedule'),
    ]);
    dliveCache = { channels, schedule, lastSync: Date.now(), lastError: null };
    console.log('[DLIVE] Sync OK —', channels.length, 'chaînes,', schedule.length, 'events');
  }catch(e){
    dliveCache.lastError = e.message;
    console.error('[DLIVE] Sync échouée:', e.message);
  }
  return dliveCache;
}

// ── Firebase write ────────────────────────────────
// BUG CRITIQUE CORRIGÉ : cette fonction ignorait le code HTTP de réponse et
// résolvait toujours en succès — y compris sur un 401 "Permission denied". Le
// serveur répondait donc "clé activée ✅" au client alors que RIEN n'avait été
// écrit dans Firebase, d'où des utilisateurs qui activaient une clé sans
// jamais devenir VIP. On vérifie désormais le statut et on remonte l'erreur.
function firebaseWrite(path, data){
  return new Promise((resolve, reject) => {
    const dbUrl = process.env.FIREBASE_DB_URL;
    const secret = process.env.FIREBASE_SECRET;
    if(!dbUrl) return reject(new Error('firebase_db_url_missing'));
    if(!secret) return reject(new Error('firebase_secret_missing'));
    const url = dbUrl + '/' + path + '.json?auth=' + encodeURIComponent(secret);
    const body = JSON.stringify(data);
    const lib = url.startsWith('https') ? require('https') : require('http');
    const parsed = require('url').parse(url);
    const req = lib.request({
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', c => out += c);
      res.on('end', () => {
        if(res.statusCode >= 200 && res.statusCode < 300) return resolve();
        console.error('[FIREBASE] Écriture REFUSÉE sur', path, '— HTTP', res.statusCode, out.slice(0,200));
        reject(new Error('firebase_write_failed_' + res.statusCode));
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Firebase read ─────────────────────────────────
function firebaseRead(path){
  return new Promise((resolve) => {
    const dbUrl  = process.env.FIREBASE_DB_URL || 'https://okin-stream-765b2-default-rtdb.firebaseio.com';
    const secret = process.env.FIREBASE_SECRET;
    const fullUrl = dbUrl + '/' + path + '.json' + (secret ? ('?auth=' + secret) : '');
    const lib = fullUrl.startsWith('https') ? require('https') : require('http');
    lib.get(fullUrl, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try{ resolve(JSON.parse(data)); }catch(e){ resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// ── Lecture du corps JSON d'une requête POST ──────
// ═══════════════════════════════════════════════════
// ── SÉCURITÉ — validations d'entrée ──
// Le serveur écrit dans Firebase avec FIREBASE_SECRET, qui contourne TOUTES
// les règles de sécurité. Toute valeur venant du client et utilisée dans un
// chemin Firebase doit donc être strictement validée, sinon un uid du type
// "../admins/xxx" permettrait d'écrire n'importe où dans la base.
// ═══════════════════════════════════════════════════
// Vérifie un jeton d'authentification Firebase auprès de Google et renvoie
// l'identité réelle de son porteur. C'est ce qui empêche quelqu'un de se
// déclarer admin en trafiquant une requête : seul Google peut signer un jeton
// valide, et il nous dit à quel compte il appartient.
const FB_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDuaj__IpSgTeR0dh2EjM1kSxhCyAEk5iQ';
// Propriétaire du site : admin d'office, même sans entrée dans /admins
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'nmeskhia22@gmail.com';
function verifyIdToken(idToken){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ idToken: idToken });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      port: 443,
      path: '/v1/accounts:lookup?key=' + encodeURIComponent(FB_API_KEY),
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 12000,
    }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', c => out += c);
      res.on('end', () => {
        if(res.statusCode !== 200) return reject(new Error('token_invalid_' + res.statusCode));
        try{
          const j = JSON.parse(out);
          const u = j.users && j.users[0];
          if(!u) return reject(new Error('token_no_user'));
          resolve({ localId: u.localId, email: u.email || null });
        }catch(e){ reject(new Error('token_parse')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('token_timeout')); });
    req.write(body); req.end();
  });
}

function isValidUid(uid){
  return typeof uid === 'string' && /^[A-Za-z0-9]{20,40}$/.test(uid);
}
function isValidVipKey(k){
  return typeof k === 'string' && /^OKIN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k);
}
function isValidRefCode(c){
  return typeof c === 'string' && /^[A-Z0-9]{5,12}$/.test(c);
}

// ── Limitation de débit simple (en mémoire) ──
// Protège les routes sensibles du brute-force et du spam. Suffisant pour un
// serveur unique ; à remplacer par Redis si le site passe sur plusieurs nœuds.
const _rateBuckets = new Map();
function rateLimit(req, res, key, maxReq, windowMs){
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim();
  const id = key + ':' + ip;
  const now = Date.now();
  let b = _rateBuckets.get(id);
  if(!b || now > b.reset){ b = {count:0, reset: now + windowMs}; _rateBuckets.set(id, b); }
  b.count++;
  if(b.count > maxReq){
    res.statusCode = 429;
    res.setHeader('Content-Type','application/json');
    res.setHeader('Retry-After', Math.ceil((b.reset-now)/1000));
    res.end(JSON.stringify({ok:false, error:'rate_limited'}));
    return true;
  }
  return false;
}
// Purge périodique pour éviter que la Map ne grossisse indéfiniment
setInterval(() => {
  const now = Date.now();
  for(const [k,v] of _rateBuckets) if(now > v.reset) _rateBuckets.delete(k);
}, 10*60*1000);

function readJsonBody(req, maxBytes){
  maxBytes = maxBytes || 1e6; // 1 Mo max
  return new Promise((resolve, reject) => {
    let body = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if(size > maxBytes){ reject(new Error('payload_too_large')); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => { try{ resolve(body ? JSON.parse(body) : {}); }catch(e){ reject(new Error('invalid_json')); } });
    req.on('error', reject);
  });
}

// ── Envoi du code de vérification par email (design personnalisé) ─
async function sendVerificationCodeEmail(to, code){
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const codeDigits = String(code).split('').map(d =>
    '<td style="width:40px;height:52px;background:#15130a;border:1px solid #2a2410;border-radius:8px;'
    + 'text-align:center;vertical-align:middle;font-family:monospace;font-size:26px;font-weight:900;'
    + 'color:#e8ff47;padding:0">' + d + '</td>'
  ).join('<td style="width:8px"></td>');

  await transporter.sendMail({
    from:    '"Okin Stream" <' + process.env.SMTP_USER + '>',
    to,
    subject: `${code} — Ton code de vérification Okin Stream`,
    html: `
    <div style="background:#050505;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:460px;margin:0 auto;background:#0c0c0c;border:1px solid #1c1c1c;border-radius:20px;overflow:hidden">

        <!-- Bandeau logo -->
        <div style="background:linear-gradient(135deg,#111 0%,#0a0a0a 100%);padding:28px 24px;text-align:center;border-bottom:1px solid #1c1c1c">
          <div style="display:inline-block;width:44px;height:44px;background:#e8ff47;border-radius:12px;line-height:44px;font-size:22px;font-weight:900;color:#000">O</div>
          <div style="margin-top:10px;font-size:15px;font-weight:900;letter-spacing:2px;color:#fff;text-transform:uppercase">Okin Stream</div>
        </div>

        <!-- Corps -->
        <div style="padding:32px 28px;text-align:center">
          <div style="font-size:19px;font-weight:800;color:#fff;margin:0 0 8px">Confirme ton adresse email</div>
          <div style="font-size:13px;color:#8a8a8a;line-height:1.6;margin:0 0 28px">
            Voici ton code de vérification à usage unique.<br>Entre-le dans l'application pour activer ton compte.
          </div>

          <table role="presentation" style="margin:0 auto 28px" cellpadding="0" cellspacing="0">
            <tr>${codeDigits}</tr>
          </table>

          <div style="font-size:12px;color:#666;line-height:1.7">
            ⏱️ Ce code expire dans <strong style="color:#bbb">10 minutes</strong><br>
            🔒 Ne le partage avec personne — l'équipe Okin Stream ne te le demandera jamais.
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:18px 24px;border-top:1px solid #1c1c1c;text-align:center">
          <div style="font-size:11px;color:#555">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</div>
          <div style="font-size:11px;color:#444;margin-top:6px">© 2026 Okin Stream</div>
        </div>

      </div>
    </div>`
  });
  console.log('[EMAIL] Code de vérification envoyé à', to);
}

// ── Envoi email nodemailer ────────────────────────
async function sendVIPEmail(to, key, durationDays){
  durationDays = durationDays || 30;
  const durationLabel = durationDays >= 183 ? '6 mois' : (durationDays >= 28 && durationDays <= 31 ? '1 mois' : durationDays + ' jours');
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from:    '"Okin Stream" <' + process.env.SMTP_USER + '>',
      to,
      subject: 'Ta clé VIP Okin Stream',
      html: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px 24px;background:#0e0c04;border-radius:16px">'
          + '<h2 style="color:#d4b84a;margin:0 0 8px">Bienvenue dans le VIP !</h2>'
          + '<p style="color:#888;margin:0 0 24px">Merci pour ton abonnement Okin Stream VIP.</p>'
          + '<div style="background:#1a1408;border:1px solid #c8a828;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">'
          + '<p style="color:#888;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px">Ta clé VIP</p>'
          + '<div style="font-size:24px;font-weight:900;letter-spacing:4px;color:#d4b84a;font-family:monospace">' + key + '</div>'
          + '</div>'
          + '<p style="color:#666;font-size:13px;margin:0">Comment l\'activer : <strong style="color:#d4b84a">Compte → VIP → J\'ai déjà une clé</strong></p>'
          + '<p style="color:#555;font-size:11px;margin:16px 0 0">Valable ' + durationLabel + ' · okin-stream.com</p>'
          + '</div>'
    });
    console.log('[EMAIL] Envoyé à', to);
  } catch(err) {
    console.error('[EMAIL] Erreur:', err.message);
  }
}



const http  = require('http');
const zlib  = require('zlib');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 8080;

// ─── VARIABLES D'ENV ─────────────────────────────────
const FD_KEY       = process.env.FD_KEY       || '';
const AF_KEY       = process.env.AF_KEY       || ''; // désormais utilisée en BACKUP (voir /api/fs)
const FS_BASE      = process.env.FS_BASE      || 'https://16.ds.lsapp.eu'; // confirmé par capture HAR réelle — compos + blessés
const FS_FEED_BASE = process.env.FS_FEED_BASE || 'https://global.flashscore.ninja'; // confirmé par capture HAR réelle — liste des matchs (résolution eventId)
const FS_FSIGN     = process.env.FS_FSIGN     || 'SW9D1eZo'; // confirmé statique par capture HAR réelle (identique sur toutes les requêtes)
const FS_PROJECT_ID= process.env.FS_PROJECT_ID|| '16'; // 16 = FlashScore France — à revérifier si un jour on gère d'autres langues
const YT_KEY        = process.env.YT_KEY       || '';
const DLIVE_KEY      = process.env.DLIVE_KEY      || ''; // clé à demander au support dlive.sx — tant qu'elle est vide, le cache reste vide et /api/dlive/* renvoie {channels:[],schedule:[]}
const DLIVE_BASE     = process.env.DLIVE_BASE     || 'https://dlive.sx/daddyapi.php';
const FB_DB_URL    = process.env.FIREBASE_DB_URL || 'https://okin-stream-765b2-default-rtdb.firebaseio.com';
const FB_SECRET    = process.env.FIREBASE_SECRET || ''; // Legacy secret pour écriture via REST

if(!FD_KEY)  console.warn('⚠️  FD_KEY manquant dans .env — /api/fd ne fonctionnera pas');
if(!AF_KEY)  console.warn('⚠️  AF_KEY manquant dans .env — /api/af ne fonctionnera pas');
if(!YT_KEY)  console.warn('⚠️  YT_KEY manquant dans .env — résumés YouTube désactivés (fallback lien direct)');

const COMPS = {
  CL:'Champions League', EL:'Europa League',  EC:'Conf. League',
  PL:'Premier League',   PD:'La Liga',        BL1:'Bundesliga',
  SA:'Serie A',          FL1:'Ligue 1',       PPL:'Primeira Liga',
  DED:'Eredivisie',      BSA:'Brasileirao',   MLS:'MLS',
};

// ═══════════════════════════════════════════════════════════════
// ── FLS — FOOTBALL LIVE STREAM API (RapidAPI) ───────────────────
//
//  Source de flux UNIQUEMENT (aucune donnée de match/score n'est prise ici :
//  football-data + FlashScore restent les sources de vérité côté données).
//
//  ⚠️  CONTRAINTE CENTRALE : le forfait est plafonné à ~50 requêtes/JOUR.
//      Tout ce module est construit autour de ça :
//
//   1. La clé RapidAPI ne quitte JAMAIS le serveur (le client tape /api/fls/*).
//   2. Compteur de quota persistant sur disque (.fls-cache.json) — un redémarrage
//      du serveur ne remet PAS le compteur à zéro et ne re-crame pas la journée.
//   3. Budget scindé : une petite réserve pour /all-match (la liste), le reste
//      pour /link/{id}. La liste ne peut jamais manger le budget des liens.
//   4. /all-match est rafraîchi au maximum FLS_LIST_RESERVE fois par jour,
//      étalé sur la fenêtre horaire où il y a du foot (rien la nuit).
//   5. /link/{id} n'est JAMAIS appelé en avance : uniquement quand un
//      utilisateur lance réellement le flux. Le résultat est mis en cache et
//      partagé par TOUS les visiteurs → 1 appel = N spectateurs.
//   6. Coalescence : 100 clics simultanés sur le même match = 1 seul appel.
//   7. Cache négatif : un 404 n'est pas retenté avant 6 h (sinon un match
//      inexistant viderait le quota à lui tout seul).
//   8. Stale-while-quota-exhausted : quand le quota est épuisé on ressert la
//      dernière valeur connue plutôt que de casser le lecteur.
//
//  Variables .env :
//    RAPIDAPI_KEY=...              (obligatoire — sinon le module reste inerte)
//    FLS_DAILY_QUOTA=50            (plafond dur, défaut 50)
//    FLS_LIST_RESERVE=             (appels/jour réservés à /all-match, défaut ≈12% du quota)
//    FLS_LINK_TTL_MIN=120          (durée de vie d'un lien en cache, minutes)
//    FLS_WINDOW_START=10           (heure UTC de début de la fenêtre de sync)
//    FLS_WINDOW_END=23             (heure UTC de fin)
//    FLS_MODE=proxy|relay          (proxy = flux relayé par le serveur, sûr mais
//                                   consomme de la bande passante ; relay = les
//                                   segments partent en 302 vers le CDN, bande
//                                   passante quasi nulle)
// ═══════════════════════════════════════════════════════════════

const FLS_KEY        = process.env.RAPIDAPI_KEY || process.env.FLS_KEY || '';
const FLS_HOST       = process.env.FLS_HOST      || 'football-live-stream-api.p.rapidapi.com';
const FLS_LIST_PATH  = process.env.FLS_LIST_PATH || '/all-match';
const FLS_LINK_PATH  = process.env.FLS_LINK_PATH || '/link/';
const FLS_QUOTA      = Math.max(1, parseInt(process.env.FLS_DAILY_QUOTA || '50', 10) || 50);
const FLS_LIST_RESERVE = Math.max(1, Math.min(8,
  parseInt(process.env.FLS_LIST_RESERVE || '', 10) || Math.round(FLS_QUOTA * 0.12)));
const FLS_LINK_TTL   = (parseInt(process.env.FLS_LINK_TTL_MIN || '', 10) || 120) * 60 * 1000;
const FLS_ERR_TTL    = 20 * 60 * 1000;       // après une erreur réseau : 20 min avant de re-dépenser
const FLS_404_TTL    = 6  * 60 * 60 * 1000;  // match inconnu chez eux : on n'insiste pas
const FLS_WIN_START  = parseInt(process.env.FLS_WINDOW_START || '10', 10);
const FLS_WIN_END    = parseInt(process.env.FLS_WINDOW_END   || '23', 10);
const FLS_MODE       = (process.env.FLS_MODE || 'proxy').toLowerCase() === 'relay' ? 'relay' : 'proxy';
const FLS_CACHE_FILE = path.join(__dirname, '.fls-cache.json');

if(!FLS_KEY) console.warn('⚠️  RAPIDAPI_KEY manquant dans .env — les sources Football Live Stream sont désactivées');

// ── État persistant ───────────────────────────────────
let flsState = {
  day: '',            // clé UTC yyyy-mm-dd du quota en cours
  usedList: 0,        // appels /all-match consommés aujourd'hui
  usedLink: 0,        // appels /link/{id} consommés aujourd'hui
  matches: [],        // dernier /all-match connu (normalisé)
  listSyncedAt: 0,
  listError: null,
  links: {},          // flsId -> {url, embed, ts, status:'ok'|'notfound'|'error'}
  breakerUntil: 0,    // coupe-circuit : plus aucun appel avant cette date
  breakerReason: '',
};
const _flsInflight = new Map(); // coalescence des appels /link/{id} simultanés

function flsDayKey(d){
  const t = d || new Date();
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth()+1).padStart(2,'0') + '-' + String(t.getUTCDate()).padStart(2,'0');
}

function flsLoadCache(){
  try{
    const raw = JSON.parse(fs.readFileSync(FLS_CACHE_FILE, 'utf8'));
    if(raw && typeof raw === 'object') flsState = Object.assign(flsState, raw);
  }catch(e){ /* premier démarrage : pas de fichier, c'est normal */ }
  flsRollDay();
  flsPruneLinks();
  console.log(`[FLS] Cache chargé — quota ${flsUsed()}/${FLS_QUOTA} utilisé aujourd'hui, ${flsState.matches.length} matchs en cache`);
}

let _flsSaveTimer = null;
function flsSaveCache(){
  clearTimeout(_flsSaveTimer);
  _flsSaveTimer = setTimeout(() => {
    try{ fs.writeFileSync(FLS_CACHE_FILE, JSON.stringify(flsState)); }
    catch(e){ console.error('[FLS] Écriture du cache impossible:', e.message); }
  }, 1500);
}

// Nouveau jour UTC → le quota RapidAPI repart de zéro.
function flsRollDay(){
  const today = flsDayKey();
  if(flsState.day !== today){
    if(flsState.day) console.log(`[FLS] Nouveau jour ${today} — quota remis à zéro (hier : ${flsUsed()}/${FLS_QUOTA})`);
    flsState.day = today;
    flsState.usedList = 0;
    flsState.usedLink = 0;
    if(flsState.breakerUntil && Date.now() >= flsState.breakerUntil){
      flsState.breakerUntil = 0; flsState.breakerReason = '';
    }
    flsSaveCache();
  }
}

// Supprime les liens périmés depuis longtemps pour que le fichier ne gonfle pas.
function flsPruneLinks(){
  const now = Date.now();
  let n = 0;
  for(const id of Object.keys(flsState.links || {})){
    const l = flsState.links[id];
    if(!l || now - (l.ts||0) > 24*60*60*1000){ delete flsState.links[id]; n++; }
  }
  if(n) flsSaveCache();
}

const flsUsed = () => flsState.usedList + flsState.usedLink;

// Reste-t-il du budget pour ce type d'appel ?
// La réserve « liste » non consommée est sanctuarisée : les liens ne peuvent
// pas la manger, sinon un soir de gros match on n'aurait plus aucune liste.
function flsCanSpend(kind){
  if(!FLS_KEY) return false;
  flsRollDay();
  // Coupe-circuit : une clé invalide ou un 429 côté RapidAPI signifie qu'on
  // ne peut RIEN obtenir. Sans ce garde-fou, chaque nouveau match cliqué
  // consommerait un appel pour rien et viderait le quota de la journée en
  // quelques minutes.
  if(flsState.breakerUntil && Date.now() < flsState.breakerUntil) return false;
  if(flsUsed() >= FLS_QUOTA) return false;
  if(kind === 'list') return flsState.usedList < FLS_LIST_RESERVE;
  const listReserved = Math.max(0, FLS_LIST_RESERVE - flsState.usedList);
  return flsUsed() < (FLS_QUOTA - listReserved);
}

// Déclenche le coupe-circuit après une réponse qui ne se répare pas toute
// seule. Un 429 veut dire que RapidAPI compte plus d'appels que nous : on
// s'aligne sur lui en considérant le quota du jour comme épuisé.
function flsTripBreaker(err){
  const code = err && err.code;
  if(code === 401 || code === 403){
    flsState.breakerUntil = Date.now() + 60 * 60 * 1000;
    flsState.breakerReason = 'clé RapidAPI refusée';
    console.error('[FLS] ⛔ Clé refusée — appels suspendus 1 h');
  } else if(code === 429){
    const midnight = new Date(); midnight.setUTCHours(24,0,0,0);
    flsState.breakerUntil = midnight.getTime();
    flsState.breakerReason = 'quota RapidAPI dépassé';
    flsState.usedLink = Math.max(flsState.usedLink, FLS_QUOTA - flsState.usedList);
    console.error('[FLS] ⛔ 429 RapidAPI — appels suspendus jusqu\'à minuit UTC');
  } else {
    return false;
  }
  flsSaveCache();
  return true;
}

function flsSpend(kind){
  flsRollDay();
  if(kind === 'list') flsState.usedList++; else flsState.usedLink++;
  flsSaveCache();
  console.log(`[FLS] Appel ${kind} — quota ${flsUsed()}/${FLS_QUOTA} (liste ${flsState.usedList}/${FLS_LIST_RESERVE})`);
}

function flsQuotaInfo(){
  flsRollDay();
  const listReserved = Math.max(0, FLS_LIST_RESERVE - flsState.usedList);
  const reset = new Date(); reset.setUTCHours(24,0,0,0);
  return {
    limit: FLS_QUOTA,
    used: flsUsed(),
    left: Math.max(0, FLS_QUOTA - flsUsed()),
    listUsed: flsState.usedList,
    listReserve: FLS_LIST_RESERVE,
    linkUsed: flsState.usedLink,
    linkLeft: Math.max(0, FLS_QUOTA - listReserved - flsUsed()),
    resetAt: reset.getTime(),
    enabled: !!FLS_KEY,
    mode: FLS_MODE,
    blocked: !!(flsState.breakerUntil && Date.now() < flsState.breakerUntil),
    blockedUntil: flsState.breakerUntil || 0,
    blockedReason: flsState.breakerReason || '',
  };
}

// ── Appel HTTPS brut vers RapidAPI ────────────────────
function flsRequest(pathname){
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: FLS_HOST,
      port: 443,
      path: pathname,
      method: 'GET',
      headers: {
        'X-RapidAPI-Key':  FLS_KEY,
        'X-RapidAPI-Host': FLS_HOST,
        'Accept':          'application/json',
        'User-Agent':      'OkinStream/1.0',
      },
      timeout: 15000,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => {
        if(res.statusCode === 429){ reject(Object.assign(new Error('fls_rate_limited'), {code:429})); return; }
        if(res.statusCode === 401 || res.statusCode === 403){ reject(Object.assign(new Error('fls_unauthorized'), {code:res.statusCode})); return; }
        if(res.statusCode === 404){ reject(Object.assign(new Error('fls_not_found'), {code:404})); return; }
        if(res.statusCode >= 400){ reject(Object.assign(new Error('fls_http_'+res.statusCode), {code:res.statusCode})); return; }
        try{ resolve(JSON.parse(body)); }
        catch(e){ reject(Object.assign(new Error('fls_bad_json'), {code:502})); }
      });
    });
    req.on('error', e => reject(Object.assign(e, {code: e.code || 'ENET'})));
    req.on('timeout', () => { req.destroy(); reject(Object.assign(new Error('fls_timeout'), {code:504})); });
    req.end();
  });
}

// La doc annonce {result:[...]}, mais ce genre d'API renvoie parfois un tableau
// nu ou {data:[...]}. On accepte les trois plutôt que de casser en prod.
function flsArray(payload){
  if(Array.isArray(payload)) return payload;
  if(payload && Array.isArray(payload.result)) return payload.result;
  if(payload && Array.isArray(payload.data))   return payload.data;
  if(payload && payload.result && Array.isArray(payload.result.data)) return payload.result.data;
  return [];
}

// Normalise un match FLS vers une forme stable pour le client.
function flsNormalizeMatch(raw){
  if(!raw || typeof raw !== 'object') return null;
  const id = raw.id || raw.match_id || raw.matchId;
  const home = raw.home_name || raw.home || raw.homeTeam || '';
  const away = raw.away_name || raw.away || raw.awayTeam || '';
  if(!id || !home || !away) return null;
  return {
    id: String(id),
    home: String(home).trim(),
    away: String(away).trim(),
    league: String(raw.league || raw.competition || '').trim(),
    status: String(raw.status || '').trim(),
    score:  String(raw.score  || '').trim(),
    kickoff: raw.kickoff || raw.start_time || raw.time || null,
    homeFlag: raw.home_flag || null,
    awayFlag: raw.away_flag || null,
  };
}

// ── /all-match : rafraîchissement de la liste ─────────
let _flsListInflight = null;
function flsRefreshList(force){
  if(_flsListInflight) return _flsListInflight;
  if(!flsCanSpend('list')){
    const info = flsQuotaInfo();
    return Promise.resolve({ ok:false, error: !FLS_KEY ? 'no_key' : (info.blocked ? 'provider_blocked' : 'quota_exhausted'), quota: info });
  }
  _flsListInflight = (async () => {
    flsSpend('list');
    try{
      const payload = await flsRequest(FLS_LIST_PATH);
      const list = flsArray(payload).map(flsNormalizeMatch).filter(Boolean);
      // Une réponse vide n'écrase pas une liste valide : mieux vaut une liste
      // d'il y a 2 h qu'un écran sans aucune source.
      if(list.length || !flsState.matches.length) flsState.matches = list;
      flsState.listSyncedAt = Date.now();
      flsState.listError = null;
      flsSaveCache();
      console.log(`[FLS] Liste synchronisée — ${list.length} matchs`);
      return { ok:true, count:list.length, quota: flsQuotaInfo() };
    }catch(e){
      flsTripBreaker(e);
      flsState.listError = e.message;
      flsState.listSyncedAt = flsState.listSyncedAt || 0;
      flsSaveCache();
      console.error('[FLS] Sync liste échouée:', e.message);
      return { ok:false, error:e.message, quota: flsQuotaInfo() };
    }finally{
      _flsListInflight = null;
    }
  })();
  return _flsListInflight;
}

// Rafraîchissement opportuniste : appelé par le scheduler ET à chaque fois
// qu'un client demande la liste. Ne dépense un appel que si l'écart minimal
// entre deux syncs est écoulé et qu'on est dans la fenêtre horaire utile.
function flsMaybeRefreshList(){
  flsRollDay();
  if(!flsCanSpend('list')) return;
  const now = new Date();
  const h = now.getUTCHours();
  const inWindow = FLS_WIN_START <= FLS_WIN_END
    ? (h >= FLS_WIN_START && h <= FLS_WIN_END)
    : (h >= FLS_WIN_START || h <= FLS_WIN_END);
  const hasToday = flsState.listSyncedAt && flsDayKey(new Date(flsState.listSyncedAt)) === flsState.day;
  if(!inWindow && hasToday) return;                 // la nuit : on ne dépense rien
  const windowH = (FLS_WIN_END - FLS_WIN_START + 24) % 24 || 24;
  const minGap = (windowH * 3600000) / FLS_LIST_RESERVE;
  if(Date.now() - (flsState.listSyncedAt||0) < minGap) return;
  flsRefreshList();
}

// ── /link/{id} : résolution d'un flux ─────────────────
// La doc renvoie {"url":"https://football-live-stream.online/?url=https://.../master.m3u8"}
// → on extrait le .m3u8 interne pour le jouer dans NOTRE lecteur (HUD, cast,
//   multi-stream, PiP) au lieu d'une iframe qu'on ne contrôle pas.
function flsExtractM3u8(raw){
  if(!raw || typeof raw !== 'string') return '';
  try{
    const u = new URL(raw);
    for(const k of ['url','u','src','stream','file']){
      const inner = u.searchParams.get(k);
      if(inner && /^https?:\/\//i.test(inner)) return inner;
    }
  }catch(e){}
  return /\.m3u8/i.test(raw) ? raw : '';
}

function flsPickUrl(payload){
  if(!payload) return '';
  if(typeof payload === 'string') return payload;
  const cand = payload.url || payload.link || payload.stream_url || payload.streamUrl
    || (payload.result && (payload.result.url || payload.result.link))
    || (payload.data   && (payload.data.url   || payload.data.link));
  return typeof cand === 'string' ? cand : '';
}

// Résout un lien : cache → coalescence → appel réseau (si budget).
// Renvoie toujours un objet, jamais une exception.
function flsResolveLink(id){
  flsRollDay();
  const now = Date.now();
  const cached = flsState.links[id];

  if(cached){
    const age = now - (cached.ts || 0);
    const ttl = cached.status === 'notfound' ? FLS_404_TTL
              : cached.status === 'error'    ? FLS_ERR_TTL
              : FLS_LINK_TTL;
    if(age < ttl){
      if(cached.status === 'ok') return Promise.resolve({ ok:true, cached:true, url:cached.url, embed:cached.embed, quota: flsQuotaInfo() });
      return Promise.resolve({ ok:false, cached:true, error:cached.status === 'notfound' ? 'not_found' : (cached.error||'error'), quota: flsQuotaInfo() });
    }
  }

  if(_flsInflight.has(id)) return _flsInflight.get(id);

  if(!flsCanSpend('link')){
    // Quota épuisé : plutôt que de casser le lecteur, on ressert le dernier
    // lien connu même périmé — un flux HLS reste souvent valide bien plus
    // longtemps que notre TTL de prudence.
    if(cached && cached.status === 'ok'){
      return Promise.resolve({ ok:true, cached:true, stale:true, url:cached.url, embed:cached.embed, quota: flsQuotaInfo() });
    }
    const info = flsQuotaInfo();
    return Promise.resolve({ ok:false, error: !FLS_KEY ? 'no_key' : (info.blocked ? 'provider_blocked' : 'quota_exhausted'), quota: info });
  }

  const p = (async () => {
    flsSpend('link');
    try{
      const payload = await flsRequest(FLS_LINK_PATH + encodeURIComponent(id));
      const rawUrl = flsPickUrl(payload);
      const m3u8 = flsExtractM3u8(rawUrl);
      if(!rawUrl){
        flsState.links[id] = { status:'error', error:'empty_url', ts: Date.now() };
        flsSaveCache();
        return { ok:false, error:'empty_url', quota: flsQuotaInfo() };
      }
      flsState.links[id] = { status:'ok', url: m3u8 || rawUrl, embed: rawUrl, ts: Date.now() };
      flsSaveCache();
      return { ok:true, cached:false, url: m3u8 || rawUrl, embed: rawUrl, quota: flsQuotaInfo() };
    }catch(e){
      flsTripBreaker(e);
      const notFound = e.code === 404;
      flsState.links[id] = { status: notFound ? 'notfound' : 'error', error: e.message, ts: Date.now() };
      flsSaveCache();
      console.error('[FLS] Lien', id, 'échoué:', e.message);
      return { ok:false, error: notFound ? 'not_found' : e.message, quota: flsQuotaInfo() };
    }finally{
      _flsInflight.delete(id);
    }
  })();
  _flsInflight.set(id, p);
  return p;
}

// Réécrit un manifeste HLS pour que les segments passent par /relay (302 vers
// le CDN → bande passante serveur quasi nulle). Utilisé quand FLS_MODE=relay.
function flsServeRelayManifest(m3u8, res){
  const target = new URL(m3u8);
  https.get({
    hostname: target.hostname,
    port: target.port || 443,
    path: target.pathname + target.search,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120',
      'Referer': target.protocol + '//' + target.hostname + '/',
      'Accept': '*/*',
    },
    timeout: 12000,
  }, up => {
    if(up.statusCode >= 400){ up.resume(); res.statusCode = 502; res.end('# manifest error'); return; }
    let body = '';
    up.setEncoding('utf8');
    up.on('data', c => body += c);
    up.on('end', () => {
      const base = m3u8.substring(0, m3u8.lastIndexOf('/') + 1);
      const out = body.replace(/^(?!#)(\S+)$/gm, line => {
        if(!line.trim()) return line;
        const abs = /^https?:\/\//i.test(line) ? line : base + line;
        // Une sous-playlist doit rester réécrite par nous, sinon ses propres
        // segments repartiraient en direct sans passer par /relay.
        if(/\.m3u8/i.test(abs)) return '/api/fls/manifest?u=' + encodeURIComponent(abs);
        return '/relay?url=' + encodeURIComponent(abs);
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(out);
    });
  }).on('error', e => {
    if(!res.headersSent){ res.statusCode = 502; res.end('# ' + e.message); }
  });
}

// ─── MIME ────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',                                                                                                                            '.png':  'image/png',                                                                                                                                   '.ico':  'image/x-icon',
  '.m3u':  'audio/x-mpegurl',                                                                                                                             '.m3u8': 'application/vnd.apple.mpegurl',
  '.webp': 'image/webp',                                                                                                                                  '.svg':  'image/svg+xml',                                                                                                                             };                                                                                                                                                                                                                                                                                                              // ═══════════════════════════════════════════════════════════════
//  CACHE WORKER — Appels API + écriture Firebase
// ═══════════════════════════════════════════════════════════════
                                                                                                                                                        let dailyCallCount = 0;                                                                                                                                 let lastMatchFetch = 0;
let cachedMatches  = null;
const MAX_DAILY    = 90;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// Fetch HTTPS simple (sans dépendance externe)
function httpsGet(reqUrl, headers = {}){
  return new Promise((resolve, reject) => {
    const parsed  = new URL(reqUrl);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { 'User-Agent': 'OkinStream/1.0', ...headers },
      timeout:  15000,
    };
    const req = https.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch(e){ resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// Écriture dans Firebase via REST API (pas besoin de SDK Admin)
// ═══════════════════════════════════════════════════
// ── PURGE AUTOMATIQUE DES CHATS ──
// Les règles Firebase interdisent la suppression de messages aux visiteurs
// (un utilisateur ne peut qu'AJOUTER le sien). C'est donc au serveur de faire
// le ménage : il écrit avec le secret admin, qui contourne les règles.
//   · chaînes TV (id préfixé "tv_") : messages effacés après 1h30
//   · matchs : chat entièrement vidé dès que le match est terminé
// ═══════════════════════════════════════════════════
const TV_CHAT_TTL      = 90 * 60 * 1000;       // 1h30
const MATCH_CHAT_GRACE = 30 * 60 * 1000;       // marge après la fin du match
const STALE_CHAT_TTL   = 6 * 60 * 60 * 1000;   // filet de sécurité : chat inactif

// Requête générique vers Firebase REST (GET / DELETE)
function firebaseRequest(fbPath, method, query){
  return new Promise((resolve, reject) => {
    if(!FB_SECRET) return resolve(null);
    const fbUrl = new URL(`${FB_DB_URL}${fbPath}.json?auth=${FB_SECRET}${query||''}`);
    const req = https.request({
      hostname: fbUrl.hostname, port: 443,
      path: fbUrl.pathname + fbUrl.search,
      method: method,
      headers: {'User-Agent':'OkinStream/1.0'},
      timeout: 20000,
    }, res => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', c => out += c);
      res.on('end', () => {
        if(res.statusCode >= 200 && res.statusCode < 300){
          try{ resolve(out ? JSON.parse(out) : null); }catch(e){ resolve(null); }
        } else {
          reject(new Error('firebase_' + method + '_' + res.statusCode));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function purgeChats(){
  if(!FB_SECRET) return;
  try{
    // "shallow" ne renvoie que les identifiants, sans charger tous les messages
    const chatIds = await firebaseRequest('/chats', 'GET', '&shallow=true');
    if(!chatIds) return;

    // Statuts des matchs, pour savoir lesquels sont terminés
    let finished = new Set();
    try{
      const cache = await firebaseRequest('/cache/matches', 'GET');
      Object.values(cache?.byDate || {}).forEach(day => {
        (day || []).forEach(m => { if(m && m.status === 'FINISHED') finished.add(String(m.id)); });
      });
    }catch(e){ /* sans le cache on se rabat sur les délais ci-dessous */ }

    const now = Date.now();
    let removedChats = 0, removedMsgs = 0;

    for(const chatId of Object.keys(chatIds)){
      const msgs = await firebaseRequest('/chats/' + chatId + '/messages', 'GET');
      if(!msgs || typeof msgs !== 'object') continue;

      const entries = Object.entries(msgs);
      const lastTs = entries.reduce((mx, [,v]) => Math.max(mx, (v && v.ts) || 0), 0);
      const isTV = chatId.startsWith('tv_');

      // Chat d'un match terminé (ou totalement inactif) → on vide tout
      const matchDone = !isTV && finished.has(chatId) && (now - lastTs > MATCH_CHAT_GRACE);
      const stale     = lastTs > 0 && (now - lastTs > STALE_CHAT_TTL);
      if(matchDone || stale){
        await firebaseRequest('/chats/' + chatId, 'DELETE').catch(()=>{});
        removedChats++;
        continue;
      }

      // Chaîne TV → on ne retire que les messages dépassant 1h30
      if(isTV){
        const old = entries.filter(([,v]) => v && v.ts && (now - v.ts > TV_CHAT_TTL));
        for(const [key] of old){
          await firebaseRequest('/chats/' + chatId + '/messages/' + key, 'DELETE').catch(()=>{});
          removedMsgs++;
        }
      }
    }

    if(removedChats || removedMsgs){
      console.log(`🧹 Purge chats — ${removedChats} chat(s) vidé(s), ${removedMsgs} message(s) expiré(s)`);
    }
  }catch(e){
    console.error('Erreur purgeChats:', e.message);
  }
}

function firebasePut(fbPath, data){
  return new Promise((resolve, reject) => {
    if(!FB_SECRET){ console.warn('⚠️  FIREBASE_SECRET manquant — données non sauvegardées'); resolve(); return; }
    const body    = JSON.stringify(data);
    const fbUrl   = new URL(`${FB_DB_URL}${fbPath}.json?auth=${FB_SECRET}`);
    const options = {
      hostname:       fbUrl.hostname,
      port:           443,
      path:           fbUrl.pathname + fbUrl.search,
      method:         'PUT',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'OkinStream/1.0',
      },
      timeout: 20000,
    };
    const req = https.request(options, res => {
      res.resume(); // On n'a pas besoin de lire la réponse
      if(res.statusCode === 200){ resolve(); }
      else { reject(new Error(`Firebase PUT ${res.statusCode}`)); }
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Firebase timeout')); });
    req.write(body);
    req.end();
  });
}

// Sérialiser un match (seulement les champs utiles au client)
function serializeMatch(m){
  return {
    id:       m.id,
    utcDate:  m.utcDate,
    status:   m.status,
    _cid:     m._cid,
    _cname:   m._cname,
    _cflag:   m._cflag,
    _dayKey:  m._dayKey,
    _status:  m._status || null,
    goals:    m.goals,
    homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.name, shortName: m.homeTeam?.shortName, crest: m.homeTeam?.crest },
    awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.name, shortName: m.awayTeam?.shortName, crest: m.awayTeam?.crest },
    score:    m.score,
  };
}

// ── Fetch matchs (1 seul appel groupé) ───────────────
async function fetchMatches(){
  if(dailyCallCount >= MAX_DAILY){
    console.warn(`⛔ Quota atteint (${dailyCallCount}/${MAX_DAILY})`);
    return null;
  }
  const today = new Date();
  const from  = addDays(today, -3).toISOString().split('T')[0];
  const to    = addDays(today,  6).toISOString().split('T')[0];

  console.log(`📡 [${new Date().toLocaleTimeString('fr-FR')}] Fetch matchs ${from}→${to} (appel #${dailyCallCount+1})`);

  try {
    const { status, json } = await httpsGet(
      `https://api.football-data.org/v4/matches?dateFrom=${from}&dateTo=${to}`,
      { 'X-Auth-Token': FD_KEY }
    );
    if(status === 429){ console.warn('Rate limited par football-data.org'); return null; }
    if(status !== 200 || !json?.matches?.length){ console.warn(`Réponse inattendue: ${status}`); return null; }

    dailyCallCount++;
    const all = [];
    for(const m of json.matches){
      const compId   = m.competition?.code;
      const compName = COMPS[compId];
      if(!compName) continue;
      const ft = m.score?.fullTime, ht = m.score?.halfTime;
      m._cid    = compId;
      m._cname  = compName;
      m._cflag  = `https://crests.football-data.org/${compId}.png`;
      m.goals   = { home: ft?.home ?? ht?.home ?? null, away: ft?.away ?? ht?.away ?? null };
      m._status = null;
      m._dayKey = dayKey(new Date(m.utcDate));
      all.push(m);
    }
    all.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    console.log(`✅ ${all.length} matchs — ${dailyCallCount} appels aujourd'hui`);
    return all;
  } catch(e){
    console.error('Erreur fetchMatches:', e.message);
    return null;
  }
}

// ── Fetch scores live (1 appel si matchs en cours) ───
async function fetchLiveScores(matches){
  if(dailyCallCount >= MAX_DAILY) return;
  const hasLive = matches.some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  if(!hasLive) return;

  console.log(`⚽ Fetch scores live (appel #${dailyCallCount+1})`);
  try {
    const { status, json } = await httpsGet(
      'https://v3.football.api-sports.io/fixtures?live=all',
      { 'x-apisports-key': AF_KEY }
    );
    if(status !== 200 || !json?.response) return;
    dailyCallCount++;

    for(const f of json.response){
      const hn = f.teams?.home?.name, an = f.teams?.away?.name;
      if(!hn || !an) continue;
      const m = matches.find(m => {
        const mh = m.homeTeam?.name||'', ma = m.awayTeam?.name||'';
        return (mh===hn||mh.includes(hn)||hn.includes(mh)) && (ma===an||ma.includes(an)||an.includes(ma));
      });
      if(!m) continue;
      m._status = f.fixture?.status ?? null;
      if(f.goals?.home != null) m.goals = { home: f.goals.home, away: f.goals.away };
    }
    console.log(`✅ Scores live mis à jour`);
  } catch(e){
    console.error('Erreur fetchLiveScores:', e.message);
  }
}

// ── Écrire dans Firebase ──────────────────────────────
async function writeToFirebase(matches){
  if(!matches?.length) return;
  const byDate = {};
  for(const m of matches){
    if(!byDate[m._dayKey]) byDate[m._dayKey] = [];
    byDate[m._dayKey].push(serializeMatch(m));
  }
  const liveList = matches
    .filter(m => m.status==='IN_PLAY'||m.status==='PAUSED')
    .map(m => ({ id:m.id, home:m.homeTeam?.shortName||m.homeTeam?.name, away:m.awayTeam?.shortName||m.awayTeam?.name, score:m.goals, status:m._status, comp:m._cname }));

  try {
    await firebasePut('/cache/matches', { updatedAt: Date.now(), byDate, live: liveList });
    console.log(`💾 Firebase OK — ${matches.length} matchs, ${Object.keys(byDate).length} jours`);
  } catch(e){
    console.error('Erreur Firebase:', e.message);
  }
}

// ── Cycle principal ───────────────────────────────────
async function runCacheWorker(){
  if(dailyCallCount >= MAX_DAILY){ console.warn(`⛔ Quota atteint (${dailyCallCount}/${MAX_DAILY})`); return; }
  console.log(`🔄 [${new Date().toLocaleTimeString('fr-FR')}] Cycle cache worker`);
  try{ await buildMatchesCache(); }
  catch(e){ console.error('❌ Erreur cycle worker:', e.message); }
}

// ── Planification ─────────────────────────────────────
function startCacheWorker(){
  console.log(`🔄 Cache worker démarré (cycle toutes les 5 min, max ${MAX_DAILY} appels/jour)`);

  // Premier cycle immédiat au démarrage
  runCacheWorker();

  // dlive : sync immédiate au démarrage + toutes les 6h (le schedule change
  // rarement plus vite que ça — un bouton "Synchroniser maintenant" existe
  // côté admin pour forcer un refresh entre-temps)
  refreshDliveCache();
  setInterval(refreshDliveCache, 6 * 60 * 60 * 1000);

  // FLS (RapidAPI, ~50 appels/jour) : on recharge d'abord le quota déjà
  // consommé aujourd'hui depuis le disque, puis on laisse le refresh
  // opportuniste décider tout seul quand dépenser un appel de liste.
  // Le tick est court (5 min) mais flsMaybeRefreshList() n'appelle
  // réellement l'API qu'une fois l'écart minimal écoulé.
  flsLoadCache();
  flsMaybeRefreshList();
  setInterval(flsMaybeRefreshList, 5 * 60 * 1000);
  setInterval(flsPruneLinks, 60 * 60 * 1000);

  // Toutes les 5 minutes
  setInterval(runCacheWorker, 5 * 60 * 1000);

  // Purge des chats : 1re passe 1 min après le démarrage (le temps que le
  // cache des matchs soit rempli), puis toutes les 15 minutes.
  setTimeout(purgeChats, 60 * 1000);
  setInterval(purgeChats, 15 * 60 * 1000);

  // Reset compteur quotidien à minuit
  function scheduleReset(){
    const now      = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const msUntil  = midnight - now;
    setTimeout(() => {
      console.log(`🔁 Reset compteur quotidien (était: ${dailyCallCount})`);
      dailyCallCount = 0;
      runCacheWorker();
      scheduleReset(); // Replanifier pour le lendemain
    }, msUntil);
  }
  scheduleReset();
}

// ═══════════════════════════════════════════════════════════════
//  SERVEUR HTTP
// ═══════════════════════════════════════════════════════════════

// OPTIMISATION : cache mémoire + compression gzip.
// app.js/style.css pèsent plusieurs centaines de Ko : ils étaient relus sur
// disque ET renvoyés non compressés à CHAQUE visite. Gzip divise leur poids
// par ~4 et le cache évite les lectures disque répétées.
const _fileCache = new Map(); // filePath -> {raw, gzip, mtime}
const COMPRESSIBLE = new Set(['.js','.css','.html','.json','.svg','.xml','.txt']);

function serveFile(filePath, res, acceptEncoding){
  fs.stat(filePath, (statErr, st) => {
    if(statErr || !st.isFile()){ res.statusCode=404; res.end('Not found'); return; }
    const cached = _fileCache.get(filePath);
    if(cached && cached.mtime === st.mtimeMs){ return sendFile(filePath, cached, res, acceptEncoding); }
    fs.readFile(filePath, (err, data) => {
      if(err){ res.statusCode=404; res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const entry = { raw: data, gzip: null, mtime: st.mtimeMs };
      if(COMPRESSIBLE.has(ext) && data.length > 1024){
        zlib.gzip(data, (gzErr, gz) => {
          if(!gzErr && gz.length < data.length) entry.gzip = gz;
          _fileCache.set(filePath, entry);
          sendFile(filePath, entry, res, acceptEncoding);
        });
      } else {
        _fileCache.set(filePath, entry);
        sendFile(filePath, entry, res, acceptEncoding);
      }
    });
  });
}

function sendFile(filePath, entry, res, acceptEncoding){
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'text/plain');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if(ext === '.html'){
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if(['.js','.css'].includes(ext)){
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1h
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
  }
  if(entry.gzip && /\bgzip\b/.test(acceptEncoding||'')){
    res.setHeader('Content-Encoding','gzip');
    res.setHeader('Vary','Accept-Encoding');
    res.end(entry.gzip);
  } else {
    res.end(entry.raw);
  }
}

function serveFileLegacy(filePath, res){
  fs.readFile(filePath, (err, data) => {
    if(err){ res.statusCode=404; res.end('Not found'); return; }
    const ext = path.extname(filePath);
    // Headers de sécurité sur chaque réponse fichier
    res.setHeader('Content-Type', MIME[ext] || 'text/plain');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Cache agressif sur assets statiques, no-cache sur HTML
    if(ext === '.html'){
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if(['.js','.css'].includes(ext)){
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1h
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
    }
    res.end(data);
  });
}

// Proxy stream — low latency, flush chunk par chunk
// ── SÉCURITÉ SSRF — hôtes interdits pour tout proxy sortant ──
// L'ancienne liste laissait passer 169.254.169.254 (métadonnées cloud : sur un
// VPS AWS/GCP, un attaquant pouvait en extraire les identifiants du serveur) et
// ne couvrait que 172.16.x au lieu de 172.16.0.0/12 (172.16 à 172.31).
function isBlockedHost(hostname){
  const h = String(hostname||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(!h) return true;
  if(h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if(h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if(h.startsWith('fd') || h.startsWith('fc') || h.startsWith('fe80')) return true; // IPv6 privé/link-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(m){
    const [a,b] = [parseInt(m[1],10), parseInt(m[2],10)];
    if(a === 0 || a === 127 || a === 10) return true;
    if(a === 169 && b === 254) return true;          // métadonnées cloud
    if(a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if(a === 192 && b === 168) return true;
    if(a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if(a >= 224) return true;                         // multicast / réservé
  }
  return false;
}

function proxyStream(targetUrl, req, res, redirectCount){
  if(!redirectCount) redirectCount = 0;
  if(redirectCount > 5){ res.statusCode=508; res.end('Too many redirects'); return; }

  const parsed = url.parse(targetUrl);
  const hostname = parsed.hostname || '';
  if(isBlockedHost(hostname)){
    res.statusCode = 403; res.end('Forbidden: private range'); return;
  }
  if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:'){ res.statusCode=400; res.end('Bad protocol'); return; }

  const lib = parsed.protocol === 'https:' ? https : http;
  const options = {
    hostname: hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.path,
    method:   'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120',
      'Referer':    parsed.protocol + '//' + hostname + '/',
      'Origin':     parsed.protocol + '//' + hostname,
      'Accept':     '*/*',
      // Demander uniquement ce dont on a besoin — pas de Keep-Alive qui bufferise
      'Connection': 'close',
    },
    // Pas de timeout global ici — les streams TS sont infinis par nature
  };

  // Anti-buffering headers — doivent être set AVANT flushHeaders
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('X-Accel-Buffering', 'no');   // nginx/cloudflare : pas de buffering
  res.setHeader('Transfer-Encoding', 'chunked');

  const proxyReq = lib.request(options, (proxyRes) => {
    const ct = proxyRes.headers['content-type'] || 'application/octet-stream';

    if([301,302,307,308].includes(proxyRes.statusCode)){
      const location = proxyRes.headers['location'];
      if(location){
        const newUrl = location.startsWith('http') ? location : parsed.protocol + '//' + hostname + location;
        proxyRes.resume();
        proxyStream(newUrl, req, res, redirectCount + 1);
        return;
      }
    }

    const isM3u8 = ct.includes('mpegurl') || targetUrl.includes('.m3u8') || ct.includes('x-mpegurl');

    if(isM3u8){
      // HLS manifest : lire en entier, réécrire les URLs relatives, envoyer
      res.statusCode = proxyRes.statusCode;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      let body = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const base = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        body = body.replace(/^(?!#)(\S+)$/gm, match => {
          if(!match.trim()) return match;
          const absUrl = match.startsWith('http') ? match : base + match;
          return '/proxy?url=' + encodeURIComponent(absUrl);
        });
        res.end(body);
      });
    } else {
      // Flux binaire TS — envoyer chunk par chunk IMMÉDIATEMENT
      // flushHeaders() force l'envoi des headers avant le premier byte de données
      // C'est ce qui débloque le buffering cloudflare/nginx
      res.statusCode = proxyRes.statusCode;
      res.setHeader('Content-Type', 'video/mp2t');
      res.flushHeaders(); // ← clé pour cloudflared

      proxyRes.on('data', chunk => {
        // write() retourne false si le buffer client est plein (backpressure)
        const ok = res.write(chunk);
        if(!ok){
          // Pause le flux source pour ne pas saturer la mémoire
          proxyRes.pause();
          res.once('drain', () => proxyRes.resume());
        }
      });
      proxyRes.on('end', () => { try{ res.end(); }catch(e){} });
      proxyRes.on('error', () => { try{ res.end(); }catch(e){} });

      // Client déconnecté → stopper immédiatement le flux source
      req.on('close', () => { try{ proxyReq.destroy(); proxyRes.destroy(); }catch(e){} });
      res.on('close', () => { try{ proxyReq.destroy(); proxyRes.destroy(); }catch(e){} });
    }
  });

  proxyReq.on('error', (e) => {
    if(e.code === 'ECONNRESET' && res.headersSent) return; // client fermé normalement
    if(!res.headersSent){ res.statusCode=502; res.end('Proxy error: ' + e.code); }
  });

  proxyReq.end();
}

// ── Route /status — voir l'état du worker ────────────
function handleStatus(res){
  const status = {
    uptime:        Math.floor(process.uptime()) + 's',
    dailyCalls:    dailyCallCount,
    maxCalls:      MAX_DAILY,
    callsLeft:     MAX_DAILY - dailyCallCount,
    lastFetch:     lastMatchFetch ? new Date(lastMatchFetch).toLocaleTimeString('fr-FR') : 'jamais',
    matchesCached: cachedMatches?.length || 0,
    firebaseOk:    !!FB_SECRET,
    memoryMB:      Math.round(process.memoryUsage().rss / 1024 / 1024),
    fls:           flsQuotaInfo(),
    flsMatches:    flsState.matches.length,
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(status, null, 2));
}

// ── Proxy API générique (football-data + api-sports) ─
function apiProxy(targetUrl, headers, res){
  const parsed = new URL(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port:     443,
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers:  { 'User-Agent': 'OkinStream/1.0', ...headers },
    timeout:  15000,
  };
  const req = https.request(options, proxyRes => {
    let body = '';
    proxyRes.setEncoding('utf8');
    proxyRes.on('data', c => body += c);
    proxyRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.statusCode = proxyRes.statusCode;
      res.end(body);
    });
  });
  req.on('error', e => {
    console.error('apiProxy error:', e.message);
    if(!res.headersSent){ res.statusCode=502; res.end('{}'); }
  });
  req.on('timeout', () => {
    req.destroy();
    if(!res.headersSent){ res.statusCode=504; res.end('{}'); }
  });
  req.end();
}

// Proxy binaire pour les images (photos joueurs) — FlashScore bloque le
// hotlinking direct depuis un autre site sans le bon Referer, d'où les
// photos qui ne s'affichaient pas. apiProxy() force du texte/JSON, donc
// impropre aux images : celui-ci relaie les octets bruts tels quels.
const IMG_ALLOWED_HOSTS = ['static.flashscore.com', 'media.api-sports.io'];
// ═══════════════════════════════════════════════════
// ── ACTUALITÉS FOOT (flux RSS agrégés côté serveur) ──
// ═══════════════════════════════════════════════════
const NEWS_FEEDS = [
  {name:"L'Équipe",     color:'#3a8ef6', url:'https://www.lequipe.fr/rss/actu_rss_Football.xml'},
  {name:'RMC Sport',    color:'#e4002b', url:'https://rmcsport.bfmtv.com/rss/football/'},
  {name:'Foot Mercato', color:'#00c87a', url:'https://www.footmercato.net/rss.xml'},
  {name:'France Info',  color:'#a259ff', url:'https://www.francetvinfo.fr/sports/football.rss'},
];
const NEWS_TTL = 15 * 60 * 1000; // 15 min — les flux RSS bougent lentement
let newsCache = { items: [], ts: 0 };

function stripTags(s){
  let out = (s||'')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '');
  // Entités nommées courantes des flux français (accents surtout) — sans ça,
  // les titres s'affichaient littéralement "Mbapp&eacute;".
  const named = {
    nbsp:' ', amp:'&', quot:'"', apos:"'", lt:'<', gt:'>',
    eacute:'é', egrave:'è', ecirc:'ê', euml:'ë',
    agrave:'à', acirc:'â', aacute:'á',
    ugrave:'ù', ucirc:'û', uuml:'ü',
    icirc:'î', iuml:'ï', iacute:'í',
    ocirc:'ô', ouml:'ö', oacute:'ó',
    ccedil:'ç', ntilde:'ñ',
    Eacute:'É', Egrave:'È', Agrave:'À', Ccedil:'Ç',
    laquo:'«', raquo:'»', hellip:'…', rsquo:'’', lsquo:'‘',
    ldquo:'“', rdquo:'”', ndash:'–', mdash:'—', euro:'€', deg:'°',
  };
  out = out.replace(/&([a-zA-Z]+);/g, (m,e) => (e in named ? named[e] : m));
  // Entités numériques (&#233; et &#xE9;)
  out = out.replace(/&#(\d+);/g, (m,d) => String.fromCharCode(parseInt(d,10)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (m,h) => String.fromCharCode(parseInt(h,16)));
  return out.replace(/\s+/g,' ').trim();
}
function pickTag(block, tag){
  const m = block.match(new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)</'+tag+'>', 'i'));
  return m ? stripTags(m[1]) : '';
}
function pickImage(block){
  // Les flux exposent l'image de façons très différentes selon l'éditeur
  let m = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i);
  if(m) return m[1];
  m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if(m) return m[1];
  m = block.match(/<img[^>]*src=["']([^"']+)["']/i);
  if(m) return m[1];
  return null;
}
function fetchRssFeed(feed){
  return new Promise((resolve) => {
    const parsed = new URL(feed.url);
    const lib = parsed.protocol === 'http:' ? require('http') : https;
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.protocol==='http:'?80:443,
      path: parsed.pathname + parsed.search, method: 'GET', timeout: 10000,
      headers: {'User-Agent':'Mozilla/5.0 (compatible; OkinStream/1.0)', 'Accept':'application/rss+xml, application/xml, text/xml, */*'},
    }, r => {
      // Suivre une éventuelle redirection (fréquent sur ces flux)
      if(r.statusCode >= 300 && r.statusCode < 400 && r.headers.location){
        r.resume();
        return resolve(fetchRssFeed({...feed, url: new URL(r.headers.location, feed.url).href}));
      }
      if(r.statusCode !== 200){ r.resume(); return resolve([]); }
      let xml = '';
      r.setEncoding('utf8');
      r.on('data', c => xml += c);
      r.on('end', () => {
        try{
          const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
          const items = blocks.slice(0, 8).map(b => {
            const linkTag = pickTag(b,'link');
            const hrefMatch = !linkTag && b.match(/<link[^>]*href=["']([^"']+)["']/i); // format Atom
            return {
              title:   pickTag(b,'title'),
              link:    linkTag || (hrefMatch ? hrefMatch[1] : ''),
              desc:    pickTag(b,'description').slice(0,130) || pickTag(b,'summary').slice(0,130),
              img:     pickImage(b),
              pubDate: pickTag(b,'pubDate') || pickTag(b,'published') || pickTag(b,'updated'),
              source:  feed.name,
              color:   feed.color,
            };
          }).filter(n => n.title && n.link);
          resolve(items);
        }catch(e){ resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function imageProxy(targetUrl, res){
  let parsed;
  try{ parsed = new URL(targetUrl); }catch(e){ res.statusCode=400; res.end(); return; }
  if(!IMG_ALLOWED_HOSTS.includes(parsed.hostname)){ res.statusCode=403; res.end(); return; }
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
  if(parsed.hostname === 'static.flashscore.com') headers['Referer'] = 'https://www.flashscore.fr/';
  const options = { hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search, method: 'GET', headers, timeout: 12000 };
  const req = https.request(options, proxyRes => {
    if(proxyRes.statusCode !== 200){ res.statusCode = proxyRes.statusCode; res.end(); return; }
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 jours — les photos changent rarement
    res.statusCode = 200;
    proxyRes.pipe(res);
  });
  req.on('error', () => { if(!res.headersSent){ res.statusCode=502; res.end(); } });
  req.on('timeout', () => { req.destroy(); if(!res.headersSent){ res.statusCode=504; res.end(); } });
  req.end();
}

// ── Cache serveur des matchs ──────────────────────────
let matchesCache = { data: null, ts: 0 };
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

const COMPS_MAP = {
  CL:'Champions League', EL:'Europa League',  EC:'Conf. League',
  PL:'Premier League',   PD:'La Liga',        BL1:'Bundesliga',
  SA:'Serie A',          FL1:'Ligue 1',       PPL:'Primeira Liga',
  DED:'Eredivisie',      BSA:'Brasileirao',   MLS:'MLS',
};

async function buildMatchesCache(){
  const today = new Date();
  const df    = d => d.toISOString().split('T')[0];
  // 2 requêtes max : passé (3j) + futur (6j) — respecte la limite 10j/requête
  const ranges = [
    { from: df(addDays(today,-3)), to: df(today) },
    { from: df(today),             to: df(addDays(today,6)) },
  ];
  const seen = new Set();
  const all  = [];

  for(const range of ranges){
    try{
      const { status, json } = await httpsGet(
        `https://api.football-data.org/v4/matches?dateFrom=${range.from}&dateTo=${range.to}`,
        { 'X-Auth-Token': FD_KEY }
      );
      if(status !== 200 || !json?.matches) continue;
      dailyCallCount++;
      for(const m of json.matches){
        if(seen.has(m.id)) continue;
        seen.add(m.id);
        const compId   = m.competition?.code;
        const compName = COMPS_MAP[compId];
        if(!compName) continue;
        const ft = m.score?.fullTime, ht = m.score?.halfTime;
        m._cid    = compId;
        m._cname  = compName;
        m._cflag  = `https://crests.football-data.org/${compId}.png`;
        m.goals   = { home: ft?.home ?? ht?.home ?? null, away: ft?.away ?? ht?.away ?? null };
        m._status = null;
        m._dayKey = dayKey(new Date(m.utcDate));
        all.push(m);
      }
    }catch(e){ console.error('buildMatchesCache range error:', e.message); }
  }

  if(all.length){
    matchesCache = { data: all, ts: Date.now() };
    console.log(`✅ Cache matchs: ${all.length} matchs (${dailyCallCount} appels aujourd'hui)`);
    // Écrire dans Firebase aussi
    writeToFirebase(all).catch(()=>{});
  }
  return all;
}

// ── Serveur principal ─────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // Headers de sécurité globaux
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // CORS preflight
  if(req.method === 'OPTIONS'){ res.statusCode=204; res.end(); return; }

  // Limiter les méthodes autorisées
  // (POST autorisé ici globalement ; chaque route POST vérifie elle-même
  //  req.method === 'POST'. Sans ça, /webhook/paypal et les nouvelles routes
  //  /api/auth/* étaient bloquées avant même d'être atteintes.)
  if(!['GET','HEAD','POST'].includes(req.method)){ res.statusCode=405; res.end('Method Not Allowed'); return; }

  // ── Route /api/matches — tous les matchs (cache serveur) ──
  if(parsed.pathname === '/api/matches'){
    // Servir depuis le cache si frais
    if(matchesCache.data && Date.now()-matchesCache.ts < CACHE_TTL){
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','public, max-age=60');
      res.end(JSON.stringify(matchesCache.data));
      return;
    }
    // Sinon rebuild le cache
    buildMatchesCache().then(all => {
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','public, max-age=60');
      res.end(JSON.stringify(all));
    }).catch(e => {
      // En cas d'erreur, servir le cache périmé s'il existe
      if(matchesCache.data){
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify(matchesCache.data));
      } else {
        res.statusCode=500; res.end('[]');
      }
    });
    return;
  }

  // ── Route /api/fd — proxy football-data.org ──────────
  if(parsed.pathname.startsWith('/api/fd')){
    const ep  = parsed.pathname.replace('/api/fd','');
    const qs  = parsed.search || '';
    const target = `https://api.football-data.org/v4${ep}${qs}`;
    console.log('API FD:', ep);
    apiProxy(target, {'X-Auth-Token': FD_KEY}, res);
    return;
  }

  // ── Route /api/af — proxy api-sports.io ──────────────
  if(parsed.pathname.startsWith('/api/af')){
    const ep  = parsed.pathname.replace('/api/af','');
    const qs  = parsed.search || '';
    const target = `https://v3.football.api-sports.io${ep}${qs}`;
    console.log('API AF:', ep);
    apiProxy(target, {'x-apisports-key': AF_KEY}, res);
    return;
  }

  // ── Route /api/img — proxy binaire photos joueurs (contourne le hotlink block) ──
  // ── Route /api/news — agrège les flux RSS foot côté serveur ───────────
  // Avant, le client appelait api.rss2json.com directement : bloqué par la CSP
  // (connect-src n'autorise que 'self' + Firebase), d'où la section Actualités
  // qui restait vide. On récupère et parse le XML ici, plus de dépendance à un
  // service tiers ni de souci de quota.
  if(parsed.pathname === '/api/news'){
    const now = Date.now();
    if(newsCache.items.length && now - newsCache.ts < NEWS_TTL){
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({items: newsCache.items, cached: true}));
      return;
    }
    Promise.allSettled(NEWS_FEEDS.map(f => fetchRssFeed(f)))
      .then(results => {
        const items = [];
        results.forEach(r => { if(r.status === 'fulfilled') items.push(...r.value); });
        items.sort((a,b) => new Date(b.pubDate||0) - new Date(a.pubDate||0));
        if(items.length) newsCache = {items: items.slice(0,40), ts: now};
        res.setHeader('Content-Type','application/json');
        res.setHeader('Cache-Control','public, max-age=600');
        res.end(JSON.stringify({items: newsCache.items}));
      });
    return;
  }

  if(parsed.pathname === '/api/img'){
    const target = parsed.query.u;
    if(!target){ res.statusCode=400; res.end(); return; }
    imageProxy(target, res);
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // ── Routes /api/fls/* — Football Live Stream API (RapidAPI) ────
  //  La clé RapidAPI ne sort jamais d'ici. Toutes les routes servent
  //  d'abord le cache : un client ne peut PAS provoquer un appel
  //  payant à volonté (quota + rate-limit + coalescence).
  // ══════════════════════════════════════════════════════════════

  // Liste des matchs streamables. Gratuit pour le client : on sert le cache
  // et on déclenche éventuellement un refresh en tâche de fond (jamais
  // bloquant, jamais plus souvent que l'écart minimal calculé).
  if(parsed.pathname === '/api/fls/matches'){
    flsMaybeRefreshList();
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','public, max-age=120');
    res.end(JSON.stringify({
      matches:  flsState.matches,
      lastSync: flsState.listSyncedAt,
      error:    flsState.listError,
      quota:    flsQuotaInfo(),
    }));
    return;
  }

  // État du quota seul (panneau admin) — aucun appel sortant.
  if(parsed.pathname === '/api/fls/status'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      quota: flsQuotaInfo(),
      lastSync: flsState.listSyncedAt,
      matches: flsState.matches.length,
      links: Object.keys(flsState.links||{}).length,
      error: flsState.listError,
    }));
    return;
  }

  // Résolution d'un lien. C'est LA route qui peut coûter un appel — d'où le
  // rate-limit par IP en plus du quota global.
  if(parsed.pathname === '/api/fls/link'){
    const id = (parsed.query.id||'').toString().trim();
    if(!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)){
      res.statusCode = 400; res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:false, error:'bad_id'})); return;
    }
    if(rateLimit(req, res, 'flslink', 30, 10*60*1000)) return;
    flsResolveLink(id).then(r => {
      res.statusCode = r.ok ? 200 : (['quota_exhausted','no_key','provider_blocked'].includes(r.error) ? 503 : 502);
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify(r));
    });
    return;
  }

  // Lecture : /api/fls/play/<id>.m3u8
  //  → même origine, donc compatible CSP et sans mixed-content, et le
  //    lecteur natif (HUD, cast, PiP, multi-stream) fonctionne comme pour
  //    n'importe quelle autre source.
  if(parsed.pathname.startsWith('/api/fls/play/')){
    const id = decodeURIComponent(parsed.pathname.slice('/api/fls/play/'.length)).replace(/\.m3u8$/i,'');
    if(!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)){ res.statusCode=400; res.end('# bad id'); return; }
    if(rateLimit(req, res, 'flsplay', 60, 10*60*1000)) return;
    flsResolveLink(id).then(r => {
      if(!r.ok || !r.url){
        res.statusCode = ['quota_exhausted','no_key','provider_blocked'].includes(r.error) ? 503 : 502;
        res.setHeader('Content-Type','application/vnd.apple.mpegurl');
        res.end('# fls: ' + (r.error||'unavailable'));
        return;
      }
      if(FLS_MODE === 'relay' && /\.m3u8/i.test(r.url)){
        flsServeRelayManifest(r.url, res);
        return;
      }
      // Mode proxy (défaut) : on délègue au proxy maison, qui réécrit déjà
      // les segments et gère les redirections.
      res.statusCode = 302;
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Location', '/proxy?url=' + encodeURIComponent(r.url));
      res.end();
    });
    return;
  }

  // Sous-manifeste réécrit (mode relay uniquement) : une master playlist
  // pointe vers des variantes, qu'il faut réécrire à leur tour.
  if(parsed.pathname === '/api/fls/manifest'){
    const u = (parsed.query.u||'').toString();
    if(!u){ res.statusCode=400; res.end('# missing u'); return; }
    let target;
    try{ target = new URL(decodeURIComponent(u)); }catch(e){ res.statusCode=400; res.end('# bad url'); return; }
    if(target.protocol !== 'https:' && target.protocol !== 'http:'){ res.statusCode=400; res.end('# bad protocol'); return; }
    if(isBlockedHost(target.hostname)){ res.statusCode=403; res.end('# forbidden'); return; }
    flsServeRelayManifest(target.toString(), res);
    return;
  }

  // Sync forcée depuis le panneau admin. Rate-limitée agressivement : chaque
  // clic peut coûter un appel sur les 50 de la journée.
  if(parsed.pathname === '/api/fls/sync' && req.method === 'POST'){
    if(rateLimit(req, res, 'flssync', 3, 30*60*1000)) return;
    flsRefreshList(true).then(r => {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(Object.assign({ matches: flsState.matches.length, lastSync: flsState.listSyncedAt }, r)));
    });
    return;
  }

  // ── Routes /api/dlive/* — servent le cache serveur, la clé DLIVE_KEY
  // n'est JAMAIS envoyée au client ──
  if(parsed.pathname === '/api/dlive/channels'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ channels: dliveCache.channels, lastSync: dliveCache.lastSync, lastError: dliveCache.lastError }));
    return;
  }
  if(parsed.pathname === '/api/dlive/schedule'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ schedule: dliveCache.schedule, lastSync: dliveCache.lastSync, lastError: dliveCache.lastError }));
    return;
  }
  if(parsed.pathname === '/api/dlive/sync' && req.method === 'POST'){
    // Déclenche des appels sortants : sans limite, n'importe qui pouvait
    // marteler la route et faire bannir notre IP côté dlive.
    if(rateLimit(req, res, 'dlivesync', 5, 10*60*1000)) return;
    // Déclenché par le bouton "Synchroniser maintenant" du panel admin.
    // Pas de vérification admin ici volontairement légère (comme le reste
    // de l'admin, protégé côté client par isAdmin()) — si tu veux un vrai
    // contrôle serveur, ajoute une vérification du token Firebase ici.
    refreshDliveCache().then(c => {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ ok: !c.lastError, channels: c.channels.length, schedule: c.schedule.length, lastSync: c.lastSync, error: c.lastError }));
    });
    return;
  }

  // ── Route /api/fsfeed — proxy FlashScore (flux texte délimité — liste des
  // matchs, sert à retrouver l'eventId). Domaine confirmé par capture HAR le
  // 11/09/2026 : global.flashscore.ninja (différent de FS_BASE, le host
  // GraphQL). Même header x-fsign, confirmé statique sur ce domaine aussi.
  // ⚠️ Doit être vérifiée AVANT /api/fs plus bas (préfixe commun /api/fs).
  if(parsed.pathname.startsWith('/api/fsfeed')){
    const ep  = parsed.pathname.replace('/api/fsfeed','');
    const qs  = parsed.search || '';
    const target = `${FS_FEED_BASE}${ep}${qs}`;
    console.log('API FSFEED:', ep);
    const fsFeedHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Referer': 'https://www.flashscore.fr/',
      'Origin': 'https://www.flashscore.fr',
      'X-Geoip': '1',
      ...(FS_FSIGN ? { 'X-Fsign': FS_FSIGN } : {}),
    };
    apiProxy(target, fsFeedHeaders, res);
    return;
  }

  // ── Route /api/fs — proxy FlashScore (scraper — source PRINCIPALE) ────
  // FS_BASE/FS_FSIGN ont des valeurs par défaut confirmées par capture réelle
  // (HAR) le 10/09/2026 — hôte GraphQL des compos + blessés. Si FlashScore
  // change son infra, remplace-les dans .env sans toucher au code.
  if(parsed.pathname.startsWith('/api/fs')){
    if(!FS_BASE){ res.statusCode=503; res.setHeader('Content-Type','application/json'); res.end('{"error":"fs_base_missing"}'); return; }
    const ep  = parsed.pathname.replace('/api/fs','');
    const qs  = parsed.search || '';
    const target = `${FS_BASE}${ep}${qs}`;
    console.log('API FS:', ep);
    const fsHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Referer': 'https://www.flashscore.fr/',
      // Certains endpoints FlashScore exigent un header de signature (souvent nommé
      // x-fsign). Je n'ai pas de moyen de vérifier sa valeur actuelle — je ne
      // l'invente pas ici. Capture-la toi-même via DevTools (Network > XHR, onglet
      // Headers de la requête) et mets-la dans FS_FSIGN si besoin.
      ...(FS_FSIGN ? { 'X-Fsign': FS_FSIGN } : {}),
    };
    apiProxy(target, fsHeaders, res);
    return;
  }

  // ── Route /api/yt/search — proxy YouTube Data API (clé jamais côté client) ──
  if(parsed.pathname === '/api/yt/search'){
    if(!YT_KEY){ res.statusCode=503; res.setHeader('Content-Type','application/json'); res.end('{"error":"yt_key_missing"}'); return; }
    const q = parsed.query.q || '';
    if(!q){ res.statusCode=400; res.end('{"error":"missing_q"}'); return; }
    const ytParams = new url.URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(Math.min(parseInt(parsed.query.maxResults)||5, 10)),
      q,
      key: YT_KEY,
    });
    if(parsed.query.relevanceLanguage) ytParams.set('relevanceLanguage', parsed.query.relevanceLanguage);
    if(parsed.query.publishedAfter)    ytParams.set('publishedAfter', parsed.query.publishedAfter);
    if(parsed.query.publishedBefore)   ytParams.set('publishedBefore', parsed.query.publishedBefore);
    const target = `https://www.googleapis.com/youtube/v3/search?${ytParams.toString()}`;
    apiProxy(target, {}, res);
    return;
  }

  // ── Route /api/auth/send-code — génère + envoie un code à 6 chiffres ──
  if(parsed.pathname === '/api/auth/send-code' && req.method === 'POST'){
    // Anti-spam d'emails (et protection du quota SMTP) : 5 envois / 15 min / IP
    if(rateLimit(req, res, 'sendcode', 5, 15*60*1000)) return;
    readJsonBody(req).then(async ({uid, email}) => {
      res.setHeader('Content-Type','application/json');
      if(!uid || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return;
      }
      // Anti-spam : pas de renvoi avant 45s
      const existing = await firebaseRead('email_codes/'+uid);
      if(existing && existing.createdAt && (Date.now()-existing.createdAt) < 45000){
        res.end(JSON.stringify({ok:false, error:'cooldown', retryInMs: 45000-(Date.now()-existing.createdAt)}));
        return;
      }
      const code = String(Math.floor(100000 + Math.random()*900000));
      await firebaseWrite('email_codes/'+uid, { code, email, createdAt: Date.now(), attempts: 0 });
      try{
        await sendVerificationCodeEmail(email, code);
        res.end(JSON.stringify({ok:true}));
      }catch(e){
        console.error('[EMAIL] Erreur envoi code:', e.message);
        res.statusCode=502; res.end(JSON.stringify({ok:false, error:'email_send_failed'}));
      }
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  // ── Route /api/auth/verify-code — vérifie le code saisi ──
  if(parsed.pathname === '/api/auth/verify-code' && req.method === 'POST'){
    // Brute-force d'un code à 6 chiffres : 15 essais / 15 min / IP
    if(rateLimit(req, res, 'verifycode', 15, 15*60*1000)) return;
    readJsonBody(req).then(async ({uid, code}) => {
      res.setHeader('Content-Type','application/json');
      if(!uid || !code){ res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return; }
      const rec = await firebaseRead('email_codes/'+uid);
      if(!rec){ res.end(JSON.stringify({ok:false, error:'no_code'})); return; }
      if(Date.now()-rec.createdAt > 10*60*1000){
        await firebaseWrite('email_codes/'+uid, null);
        res.end(JSON.stringify({ok:false, error:'expired'})); return;
      }
      if((rec.attempts||0) >= 5){
        res.end(JSON.stringify({ok:false, error:'too_many_attempts'})); return;
      }
      if(String(code).trim() !== String(rec.code)){
        await firebaseWrite('email_codes/'+uid+'/attempts', (rec.attempts||0)+1);
        res.end(JSON.stringify({ok:false, error:'wrong_code'})); return;
      }
      // Succès : compte marqué vérifié, code supprimé
      await firebaseWrite('users/'+uid+'/emailVerified', true);
      await firebaseWrite('email_codes/'+uid, null);
      res.end(JSON.stringify({ok:true}));
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  // ── Route /api/referral/me — retourne (et crée si besoin) le code de
  // parrainage d'un utilisateur, + ses stats (filleuls payants, mois gagnés) ──
  // ── Route /api/admin/lookup — retrouver un utilisateur par son ID ──
  // Les règles Firebase empêchent un admin de lire le nœud d'un autre
  // utilisateur depuis le navigateur : seul le serveur (secret admin) le peut.
  // SÉCURITÉ : on ne fait PAS confiance à un "je suis admin" envoyé par le
  // client. On vérifie le jeton d'authentification auprès de Google pour
  // connaître l'identité réelle de l'appelant, PUIS on vérifie qu'il figure
  // bien dans /admins.
  if(parsed.pathname === '/api/admin/lookup' && req.method === 'POST'){
    if(rateLimit(req, res, 'adminlookup', 40, 10*60*1000)) return;
    readJsonBody(req).then(async ({idToken, targetUid}) => {
      res.setHeader('Content-Type','application/json');
      if(!idToken || !isValidUid(targetUid)){
        res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return;
      }
      // 1. Qui appelle réellement ? (le jeton est signé par Google, non falsifiable)
      let callerUid = null, callerEmail = null;
      try{
        const info = await verifyIdToken(idToken);
        callerUid = info && info.localId;
        callerEmail = info && info.email;
      }catch(e){
        res.statusCode=401; res.end(JSON.stringify({ok:false,error:'invalid_token'})); return;
      }
      if(!callerUid){ res.statusCode=401; res.end(JSON.stringify({ok:false,error:'invalid_token'})); return; }

      // 2. Cet appelant est-il admin ?
      // Deux voies possibles, comme côté client et comme dans les règles
      // Firebase : le PROPRIÉTAIRE (reconnu à son email) ou un compte promu
      // présent dans /admins. Ne vérifier que /admins refusait le propriétaire,
      // dont l'identifiant n'y figure pas forcément.
      const isOwner = callerEmail && callerEmail.toLowerCase() === OWNER_EMAIL.toLowerCase();
      const isAdm = isOwner || !!(await firebaseRead('admins/'+callerUid));
      if(!isAdm){ res.statusCode=403; res.end(JSON.stringify({ok:false,error:'not_admin'})); return; }

      // 3. Récupération des infos de la cible
      const u = await firebaseRead('users/'+targetUid) || {};
      const profile = u.profile || {};
      const vip = u.vip || null;

      // Clés VIP associées à cet utilisateur
      let keys = [];
      try{
        const all = await firebaseRead('vip_keys') || {};
        keys = Object.entries(all)
          .filter(([,v]) => v && v.activatedByUid === targetUid)
          .map(([k,v]) => ({ key:k, usedAt:v.usedAt||null, duration:v.duration||null }))
          .sort((a,b)=>(b.usedAt||0)-(a.usedAt||0));
      }catch(e){}

      res.end(JSON.stringify({
        ok: true,
        uid: targetUid,
        email: profile.email || (keys[0] && keys[0].email) || null,
        pseudo: profile.pseudo || null,
        lastSeen: profile.lastSeen || null,
        vip: vip ? { exp: vip.exp||null, key: vip.key||null, activatedAt: vip.activatedAt||null, source: vip.source||null } : null,
        referralStats: u.referralStats || null,
        referredBy: u.referredBy || null,
        keys,
      }));
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  if(parsed.pathname === '/api/referral/me' && req.method === 'POST'){
    readJsonBody(req).then(async ({uid}) => {
      res.setHeader('Content-Type','application/json');
      if(!isValidUid(uid)){ res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return; }
      let code = await firebaseRead('users/'+uid+'/referralCode');
      if(!code){
        // Génère un code, en s'assurant qu'il n'existe pas déjà (collision rare
        // mais possible vu la longueur courte — on boucle jusqu'à en trouver un libre)
        do { code = generateReferralCode(); } while(await firebaseRead('referral_codes/'+code));
        await firebaseWrite('referral_codes/'+code, uid);
        await firebaseWrite('users/'+uid+'/referralCode', code);
      }
      const stats = await firebaseRead('users/'+uid+'/referralStats') || {paidCount:0, monthsEarned:0};
      res.end(JSON.stringify({ok:true, code, paidCount: stats.paidCount||0, monthsEarned: stats.monthsEarned||0, progress: (stats.paidCount||0)%3}));
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  // ── Route /api/referral/link — rattache un nouvel utilisateur à son
  // parrain (appelée une seule fois, juste après inscription/connexion si
  // l'URL contenait ?ref=CODE) ──
  if(parsed.pathname === '/api/referral/link' && req.method === 'POST'){
    readJsonBody(req).then(async ({uid, ref}) => {
      res.setHeader('Content-Type','application/json');
      const code = String(ref||'').trim().toUpperCase();
      if(!isValidUid(uid) || !isValidRefCode(code)){ res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return; }
      const referrerUid = await firebaseRead('referral_codes/'+code);
      if(!referrerUid){ res.end(JSON.stringify({ok:false,error:'code_not_found'})); return; }
      if(referrerUid === uid){ res.end(JSON.stringify({ok:false,error:'self_referral'})); return; }
      const already = await firebaseRead('users/'+uid+'/referredBy');
      if(already){ res.end(JSON.stringify({ok:false,error:'already_linked'})); return; }
      await firebaseWrite('users/'+uid+'/referredBy', referrerUid);
      console.log('[PARRAINAGE]', uid, 'rattaché au parrain', referrerUid, 'via code', code);
      res.end(JSON.stringify({ok:true}));
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  // ── Route /api/vip/activate — activation d'une clé VIP (source de vérité) ──
  // Toute la logique de validation vit ici, jamais côté client :
  // - vérifie que la clé existe, n'est pas désactivée, pas déjà utilisée
  // - calcule l'expiration selon la durée de la clé
  // - marque la clé "utilisée" (bypass les règles Firebase via le secret admin)
  // - écrit le VIP dans users/{uid}/vip (lu en live par le client via un listener)
  if(parsed.pathname === '/api/vip/activate' && req.method === 'POST'){
    // Brute-force de clés : 10 tentatives / 10 min / IP
    if(rateLimit(req, res, 'vip', 10, 10*60*1000)) return;
    readJsonBody(req).then(async ({key, uid, email}) => {
      res.setHeader('Content-Type','application/json');
      if(!key || !uid){ res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return; }
      const k = String(key).trim().toUpperCase();
      // SÉCURITÉ : uid et clé injectés dans un chemin Firebase écrit avec le
      // secret admin — validation stricte obligatoire (injection de chemin).
      if(!isValidUid(uid) || !isValidVipKey(k)){
        res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return;
      }
      const data = await firebaseRead('vip_keys/'+k);
      if(!data){ res.end(JSON.stringify({ok:false, error:'not_found'})); return; }
      if(data.disabled){ res.end(JSON.stringify({ok:false, error:'disabled'})); return; }
      if(data.used){ res.end(JSON.stringify({ok:false, error:'already_used'})); return; }
      const duration = data.duration || 30;
      const exp = Date.now() + duration * 24 * 3600 * 1000;
      // L'écriture du VIP passe EN PREMIER : si elle échoue (secret Firebase
      // invalide/expiré), on n'a pas consommé la clé pour rien et l'utilisateur
      // reçoit une vraie erreur au lieu d'un faux succès.
      try{
        await firebaseWrite('users/'+uid+'/vip', { key: k, exp, activatedAt: Date.now() });
      }catch(werr){
        console.error('[VIP] Activation IMPOSSIBLE — écriture Firebase refusée:', werr.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ok:false, error:'write_failed', detail: werr.message}));
        return;
      }
      await firebaseWrite('vip_keys/'+k, {
        ...data, used: true, usedAt: Date.now(),
        activatedByUid: uid, activatedByEmail: email || null,
      }).catch(e => console.error('[VIP] Marquage de la clé échoué:', e.message));
      console.log('[VIP] Clé', k, 'activée par', email||uid, '— expire le', new Date(exp).toLocaleDateString('fr-FR'));

      // ── Parrainage : crédite le parrain une seule fois par filleul, au
      // premier VIP payant activé (pas à chaque renouvellement) ──
      try{
        const referrerUid = await firebaseRead('users/'+uid+'/referredBy');
        const alreadyCounted = await firebaseRead('users/'+uid+'/referralCounted');
        if(referrerUid && !alreadyCounted){
          await firebaseWrite('users/'+uid+'/referralCounted', true);
          const stats = await firebaseRead('users/'+referrerUid+'/referralStats') || {paidCount:0, monthsEarned:0};
          const newPaidCount = (stats.paidCount||0) + 1;
          let monthsEarned = stats.monthsEarned||0;
          if(newPaidCount % 3 === 0){
            // 3 filleuls payants de plus → 3 mois VIP offerts au parrain,
            // ajoutés à la suite de son VIP en cours s'il en a un
            const refVip = await firebaseRead('users/'+referrerUid+'/vip');
            const base = (refVip && refVip.exp > Date.now()) ? refVip.exp : Date.now();
            const newExp = base + 90 * 24 * 3600 * 1000;
            await firebaseWrite('users/'+referrerUid+'/vip', { exp: newExp, activatedAt: Date.now(), source: 'parrainage' });
            monthsEarned += 3;
            console.log('[PARRAINAGE]', referrerUid, 'reçoit 3 mois VIP offerts (', newPaidCount, 'filleuls payants )');
          }
          await firebaseWrite('users/'+referrerUid+'/referralStats', { paidCount: newPaidCount, monthsEarned });
        }
      }catch(e){ console.error('[PARRAINAGE] erreur crédit parrain:', e.message); }

      res.end(JSON.stringify({ok:true, exp}));
    }).catch(e => { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,error:e.message})); });
    return;
  }

  // Route : état du worker (accès local seulement)
  if(parsed.pathname === '/status'){
    const remoteIp = req.connection?.remoteAddress || '';
    const isLocal  = remoteIp === '::1' || remoteIp === '127.0.0.1' || remoteIp.includes('::ffff:127.');
    if(!isLocal){ res.statusCode=403; res.end('Forbidden'); return; }
    handleStatus(res); return;
  }

  // Route : proxy stream
  // ─── /check — Vérifie si une URL de stream est accessible ───
  if(parsed.pathname === '/check'){
    const target = parsed.query.url;
    if(!target){ res.statusCode=400; res.end('Missing url'); return; }
    const targetUrl = decodeURIComponent(target);
    const parsedTarget = url.parse(targetUrl);
    const hostname = parsedTarget.hostname || '';
    // Blocage IPs privées
    const privateRanges = ['localhost','127.','192.168.','10.','172.16.','0.0.0.0','::1'];
    if(privateRanges.some(r=>hostname===r||hostname.startsWith(r))){
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:false,reason:'private'})); return;
    }
    const lib2 = parsedTarget.protocol==='https:' ? https : http;

    // Helper pour répondre une seule fois (évite double res.end)
    let done=false;
    function respond(ok, extra={}){
      if(done) return; done=true;
      try{
        res.setHeader('Content-Type','application/json');
        res.setHeader('Access-Control-Allow-Origin','*');
        res.end(JSON.stringify({ok, ...extra}));
      }catch(e){}
    }

    const checkOptions = {
      hostname,
      port: parsedTarget.port||(parsedTarget.protocol==='https:'?443:80),
      path: parsedTarget.path || '/',
      method: 'GET', // HEAD refusé par beaucoup de serveurs IPTV
      headers:{
        'User-Agent':'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120',
        // PAS de Range header — certains serveurs IPTV .ts ignorent Range et streament quand même
        // mais d'autres répondent 416 (Range Not Satisfiable) à tort → faux négatif
        'Accept':'*/*',
        'Connection':'close',
      },
      timeout: 10000,
    };

    const checkReq = lib2.request(checkOptions, (checkRes)=>{
      // On a les headers → on peut déjà répondre
      const s = checkRes.statusCode;
      // 200, 204, 206 (partial content), 301, 302 (redirect) = ✅
      // 401, 403 = auth requise mais le serveur répond → stream existe = ✅
      // 404, 410, 500+ = ❌
      const ok = s < 400 || s === 401 || s === 403;
      respond(ok, {status: s});
      // Consommer + fermer proprement (évite ECONNRESET sur le handler error)
      checkRes.resume();
      checkRes.on('end', ()=>{ try{ checkReq.destroy(); }catch(e){} });
    });

    checkReq.on('error',(e)=>{
      // ECONNRESET arrive souvent quand on détruit un flux TS en cours → pas un vrai fail
      if(e.code==='ECONNRESET'&&done) return;
      respond(false, {reason: e.code||e.message});
    });
    checkReq.on('timeout',()=>{
      respond(false, {reason:'timeout'});
      try{ checkReq.destroy(); }catch(e){}
    });
    checkReq.end();
    return;
  }

  if(parsed.pathname === '/proxy'){
    const target = parsed.query.url;
    if(!target){ res.statusCode=400; res.end('Missing url'); return; }
    proxyStream(decodeURIComponent(target), req, res);
    return;
  }

  // ── /relay — Redirection 302 vers la source directe ──────────────
  // Le navigateur se connecte directement à la source IPTV
  // Le serveur ne consomme AUCUNE bande passante pour le stream
  if(parsed.pathname === '/relay'){
    const target = parsed.query.url;
    if(!target){ res.statusCode=400; res.end('Missing url'); return; }
    const targetUrl = decodeURIComponent(target);
    const parsedTarget = url.parse(targetUrl);
    // Sécurité : bloquer les IPs privées ET n'autoriser que http(s). Sans le
    // contrôle de protocole, /relay était une redirection ouverte exploitable
    // pour du phishing (javascript:, data:, ou n'importe quel site tiers).
    if(parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:'){
      res.statusCode = 400; res.end('Bad protocol'); return;
    }
    if(isBlockedHost(parsedTarget.hostname)){
      res.statusCode = 403; res.end('Forbidden'); return;
    }
    // Répondre avec les headers CORS pour que le navigateur accepte la redirection
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    // 302 vers l'URL directe — le navigateur se connecte lui-même
    res.statusCode = 302;
    res.setHeader('Location', targetUrl);
    res.end();
    return;
  }

  // Servir les fichiers statiques
  
// ── Route PayPal IPN ──────────────────────────────
if(parsed.pathname === '/webhook/paypal'){
  if(req.method !== 'POST'){ res.writeHead(405); res.end(); return; }
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    // Vérifier l'IPN avec PayPal
    const verifyBody = 'cmd=_notify-validate&' + body;
    const paypalHost = process.env.PAYPAL_SANDBOX === '1'
      ? 'ipnpb.sandbox.paypal.com'
      : 'ipnpb.paypal.com';

    const verifyReq = require('https').request({
      hostname: paypalHost,
      path: '/cgi-bin/webscr',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(verifyBody)
      }
    }, verifyRes => {
      let verifyData = '';
      verifyRes.on('data', d => verifyData += d);
      verifyRes.on('end', async () => {
        if(verifyData !== 'VERIFIED'){
          console.warn('[PAYPAL] IPN non vérifié:', verifyData);
          res.writeHead(200); res.end('INVALID');
          return;
        }

        // Parser les paramètres IPN
        const params = {};
        body.split('&').forEach(pair => {
          const [k, v] = pair.split('=');
          params[decodeURIComponent(k)] = decodeURIComponent((v||'').replace(/\+/g,' '));
        });

        const status   = params['payment_status'];
        const email    = params['payer_email'];
        const amount   = parseFloat(params['mc_gross'] || '0');
        const txnId    = params['txn_id'];
        // "receiver_email" (ou "business" selon config du compte) = ton propre
        // compte PayPal. Sans cette vérif, quelqu'un pourrait rejouer l'IPN
        // authentique d'un paiement fait à un AUTRE compte PayPal — le
        // _notify-validate confirmerait quand même "VERIFIED" (le paiement a
        // bien eu lieu chez PayPal), sans que l'argent soit jamais arrivé chez toi.
        const receiver = (params['receiver_email'] || params['business'] || '').toLowerCase();

        console.log('[PAYPAL] IPN reçu — status:', status, 'email:', email, 'amount:', amount, 'txn:', txnId);

        const myPaypalEmail = (process.env.PAYPAL_RECEIVER_EMAIL || '').toLowerCase();
        if(myPaypalEmail && receiver !== myPaypalEmail){
          console.warn('[PAYPAL] receiver_email ne correspond pas, ignoré:', receiver);
          res.writeHead(200); res.end('OK'); return;
        }
        if(!txnId){
          console.warn('[PAYPAL] IPN sans txn_id, ignoré');
          res.writeHead(200); res.end('OK'); return;
        }

        // Anti-doublon : PayPal peut renvoyer la même notification plusieurs
        // fois (retry réseau) — sans ça, un seul paiement pourrait générer
        // plusieurs clés VIP et plusieurs emails.
        const already = await firebaseRead('paypal_txns/' + txnId);
        if(already){
          console.log('[PAYPAL] txn déjà traité, ignoré:', txnId);
          res.writeHead(200); res.end('OK'); return;
        }
        await firebaseWrite('paypal_txns/' + txnId, { email, amount, status, ts: Date.now() });

        // Paiement complété — on détermine l'offre selon le montant payé.
        // Seuils avec une petite marge de tolérance (arrondis, frais éventuels).
        if(status === 'Completed' && email){
          const currency = params['mc_currency'] || 'EUR';
          if(currency !== 'EUR'){
            console.warn('[PAYPAL] Devise inattendue, ignoré:', currency, amount);
          } else {
            let duration = null;
            if(amount >= 18) duration = 183;       // Offre 20€ → 6 mois
            else if(amount >= 4.5) duration = 30;   // Offre 5€ → 1 mois

            if(duration){
              const key = generateVIPKey();
              await firebaseWrite('vip_keys/' + key, {
                used: false,
                duration,
                email,
                amountPaid: amount,
                createdAt: Date.now()
              });
              await sendVIPEmail(email, key, duration);
              console.log('[PAYPAL] Clé VIP créée ('+duration+'j) et envoyée:', key, '->', email);
            } else {
              console.warn('[PAYPAL] Montant ne correspond à aucune offre connue:', amount);
            }
          }
        }

        res.writeHead(200); res.end('OK');
      });
    });
    verifyReq.on('error', e => {
      console.error('[PAYPAL] Erreur vérification:', e.message);
      res.writeHead(500); res.end();
    });
    verifyReq.write(verifyBody);
    verifyReq.end();
  });
  return;
}

let filePath = '.' + parsed.pathname;
  if(filePath === './' || filePath === '.') filePath = './index.html';
  if(!path.extname(filePath)) filePath += '.html';

  // Protection traversée de répertoire (path traversal)
  const fullPath = path.resolve(__dirname, filePath);
  if(!fullPath.startsWith(path.resolve(__dirname))){
    res.statusCode=403; res.end('Forbidden'); return;
  }

  serveFile(fullPath, res, req.headers['accept-encoding']);
});

// ─── DÉMARRAGE ───────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       OKIN STREAM — Serveur actif     ║');
  console.log(`║  Site  : http://localhost:${PORT}       ║`);
  console.log(`║  Proxy : http://localhost:${PORT}/proxy ║`);
  console.log(`║  Status: http://localhost:${PORT}/status║`);
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  startCacheWorker();
});

// ─── ANTI-CRASH ──────────────────────────────────────
process.on('uncaughtException',  e => console.error('uncaughtException:', e.message));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));