// 라인별 팀 전력. 같은 능력치 계산을 경기 엔진, 어시스턴트(포메이션 추천), 승률 예측이 공유한다.
import { clamp } from './util.js';

// 라인(D 수비 / M 중원 / A 공격)이 각 전력 항목에 기여하는 비중
const WD = { D: 1, M: 0.3, A: 0.08, G: 0 };
const WM = { D: 0.2, M: 1, A: 0.35, G: 0 };
const WA = { D: 0.05, M: 0.4, A: 1, G: 0 };
// 4-4-2 기준 합. 포메이션이 달라지면 합이 달라져서 전력 배분이 달라진다.
const ND = 5.36, NM = 5.5, NA = 3.8;

export const defC = (p) => (p.a.tck + p.a.mrk + 0.9 * p.a.pos + 0.4 * (p.a.hea + p.a.str + p.a.pac) + 0.3 * p.a.dec) / 4.4;
export const midC = (p) => (p.a.pas + p.a.vis + p.a.dec + 0.6 * p.a.fst + p.a.wrk + 0.4 * p.a.sta + 0.3 * p.a.tck) / 5.3;
export const attC = (p) => (p.a.fin + p.a.otb + p.a.dri + 0.6 * (p.a.pac + p.a.cmp + p.a.fst) + 0.3 * p.a.crs + 0.2 * p.a.hea) / 5.3;
export const gkC = (p) => (3 * p.a.ref + 3 * p.a.han + 2 * p.a.cmd + p.a.kik + 2 * p.a.pos + p.a.dec) / 12;

// entries: [{ p, line, f }]  f = 숙련도·컨디션·사기 등 곱셈 보정
export function lineStrength(entries) {
  let D = 0, M = 0, A = 0, gk = 3;
  for (const e of entries) {
    if (e.line === 'G') { gk = gkC(e.p) * e.f; continue; }
    D += WD[e.line] * defC(e.p) * e.f;
    M += WM[e.line] * midC(e.p) * e.f;
    A += WA[e.line] * attC(e.p) * e.f;
  }
  return { D: D / ND, M: M / NM, A: A / NA, gk };
}

export const power = (s) => 0.3 * s.D + 0.3 * s.M + 0.3 * s.A + 0.1 * s.gk;

export const MENT = { def: { atk: 0.88, open: 0.9 }, bal: { atk: 1, open: 1 }, atk: { atk: 1.12, open: 1.1 } };
export const PRESS = { low: { lvl: -1, open: 1.04, drain: 0.85, foul: 0.85 }, mid: { lvl: 0, open: 1, drain: 1, foul: 1 }, high: { lvl: 1, open: 0.94, drain: 1.35, foul: 1.2 } };

// 홈 이점: 점유(중원)와 공격에 곱한다. 홈/원정을 번갈아 측정해 홈 44% 무 24% 원정 32%가 되도록 보정했다.
export const HOME_ADV = 1.1;
export const condFactor = (en, mor) => (0.82 + 0.18 * en) * (0.96 + (0.08 * mor) / 100);

// 경기 전 예상: 같은 모델의 기댓값으로 승/무/패 확률을 근사한다 (시뮬레이션 없이 계산)
export function expectedGoals(X, Y, Xt, Yt, homeX) {
  const mx = X.M * (homeX ? HOME_ADV : 1), my = Y.M * (homeX ? 1 : HOME_ADV);
  const pX = clamp((mx * mx) / (mx * mx + my * my) + 0.025 * (PRESS[Xt.pressing].lvl - PRESS[Yt.pressing].lvl), 0.15, 0.85);
  const ax = X.A * (homeX ? HOME_ADV : 1);
  const edgeX = clamp(ax / Y.D, 0.5, 2);
  const per = (pX * 0.185 + (1 - pX) * 0.075) * Math.pow(edgeX, 1.15) * MENT[Xt.mentality].atk * MENT[Yt.mentality].open * PRESS[Yt.pressing].open;
  const kA = 9.45 / ((X.A + Y.A) / 2), kG = 11.84 / ((X.gk + Y.gk) / 2);
  const finF = 0.5 + 0.05 * ax * 1.05 * kA;
  const gkF = clamp(1.55 - 0.055 * Y.gk * kG, 0.7, 1.4);
  const goalsPerChance = clamp(0.1094 * Math.pow(clamp(edgeX, 0.6, 1.6), 0.5) * finF * gkF, 0.01, 0.6);
  return per * 90 * goalsPerChance;
}

export function wdl(lx, ly) {
  const N = 9;
  const pois = (l) => { const o = [Math.exp(-l)]; for (let k = 1; k <= N; k++) o.push((o[k - 1] * l) / k); return o; };
  const a = pois(lx), b = pois(ly);
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const p = a[i] * b[j]; if (i > j) w += p; else if (i === j) d += p; else l += p; }
  const t = w + d + l;
  return { w: w / t, d: d / t, l: l / t };
}
