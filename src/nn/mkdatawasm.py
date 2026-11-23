# 가중치를 데이터 세그먼트로 담은 WebAssembly 모듈 만들기 (메모리 "mem" 내보냄)
import sys
data = open(sys.argv[1], 'rb').read()
def leb(n):
    out = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)
def section(sid, payload): return bytes([sid]) + leb(len(payload)) + payload
pages = (len(data) + 65535) // 65536
mem = section(5, leb(1) + b'\x00' + leb(pages))
exp = section(7, leb(1) + leb(3) + b'mem' + b'\x02' + leb(0))
dat = section(11, leb(1) + b'\x00' + b'\x41\x00\x0b' + leb(len(data)) + data)
mod = b'\x00asm\x01\x00\x00\x00' + mem + exp + dat
open(sys.argv[2], 'wb').write(mod)
print('wasm bytes', len(mod), 'data', len(data), 'pages', pages)
