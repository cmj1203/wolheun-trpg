export interface NetReport {
  pids: number[];
  samples: number;
  endpoints: string[];
  external: string[];
  publicListeners: string[];
}

const LOOPBACK = /^(127\.0\.0\.1|\[::1\]|::1|localhost)(:\d+)?$/;

function classify(name: string, external: Set<string>, listeners: Set<string>): void {
  const [conn] = name.split(' ');
  if (!conn) return;
  if (conn.includes('->')) {
    const [local, remote] = conn.split('->');
    if (remote && !LOOPBACK.test(remote)) external.add(`${local} -> ${remote}`);
    return;
  }
  if (name.includes('(LISTEN)') && !LOOPBACK.test(conn)) listeners.add(conn);
}

export function watchNetwork(pids: number[], intervalMs = 400): { stop: () => Promise<NetReport> } {
  const endpoints = new Set<string>();
  const external = new Set<string>();
  const listeners = new Set<string>();
  let samples = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      const out = await Bun.$`lsof -nP -a -p ${pids.join(',')} -i`.quiet().nothrow().text();
      samples += 1;
      for (const line of out.split('\n').slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 9) continue;
        const name = cols.slice(8).join(' ');
        endpoints.add(`${cols[7]} ${name}`);
        classify(name, external, listeners);
      }
      await Bun.sleep(intervalMs);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
      return { pids, samples, endpoints: [...endpoints].sort(), external: [...external].sort(), publicListeners: [...listeners].sort() };
    },
  };
}
