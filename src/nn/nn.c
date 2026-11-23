// KataGo b10c128 (model v8) 추론 - WebAssembly SIMD
#include <wasm_simd128.h>

typedef unsigned long usize;
#define EXPORT(name) __attribute__((export_name(name)))

void* memset(void* d, int v, usize n) { unsigned char* p = d; while (n--) *p++ = (unsigned char)v; return d; }
void* memcpy(void* d, const void* s, usize n) { unsigned char* p = d; const unsigned char* q = s; while (n--) *p++ = *q++; return d; }

extern unsigned char __heap_base;
static usize heap_top = 0;
EXPORT("alloc") void* alloc(int bytes) {
  if (!heap_top) heap_top = ((usize)&__heap_base + 15) & ~(usize)15;
  usize p = heap_top;
  heap_top = (heap_top + (usize)bytes + 15) & ~(usize)15;
  usize have = __builtin_wasm_memory_size(0) * 65536UL;
  if (heap_top > have) {
    usize pages = (heap_top - have + 65535) / 65536;
    if (__builtin_wasm_memory_grow(0, pages) == (usize)-1) return 0;
  }
  return (void*)p;
}

#define MAXL 128
static float* L[MAXL];
static int nblocks = 0;
static int kinds[64];
EXPORT("set_layer") void set_layer(int i, float* p) { L[i] = p; }
EXPORT("set_block") void set_block(int i, int kind) { kinds[i] = kind; if (i + 1 > nblocks) nblocks = i + 1; }

enum { TC = 128, INC = 22, GLC = 19 };
static int maxB = 0, maxN = 0;
static float *inp, *glob, *outb, *x, *a, *r, *g, *padA, *padB, *pool, *gb, *v2buf, *pol;

EXPORT("prepare") int prepare(int B, int n) {
  maxB = B; maxN = n;
  usize P = (usize)n * n, PP = (usize)(n + 4) * (n + 4);
  inp = alloc(B * P * INC * 4);
  glob = alloc(B * GLC * 4);
  outb = alloc(B * (2 * P + 8) * 4);
  x = alloc(B * P * TC * 4);
  a = alloc(B * P * TC * 4);
  r = alloc(B * P * TC * 4);
  g = alloc(B * P * TC * 4);
  padA = alloc(B * PP * TC * 4);
  padB = alloc(B * PP * TC * 4);
  pool = alloc(B * 3 * TC * 4);
  gb = alloc(B * TC * 4);
  v2buf = alloc(B * TC * 4);
  pol = alloc(B * P * 4);
  return padB != 0 && pol != 0;
}
EXPORT("inp_ptr") float* inp_ptr(void) { return inp; }
EXPORT("glob_ptr") float* glob_ptr(void) { return glob; }
EXPORT("out_ptr") float* out_ptr(void) { return outb; }

// [B,n,n,C] -> [B,n+2pd,n+2pd,C] 0 테두리
static void pad(const float* in, int C, int n, int pd, int B, float* out) {
  int pn = n + 2 * pd;
  usize tot = (usize)B * pn * pn * C;
  v128_t z = wasm_f32x4_splat(0.f);
  for (usize i = 0; i + 4 <= tot; i += 4) wasm_v128_store(out + i, z);
  for (usize i = tot & ~(usize)3; i < tot; i++) out[i] = 0.f;
  for (int b = 0; b < B; b++)
    for (int y = 0; y < n; y++) {
      const float* s = in + ((usize)b * n * n + (usize)y * n) * C;
      float* d = out + ((usize)b * pn * pn + (usize)(y + pd) * pn + pd) * C;
      int cnt = n * C, i = 0;
      for (; i + 4 <= cnt; i += 4) wasm_v128_store(d + i, wasm_v128_load(s + i));
      for (; i < cnt; i++) d[i] = s[i];
    }
}

