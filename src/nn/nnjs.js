// 신경망 래퍼 (워커와 Node 공통). wasm 바이트와 가중치(f16)를 받아 추론기를 만든다.
const KataNN = (() => {
  const f16tab = (() => {
    const t = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
      const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      t[h] = e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024);
    }
    return t;
  })();
  async function create(wasmBytes, meta, weightsU16, maxB, maxN) {
    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    const ex = instance.exports;
    meta.blocks.forEach((k, i) => ex.set_block(i, k === 'g' ? 1 : 0));
    for (let i = 0; i < meta.layers.length; i++) {
      const l = meta.layers[i];
      const ptr = ex.alloc(l.n * 4);
      if (!ptr) throw new Error('메모리 부족');
      const dst = new Float32Array(ex.memory.buffer, ptr, l.n);
      for (let j = 0; j < l.n; j++) dst[j] = f16tab[weightsU16[l.off + j]];
      ex.set_layer(i, ptr);
    }
    if (!ex.prepare(maxB, maxN)) throw new Error('메모리 부족');
    const io = () => ({
      inp: new Float32Array(ex.memory.buffer, ex.inp_ptr(), maxB * maxN * maxN * 22),
      glob: new Float32Array(ex.memory.buffer, ex.glob_ptr(), maxB * 19),
      out: new Float32Array(ex.memory.buffer, ex.out_ptr(), maxB * (2 * maxN * maxN + 8))
    });
    return {
      maxB, maxN, io,
      // inp: [B][n][n][22], glob: [B][19] 를 io()에 채운 뒤 호출. 결과는 io().out, 판마다 2P+8 칸.
      run(B, n) { return ex.forward(B, n); }
    };
  }
  return { create, f16tab };
})();
if (typeof module !== 'undefined') module.exports = KataNN;
