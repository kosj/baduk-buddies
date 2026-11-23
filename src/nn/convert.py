"""KataGo .bin.gz (model version 8) -> 브라우저용 가중치 (JSON 구조 + float16 바이너리)
BatchNorm은 scale/bias로 미리 합쳐 둔다."""
import gzip, json, sys
import numpy as np

src, out_prefix = sys.argv[1], sys.argv[2]
data = gzip.open(src, 'rb').read()
pos = 0

def tok():
    global pos
    while data[pos:pos+1].isspace():
        pos += 1
    s = pos
    while pos < len(data) and not data[pos:pos+1].isspace():
        pos += 1
    return data[s:pos].decode()

def floats(n):
    global pos
    while data[pos:pos+1] != b'@':
        pos += 1
    assert data[pos:pos+5] == b'@BIN@', data[pos:pos+5]
    pos += 5
    arr = np.frombuffer(data[pos:pos+4*n], dtype='<f4').copy()
    pos += 4*n
    return arr

layers = {}
order = []
def put(name, arr):
    assert name not in layers, name
    layers[name] = arr.astype(np.float32)
    order.append(name)

def conv(key):
    name = tok(); ky, kx, ic, oc, dy, dx = (int(tok()) for _ in range(6))
    assert dy == 1 and dx == 1
    w = floats(ky*kx*ic*oc).reshape(ky, kx, ic, oc)   # HWIO (TF와 같음)
    put(key, w)
    return oc

def bn(key):
    name = tok(); c = int(tok()); eps = float(tok()); hs = int(tok()); hb = int(tok())
    mean = floats(c); var = floats(c)
    scale = floats(c) if hs else np.ones(c, np.float32)
    bias = floats(c) if hb else np.zeros(c, np.float32)
    s = scale / np.sqrt(var + eps)
    put(key + '.s', s); put(key + '.b', bias - mean * s)

def act():
    tok()  # v8: 이름만 있고 ReLU

def matmul(key):
    name = tok(); ic = int(tok()); oc = int(tok())
    put(key, floats(ic*oc).reshape(ic, oc))

def matbias(key):
    name = tok(); c = int(tok())
    put(key, floats(c))

model_name = tok(); version = int(tok())
assert version == 8, version
n_in = int(tok()); n_glob = int(tok())
tname = tok(); nblocks = int(tok()); trunk_c = int(tok()); mid_c = int(tok()); reg_c = int(tok()); dil_c = int(tok()); gp_c = int(tok())
conv('init.conv'); matmul('init.mul')
blocks = []
for i in range(nblocks):
    kind = tok()
    p = f'b{i}'
    if kind == 'ordinary_block':
        tok(); bn(p+'.pre'); act(); conv(p+'.conv1'); bn(p+'.mid'); act(); conv(p+'.conv2')
        blocks.append('o')
    elif kind == 'gpool_block':
        tok(); bn(p+'.pre'); act(); conv(p+'.conv1'); conv(p+'.gconv'); bn(p+'.gbn'); act(); matmul(p+'.gmul'); bn(p+'.mid'); act(); conv(p+'.conv2')
        blocks.append('g')
    else:
        raise ValueError(kind)
bn('tip'); act()
# policy head
tok(); conv('p1.conv'); conv('g1.conv'); bn('g1.bn'); act(); matmul('p.gmul'); bn('p1.bn'); act(); conv('p2.conv'); matmul('p.passmul')
# value head
tok(); conv('v1.conv'); bn('v1.bn'); act(); matmul('v2.mul'); matbias('v2.bias'); act(); matmul('v3.mul'); matbias('v3.bias'); matmul('sv3.mul'); matbias('sv3.bias'); conv('vown.conv')
rest = data[pos:].strip()
print('model', model_name, 'blocks', blocks, 'trunk', trunk_c, 'inputs', n_in, n_glob, 'leftover bytes', len(rest))

# 저장
meta = {'name': model_name, 'version': version, 'inputs': n_in, 'globals': n_glob, 'trunk': trunk_c, 'blocks': blocks, 'layers': []}
blob = []
off = 0
for k in order:
    a = layers[k]
    meta['layers'].append({'k': k, 'shape': list(a.shape), 'off': off, 'n': int(a.size)})
    blob.append(a.astype(np.float16).ravel())
    off += a.size
allw = np.concatenate(blob)
print('params', off, 'max abs', float(np.abs(allw).max()))
f16 = allw.astype('<f2')
assert np.all(np.isfinite(f16))
open(out_prefix + '.bin', 'wb').write(f16.tobytes())
json.dump(meta, open(out_prefix + '.json', 'w'))
np.savez(out_prefix + '_f32.npz', **{k: layers[k] for k in order})