#define LD wasm_v128_load
#define ST wasm_v128_store
#define FA wasm_f32x4_add
#define FM wasm_f32x4_mul
#define SP wasm_f32x4_splat

// 합성곱 (입력은 이미 pad 된 상태, 1x1이면 pad 없음). oc는 8의 배수.
static void conv(const float* in, int ic, float* out, int oc, const float* w, int k, int n, int B, int accum) {
  const int pd = k >> 1, pn = n + 2 * pd, P = n * n;
  for (int b = 0; b < B; b++) {
    const float* ib = in + (usize)b * pn * pn * ic;
    float* obase = out + (usize)b * P * oc;
    for (int y = 0; y < n; y++) {
      int xx = 0;
      for (; xx + 4 <= n; xx += 4) {
        float* o = obase + (usize)(y * n + xx) * oc;
        for (int ob = 0; ob < oc; ob += 8) {
          v128_t a0, a1, b0, b1, c0, c1, d0, d1;
          if (accum) {
            a0 = LD(o + ob); a1 = LD(o + ob + 4);
            b0 = LD(o + oc + ob); b1 = LD(o + oc + ob + 4);
            c0 = LD(o + 2 * oc + ob); c1 = LD(o + 2 * oc + ob + 4);
            d0 = LD(o + 3 * oc + ob); d1 = LD(o + 3 * oc + ob + 4);
          } else {
            a0 = a1 = b0 = b1 = c0 = c1 = d0 = d1 = SP(0.f);
          }
          for (int ky = 0; ky < k; ky++) for (int kx = 0; kx < k; kx++) {
            const float* ip = ib + ((usize)(y + ky) * pn + (xx + kx)) * ic;
            const float* wp = w + (usize)(ky * k + kx) * ic * oc + ob;
            const float* ip1 = ip + ic; const float* ip2 = ip + 2 * ic; const float* ip3 = ip + 3 * ic;
            for (int c = 0; c < ic; c++) {
              const v128_t w0 = LD(wp), w1 = LD(wp + 4); wp += oc;
              v128_t s = SP(ip[c]);  a0 = FA(a0, FM(s, w0)); a1 = FA(a1, FM(s, w1));
              s = SP(ip1[c]); b0 = FA(b0, FM(s, w0)); b1 = FA(b1, FM(s, w1));
              s = SP(ip2[c]); c0 = FA(c0, FM(s, w0)); c1 = FA(c1, FM(s, w1));
              s = SP(ip3[c]); d0 = FA(d0, FM(s, w0)); d1 = FA(d1, FM(s, w1));
            }
          }
          ST(o + ob, a0); ST(o + ob + 4, a1);
          ST(o + oc + ob, b0); ST(o + oc + ob + 4, b1);
          ST(o + 2 * oc + ob, c0); ST(o + 2 * oc + ob + 4, c1);
          ST(o + 3 * oc + ob, d0); ST(o + 3 * oc + ob + 4, d1);
        }
      }
      for (; xx < n; xx++) {
        float* o = obase + (usize)(y * n + xx) * oc;
        for (int ob = 0; ob < oc; ob += 8) {
          v128_t a0, a1;
          if (accum) { a0 = LD(o + ob); a1 = LD(o + ob + 4); } else a0 = a1 = SP(0.f);
          for (int ky = 0; ky < k; ky++) for (int kx = 0; kx < k; kx++) {
            const float* ip = ib + ((usize)(y + ky) * pn + (xx + kx)) * ic;
            const float* wp = w + (usize)(ky * k + kx) * ic * oc + ob;
            for (int c = 0; c < ic; c++) {
              const v128_t s = SP(ip[c]);
              a0 = FA(a0, FM(s, LD(wp))); a1 = FA(a1, FM(s, LD(wp + 4))); wp += oc;
            }
          }
          ST(o + ob, a0); ST(o + ob + 4, a1);
        }
      }
    }
  }
}
// 1x1, 출력 1채널
static void conv_to1(const float* in, int ic, const float* w, float* out, int cnt) {
  for (int i = 0; i < cnt; i++) {
    const float* p = in + (usize)i * ic;
    v128_t s = SP(0.f);
    for (int c = 0; c < ic; c += 4) s = FA(s, FM(LD(p + c), LD(w + c)));
    out[i] = wasm_f32x4_extract_lane(s, 0) + wasm_f32x4_extract_lane(s, 1) + wasm_f32x4_extract_lane(s, 2) + wasm_f32x4_extract_lane(s, 3);
  }
}
static void bn_relu(const float* in, int C, const float* s, const float* bb, int cnt, float* out) {
  const v128_t z = SP(0.f);
  for (int i = 0; i < cnt; i++) {
    const float* p = in + (usize)i * C; float* q = out + (usize)i * C;
    for (int c = 0; c < C; c += 4) ST(q + c, wasm_f32x4_max(z, FA(FM(LD(p + c), LD(s + c)), LD(bb + c))));
  }
}
static void add_bias_sp(float* xx, int C, const float* bias, int P, int B) {
  for (int b = 0; b < B; b++) {
    const float* bb = bias + (usize)b * C;
    for (int p = 0; p < P; p++) {
      float* q = xx + ((usize)b * P + p) * C;
      for (int c = 0; c < C; c += 4) ST(q + c, FA(LD(q + c), LD(bb + c)));
    }
  }
}
static void matmul(const float* in, int ic, const float* w, int oc, int B, const float* bias, float* out) {
  for (int b = 0; b < B; b++) {
    const float* iv = in + (usize)b * ic; float* ov = out + (usize)b * oc;
    for (int o = 0; o < oc; o++) ov[o] = bias ? bias[o] : 0.f;
    for (int i = 0; i < ic; i++) {
      const float v = iv[i]; const float* wr = w + (usize)i * oc;
      for (int o = 0; o < oc; o++) ov[o] += v * wr[o];
    }
  }
}
// mean, mean*(sqrt(area)-14)*0.1, max
static void gpool(const float* in, int C, int P, int B, float* out) {
  const float sq = __builtin_sqrtf((float)P), k1 = (sq - 14.f) * 0.1f;
  for (int b = 0; b < B; b++) {
    float* o = out + (usize)b * 3 * C;
    for (int c = 0; c < C; c++) { o[c] = 0.f; o[2 * C + c] = -1e30f; }
    for (int p = 0; p < P; p++) {
      const float* q = in + ((usize)b * P + p) * C;
      for (int c = 0; c < C; c++) { o[c] += q[c]; if (q[c] > o[2 * C + c]) o[2 * C + c] = q[c]; }
    }
    for (int c = 0; c < C; c++) { o[c] /= (float)P; o[C + c] = o[c] * k1; }
  }
}
static void vpool(const float* in, int C, int P, int B, float* out) {
  const float sq = __builtin_sqrtf((float)P), k1 = (sq - 14.f) * 0.1f, k2 = (sq - 14.f) * (sq - 14.f) * 0.01f - 0.1f;
  for (int b = 0; b < B; b++) {
    float* o = out + (usize)b * 3 * C;
    for (int c = 0; c < C; c++) o[c] = 0.f;
    for (int p = 0; p < P; p++) { const float* q = in + ((usize)b * P + p) * C; for (int c = 0; c < C; c++) o[c] += q[c]; }
    for (int c = 0; c < C; c++) { o[c] /= (float)P; o[C + c] = o[c] * k1; o[2 * C + c] = o[c] * k2; }
  }
}

