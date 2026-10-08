// 두 칸(A/B)에 번갈아 저장한다. 쓰는 도중 꺼져도 직전 칸은 온전하다.
// 칸마다 체크섬을 넣어서, 깨졌으면 반대 칸으로 되돌아간다.
const KEYS = ['bb.save.a', 'bb.save.b'];
const FORMAT = 'baseball-save';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function pack(state, seq) {
  const data = JSON.stringify(state);
  return JSON.stringify({ f: FORMAT, seq, savedAt: Date.now(), sum: hash(data), data });
}

export function unpack(text) {
  try {
    const o = JSON.parse(text);
    if (o.f !== FORMAT || typeof o.data !== 'string' || hash(o.data) !== o.sum) return null;
    const state = JSON.parse(o.data);
    if (!state || typeof state !== 'object' || !Array.isArray(state.teams) || typeof state.v !== 'number') return null;
    return { state, seq: o.seq | 0, savedAt: o.savedAt };
  } catch {
    return null;
  }
}

export function createStore(storage) {
  let seq = 0;
  const read = (k) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  return {
    load() {
      const found = KEYS.map((k) => unpack(read(k))).filter(Boolean).sort((a, b) => b.seq - a.seq);
      if (!found.length) return null;
      seq = found[0].seq;
      return found[0].state;
    },
    save(state) {
      seq++;
      try {
        storage.setItem(KEYS[seq % 2], pack(state, seq));
        return true;
      } catch {
        return false; // 용량 초과/사생활 보호 모드
      }
    },
    clear() {
      try {
        KEYS.forEach((k) => storage.removeItem(k));
      } catch { /* 지울 수 없어도 무시 */ }
      seq = 0;
    },
  };
}

// 백업 파일: 같은 포맷을 그대로 쓴다.
export const exportText = (state) => pack(state, 0);
export function importText(text) {
  const r = unpack(String(text).trim());
  return r ? r.state : null;
}
