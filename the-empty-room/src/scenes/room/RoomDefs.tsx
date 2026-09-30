/** Toutes les lumières et matières de la pièce. */
export function RoomDefs() {
  return (
    <defs>
      <linearGradient id="backWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0d1320" />
        <stop offset="0.55" stopColor="#111a2a" />
        <stop offset="1" stopColor="#0a0f18" />
      </linearGradient>
      <linearGradient id="wallLeft" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor="#0c1220" />
        <stop offset="1" stopColor="#05070b" />
      </linearGradient>
      <linearGradient id="wallRight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#0a0f1a" />
        <stop offset="1" stopColor="#040609" />
      </linearGradient>
      <linearGradient id="ceiling" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#0a0e16" />
        <stop offset="1" stopColor="#030406" />
      </linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0b0f18" />
        <stop offset="1" stopColor="#040509" />
      </linearGradient>

      <linearGradient id="moonShaft" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor="#b9c8e6" stopOpacity="0.16" />
        <stop offset="0.6" stopColor="#9fb2d6" stopOpacity="0.06" />
        <stop offset="1" stopColor="#9fb2d6" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="moonPatch" cx="0.45" cy="0.3" r="0.7">
        <stop offset="0" stopColor="#c3d0ea" stopOpacity="0.14" />
        <stop offset="1" stopColor="#c3d0ea" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lampPool">
        <stop offset="0" stopColor="#c9a45c" stopOpacity="0.16" />
        <stop offset="0.6" stopColor="#c9a45c" stopOpacity="0.05" />
        <stop offset="1" stopColor="#c9a45c" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lampGlow">
        <stop offset="0" stopColor="#e8c887" stopOpacity="0.35" />
        <stop offset="0.35" stopColor="#c9a45c" stopOpacity="0.1" />
        <stop offset="1" stopColor="#c9a45c" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="shadeOn" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6d5832" />
        <stop offset="1" stopColor="#d9bb7b" />
      </linearGradient>
      <radialGradient id="focusGlow">
        <stop offset="0" stopColor="#e8e4da" stopOpacity="0.07" />
        <stop offset="1" stopColor="#e8e4da" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="doorSpill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d2def5" stopOpacity="0.12" />
        <stop offset="1" stopColor="#d2def5" stopOpacity="0" />
      </linearGradient>

      <radialGradient id="tableTop" cx="0.35" cy="0.4" r="0.8">
        <stop offset="0" stopColor="#1a2231" />
        <stop offset="1" stopColor="#0b0f17" />
      </radialGradient>
      <radialGradient id="screenGlow">
        <stop offset="0" stopColor="#b9cdf0" stopOpacity="0.45" />
        <stop offset="1" stopColor="#b9cdf0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cupBody" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#c9c4b8" />
        <stop offset="0.5" stopColor="#8d897f" />
        <stop offset="1" stopColor="#3b3a37" />
      </linearGradient>
      <radialGradient id="clockFace" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stopColor="#a8a399" />
        <stop offset="1" stopColor="#5d5a54" />
      </radialGradient>
      <linearGradient id="doorPanel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#141b28" />
        <stop offset="1" stopColor="#0c111a" />
      </linearGradient>
      <linearGradient id="sepia" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8f7650" />
        <stop offset="1" stopColor="#4d3b25" />
      </linearGradient>

      <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0a1322" />
        <stop offset="1" stopColor="#1b2840" />
      </linearGradient>
      <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#101b30" />
        <stop offset="0.65" stopColor="#3a3f52" />
        <stop offset="1" stopColor="#c9a45c" />
      </linearGradient>
      <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#dfe8ff" stopOpacity="0.07" />
        <stop offset="0.4" stopColor="#dfe8ff" stopOpacity="0" />
        <stop offset="0.7" stopColor="#dfe8ff" stopOpacity="0.03" />
        <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="curtain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#e8e4da" stopOpacity="0.02" />
        <stop offset="0.5" stopColor="#e8e4da" stopOpacity="0.1" />
        <stop offset="1" stopColor="#e8e4da" stopOpacity="0.04" />
      </linearGradient>
      <pattern id="rainPattern" width="23" height="61" patternUnits="userSpaceOnUse">
        <line x1="4" y1="0" x2="1" y2="17" stroke="#b8c6e0" strokeOpacity="0.22" strokeWidth="0.8" />
        <line x1="17" y1="30" x2="14" y2="44" stroke="#b8c6e0" strokeOpacity="0.14" strokeWidth="0.7" />
      </pattern>

      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>
  );
}
