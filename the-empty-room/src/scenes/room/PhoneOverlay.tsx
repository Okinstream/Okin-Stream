import { useEffect, useRef, useState } from 'react';
import { audio } from '../../audio/engine';
import { CONVERSATION, contactName, type Entry, type MessageCtx } from '../../data/messages';
import { discover } from '../../systems/clues';
import { isEmptied } from '../../systems/session';
import { updateSession, useGame } from '../../state/store';
import { hhmm } from '../../utils/time';

/** Largeurs des messages disparus. Toujours les mêmes. */
const GAP = [62, 38, 71, 45, 55, 30, 66, 48, 40, 74, 35, 58, 44, 69, 52, 33, 60];

export function PhoneOverlay() {
  const memory = useGame((s) => s.memory);
  const session = useGame((s) => s.session);
  const said = !!memory.storyFlags.said;
  const [screen, setScreen] = useState<'lock' | 'call' | 'chat'>(() => (session.call === 'answered' ? 'call' : 'lock'));
  const [callSec, setCallSec] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const notification = useRef(session.notification);

  const ctx: MessageCtx = { phase: session.phase, visit: memory.visitCount, s: { memory, session, scene: 'room' } };
  const entries = CONVERSATION.filter((e) => e.when(ctx));
  const emptied = isEmptied(memory);

  useEffect(() => {
    updateSession({ notification: null });
  }, []);

  // Un appel décroché : personne ne parle.
  useEffect(() => {
    if (screen !== 'call') return;
    const id = window.setInterval(() => setCallSec((n) => n + 1), 1000);
    const end = window.setTimeout(() => {
      updateSession({ call: 'none' });
      setScreen('chat');
    }, 7400);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(end);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'chat') return;
    for (const e of entries) if (e.kind === 'msg' && e.clue) discover(e.clue);
    if (session.phase >= 3) discover('phone-draft');
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [screen]);

  const onScroll = () => {
    const el = listRef.current;
    if (el && el.scrollTop < 30 && session.phase >= 2) discover('phone-gap');
  };

  const lockTime = said ? hhmm(new Date()) : '03:17';

  return (
    <div className="phone" role="dialog" aria-label="téléphone">
      <div className="phone-notch" />
      {screen === 'lock' && (
        <button className="phone-lock" onClick={() => { audio.play('paper', { level: 0.2 }); setScreen('chat'); }}>
          <div className="lock-time">{lockTime}</div>
          <div className="lock-date">{said ? new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'lundi 17 mars'}</div>
          <div className="lock-notes">
            {!emptied && notification.current && (
              <div className={`note ${notification.current === 'Appel manqué' ? 'alarm' : ''}`}>
                <span className="note-from">{contactName(ctx)}</span>
                <span className="note-text">{notification.current}</span>
              </div>
            )}
          </div>
        </button>
      )}

      {screen === 'call' && (
        <div className="phone-call">
          <div className="call-name">{contactName(ctx)}</div>
          <div className="call-time">
            {callSec >= 7 ? 'appel terminé' : `00:0${Math.min(callSec, 9)}`}
          </div>
        </div>
      )}

      {screen === 'chat' && (
        <div className="phone-chat">
          <header className="chat-head">
            <span className="chat-avatar">{emptied ? '' : 'C'}</span>
            <span className="chat-name">{emptied ? '' : contactName(ctx)}</span>
          </header>
          {emptied ? (
            <div className="chat-empty">Aucune conversation</div>
          ) : (
            <div className="chat-list" ref={listRef} onScroll={onScroll}>
              {session.phase >= 2 && (
                <>
                  <div className="chat-day">17 mars 2024</div>
                  {GAP.map((w, i) => (
                    <div key={i} className={`bubble ghost ${i % 3 === 0 ? 'me' : 'them'}`} style={{ width: `${w}%` }} />
                  ))}
                </>
              )}
              {entries.map((e) => (
                <EntryView key={e.id} e={e} ctx={ctx} />
              ))}
            </div>
          )}
          {!emptied && (
            <div className="chat-draft" aria-label="brouillon">
              <span className="draft-text">{session.phase >= 3 && !said ? '·····' : ''}</span>
              <span className="draft-send" aria-hidden>↑</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryView({ e, ctx }: { e: Entry; ctx: MessageCtx }) {
  if (e.kind === 'day') return <div className="chat-day">{e.label(ctx)}</div>;
  if (e.from === 'system') {
    return (
      <div className={`chat-system ${e.alarm ? 'alarm' : ''}`}>
        {e.text} · {e.time(ctx)}
      </div>
    );
  }
  const side = e.from === 'me' ? 'me' : 'them';
  return (
    <div className={`msg ${side}`}>
      {e.from === 'self' && <div className="msg-sender">Moi</div>}
      <div className={`bubble ${side}`}>{e.text}</div>
      <div className="msg-meta">
        {e.time(ctx)}
        {e.status && <span className="msg-status"> · {e.status}</span>}
      </div>
    </div>
  );
}