EXPORT("forward") int forward(int B, int n) {
  if (B > maxB || n > maxN) return 0;
  const int P = n * n, cnt = B * P;
  int li = 0;
  pad(inp, INC, n, 2, B, padA);
  conv(padA, INC, x, TC, L[li], 5, n, B, 0); li++;
  matmul(glob, GLC, L[li], TC, B, 0, gb); li++;
  add_bias_sp(x, TC, gb, P, B);
  for (int bi = 0; bi < nblocks; bi++) {
    bn_relu(x, TC, L[li], L[li + 1], cnt, a); li += 2;
    pad(a, TC, n, 1, B, padA);
    if (kinds[bi] == 0) {
      conv(padA, TC, r, TC, L[li], 3, n, B, 0); li++;
      bn_relu(r, TC, L[li], L[li + 1], cnt, r); li += 2;
      pad(r, TC, n, 1, B, padB);
      conv(padB, TC, x, TC, L[li], 3, n, B, 1); li++;
    } else {
      const int RC = 96, GC = 32;
      conv(padA, TC, r, RC, L[li], 3, n, B, 0); li++;
      conv(padA, TC, g, GC, L[li], 3, n, B, 0); li++;
      bn_relu(g, GC, L[li], L[li + 1], cnt, g); li += 2;
      gpool(g, GC, P, B, pool);
      matmul(pool, 3 * GC, L[li], RC, B, 0, gb); li++;
      add_bias_sp(r, RC, gb, P, B);
      bn_relu(r, RC, L[li], L[li + 1], cnt, r); li += 2;
      pad(r, RC, n, 1, B, padB);
      conv(padB, RC, x, TC, L[li], 3, n, B, 1); li++;
    }
  }
  // 줄기 끝
  bn_relu(x, TC, L[li], L[li + 1], cnt, a); li += 2;
  // 정책
  const int PC = 32;
  conv(a, TC, r, PC, L[li], 1, n, B, 0); li++;            // p1
  conv(a, TC, g, PC, L[li], 1, n, B, 0); li++;            // g1
  bn_relu(g, PC, L[li], L[li + 1], cnt, g); li += 2;
  gpool(g, PC, P, B, pool);
  matmul(pool, 3 * PC, L[li], PC, B, 0, gb); li++;
  add_bias_sp(r, PC, gb, P, B);
  bn_relu(r, PC, L[li], L[li + 1], cnt, r); li += 2;
  conv_to1(r, PC, L[li], pol, cnt); li++;                  // p2
  const int stride = 2 * P + 8;
  for (int b = 0; b < B; b++) {
    float* o = outb + (usize)b * stride;
    for (int p = 0; p < P; p++) o[p] = pol[b * P + p];
  }
  matmul(pool, 3 * PC, L[li], 1, B, 0, gb); li++;          // pass
  for (int b = 0; b < B; b++) outb[(usize)b * stride + P] = gb[b];
  // 가치
  conv(a, TC, g, PC, L[li], 1, n, B, 0); li++;            // v1
  bn_relu(g, PC, L[li], L[li + 1], cnt, g); li += 2;
  vpool(g, PC, P, B, pool);
  matmul(pool, 3 * PC, L[li], 80, B, L[li + 1], v2buf); li += 2;
  for (int i = 0; i < B * 80; i++) if (v2buf[i] < 0.f) v2buf[i] = 0.f;
  matmul(v2buf, 80, L[li], 3, B, L[li + 1], gb); li += 2;  // v3
  for (int b = 0; b < B; b++) for (int j = 0; j < 3; j++) outb[(usize)b * stride + P + 1 + j] = gb[b * 3 + j];
  matmul(v2buf, 80, L[li], 4, B, L[li + 1], gb); li += 2;  // sv3
  for (int b = 0; b < B; b++) for (int j = 0; j < 4; j++) outb[(usize)b * stride + P + 4 + j] = gb[b * 4 + j];
  conv_to1(g, PC, L[li], pol, cnt); li++;                  // ownership
  for (int b = 0; b < B; b++) {
    float* o = outb + (usize)b * stride + P + 8;
    for (int p = 0; p < P; p++) o[p] = pol[b * P + p];
  }
  return li;
}
