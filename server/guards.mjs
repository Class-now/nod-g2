// Small in-memory guards for the Nod backend (no dependencies, testable without a server).
//
//  - once(key, fn): a second call with the same key while the first is running or after it
//    succeeded returns the first result, so a double tap on "send" gives exactly one email.
//    A failed call is forgotten, so the user can try again.
//  - limiter(max, windowMs): counts events per key in a rolling window (daily send cap,
//    Claude calls per network address, wrong pairing codes per address).

export function onceMap() {
  const seen = new Map();
  return function once(key, fn) {
    if (seen.has(key)) return seen.get(key).then(r => ({ ...r, already: true }));
    const p = Promise.resolve().then(fn);
    seen.set(key, p);
    p.catch(() => seen.delete(key));
    return p;
  };
}

export function limiter(max, windowMs, now = () => Date.now()) {
  const hits = new Map();
  const live = key => (hits.get(key) || []).filter(t => t > now() - windowMs);
  return {
    // true if the event is allowed (and counts it), false if the key is over the limit
    take(key) {
      const h = live(key);
      if (h.length >= max) { hits.set(key, h); return false; }
      h.push(now()); hits.set(key, h);
      return true;
    },
    blocked: key => live(key).length >= max,
    count: key => live(key).length,
  };
}

export const tooMany = msg => Object.assign(new Error(msg), { status: 429 });
