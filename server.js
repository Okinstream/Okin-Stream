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
//    AF_KEY=ta_clé_api_sports
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

// ── Firebase write ────────────────────────────────
function firebaseWrite(path, data){
  return new Promise((resolve, reject) => {
    const dbUrl = process.env.FIREBASE_DB_URL;
    const secret = process.env.FIREBASE_SECRET;
    if(!dbUrl) return resolve();
    const url = dbUrl + '/' + path + '.json?auth=' + secret;
    const body = JSON.stringify(data);
    const lib = url.startsWith('https') ? require('https') : require('http');
    const parsed = require('url').parse(url);
    const req = lib.request({
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve); });
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
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 8080;

// ─── VARIABLES D'ENV ─────────────────────────────────
const FD_KEY       = process.env.FD_KEY       || '';
const AF_KEY       = process.env.AF_KEY       || '';
const YT_KEY        = process.env.YT_KEY       || '';
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

  // Toutes les 5 minutes
  setInterval(runCacheWorker, 5 * 60 * 1000);

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

function serveFile(filePath, res){
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
function proxyStream(targetUrl, req, res, redirectCount){
  if(!redirectCount) redirectCount = 0;
  if(redirectCount > 5){ res.statusCode=508; res.end('Too many redirects'); return; }

  const parsed = url.parse(targetUrl);
  const hostname = parsed.hostname || '';
  const privateRanges = ['localhost','127.','192.168.','10.','172.16.','0.0.0.0','::1'];
  if(privateRanges.some(r => hostname === r || hostname.startsWith(r))){
    res.statusCode = 403; res.end('Forbidden: private range'); return;
  }
  if(!parsed.protocol?.startsWith('http')){ res.statusCode=400; res.end('Bad protocol'); return; }

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

  // ── Route /api/vip/activate — activation d'une clé VIP (source de vérité) ──
  // Toute la logique de validation vit ici, jamais côté client :
  // - vérifie que la clé existe, n'est pas désactivée, pas déjà utilisée
  // - calcule l'expiration selon la durée de la clé
  // - marque la clé "utilisée" (bypass les règles Firebase via le secret admin)
  // - écrit le VIP dans users/{uid}/vip (lu en live par le client via un listener)
  if(parsed.pathname === '/api/vip/activate' && req.method === 'POST'){
    readJsonBody(req).then(async ({key, uid, email}) => {
      res.setHeader('Content-Type','application/json');
      if(!key || !uid){ res.statusCode=400; res.end(JSON.stringify({ok:false,error:'invalid_input'})); return; }
      const k = String(key).trim().toUpperCase();
      const data = await firebaseRead('vip_keys/'+k);
      if(!data){ res.end(JSON.stringify({ok:false, error:'not_found'})); return; }
      if(data.disabled){ res.end(JSON.stringify({ok:false, error:'disabled'})); return; }
      if(data.used){ res.end(JSON.stringify({ok:false, error:'already_used'})); return; }
      const duration = data.duration || 30;
      const exp = Date.now() + duration * 24 * 3600 * 1000;
      await firebaseWrite('vip_keys/'+k, {
        ...data, used: true, usedAt: Date.now(),
        activatedByUid: uid, activatedByEmail: email || null,
      });
      await firebaseWrite('users/'+uid+'/vip', { key: k, exp, activatedAt: Date.now() });
      console.log('[VIP] Clé', k, 'activée par', email||uid, '— expire le', new Date(exp).toLocaleDateString('fr-FR'));
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
    // Sécurité : bloquer les IPs privées
    const parsedTarget = url.parse(targetUrl);
    const hostname2 = parsedTarget.hostname || '';
    const privateRanges = ['localhost','127.','192.168.','10.','172.16.','0.0.0.0','::1'];
    if(privateRanges.some(r => hostname2 === r || hostname2.startsWith(r))){
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

  serveFile(fullPath, res);
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