"""numpy 참조 구현: 입력 평면(H,W,22)+전역(19) -> 정책/가치/소유권"""
import json, sys
import numpy as np

W = dict(np.load('kata_f32.npz'))
meta = json.load(open('kata.json'))
relu = lambda x: np.maximum(x, 0)

def conv(x, w):
    H, Wd, _ = x.shape; kh, kw, ic, oc = w.shape; ph, pw = kh // 2, kw // 2
    xp = np.pad(x, ((ph, ph), (pw, pw), (0, 0)))
    out = np.zeros((H, Wd, oc), np.float32)
    for dy in range(kh):
        for dx in range(kw):
            out += xp[dy:dy + H, dx:dx + Wd, :] @ w[dy, dx]
    return out

def bn(x, k): return x * W[k + '.s'] + W[k + '.b']

def gpool(x):
    area = x.shape[0] * x.shape[1]; m = x.mean(axis=(0, 1)); sq = np.sqrt(area)
    return np.concatenate([m, m * (sq - 14) * 0.1, x.max(axis=(0, 1))])

def vpool(x):
    area = x.shape[0] * x.shape[1]; m = x.mean(axis=(0, 1)); sq = np.sqrt(area)
    return np.concatenate([m, m * (sq - 14) * 0.1, m * ((sq - 14) ** 2 * 0.01 - 0.1)])

def forward(sp, gl):
    x = conv(sp, W['init.conv']) + gl @ W['init.mul']
    for i, kind in enumerate(meta['blocks']):
        p = f'b{i}'
        a = relu(bn(x, p + '.pre'))
        r = conv(a, W[p + '.conv1'])
        if kind == 'g':
            g = relu(bn(conv(a, W[p + '.gconv']), p + '.gbn'))
            r = r + gpool(g) @ W[p + '.gmul']
        r = relu(bn(r, p + '.mid'))
        x = x + conv(r, W[p + '.conv2'])
    t = relu(bn(x, 'tip'))
    p1 = conv(t, W['p1.conv'])
    g1 = relu(bn(conv(t, W['g1.conv']), 'g1.bn'))
    gp = gpool(g1)
    p1 = relu(bn(p1 + gp @ W['p.gmul'], 'p1.bn'))
    pol = conv(p1, W['p2.conv'])[:, :, 0]
    pas = (gp @ W['p.passmul'])[0]
    v1 = relu(bn(conv(t, W['v1.conv']), 'v1.bn'))
    v2 = relu(vpool(v1) @ W['v2.mul'] + W['v2.bias'])
    v3 = v2 @ W['v3.mul'] + W['v3.bias']
    sv3 = v2 @ W['sv3.mul'] + W['sv3.bias']
    own = np.tanh(conv(v1, W['vown.conv'])[:, :, 0])
    return pol, pas, v3, sv3, own

def empty_inputs(n, black_to_move=True, komi=6.5):
    sp = np.zeros((n, n, 22), np.float32); sp[:, :, 0] = 1
    gl = np.zeros(19, np.float32)
    self_komi = -komi if black_to_move else komi
    gl[5] = self_komi / 20
    # 홀수 면적 판의 덤 파동
    import math
    kf = math.floor((self_komi - 1) / 2) * 2 + 1
    d = min(2, max(0, self_komi - kf))
    gl[18] = d if d < 0.5 else (1 - d if d < 1.5 else d - 2)
    return sp, gl

if __name__ == '__main__':
    for n in (9, 19):
        sp, gl = empty_inputs(n)
        pol, pas, v3, sv3, own = forward(sp, gl)
        logits = np.concatenate([pol.ravel(), [pas]])
        pr = np.exp(logits - logits.max()); pr /= pr.sum()
        top = np.argsort(-pr)[:6]
        e = np.exp(v3 - v3.max()); e /= e.sum()
        print(f'{n}x{n} empty, black to move: win {e[0]:.3f} loss {e[1]:.3f} nores {e[2]:.3f} scoreMean {sv3[0]*20:.2f} lead {sv3[2]*20 if len(sv3)>2 else 0:.2f}')
        print('  top moves:', [('pass' if i == n*n else (i % n, i // n), round(float(pr[i]), 3)) for i in top])
        print('  sv3 len', len(sv3), 'gl', gl[5], gl[18])
