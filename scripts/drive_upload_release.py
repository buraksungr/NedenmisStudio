#!/usr/bin/env python3
"""Doğrulanmış GitHub Release dosyalarını ön yetkili Drive oturumlarıyla yükler.

Oturum URL'leri NEDENMIS_DRIVE_UPLOAD_SESSIONS ortam değişkenindeki JSON array
içindeki {"name", "url"} kayıtlarından okunur. URL'ler raporlara ve hatalara
yazılmaz. Her dosya için ayrı, tek kullanımlık oturum gerekir.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

CHUNK_SIZE = 16 * 1024 * 1024  # 256 KiB'nin tam katı; Google resumable protokolü.
MAX_ATTEMPTS = 6


class UploadError(RuntimeError):
    pass


def _offset(headers: Any) -> int:
    value = headers.get('Range', '')
    if not value:
        return 0
    try:
        unit, values = value.split('=', 1)
        start, end = values.split('-', 1)
        if unit.strip() != 'bytes' or int(start) != 0:
            raise ValueError
        return int(end) + 1
    except (ValueError, TypeError) as error:
        raise UploadError('Drive geçersiz yükleme offseti döndürdü.') from error


def _request(url: str, data: bytes, headers: dict[str, str]) -> tuple[int, Any, bytes]:
    request = urllib.request.Request(url, data=data, headers=headers, method='PUT')
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        if error.code == 308:
            return error.code, error.headers, error.read()
        body = error.read()
        error.close()
        if error.code in (408, 409, 429) or 500 <= error.code < 600:
            raise ConnectionError(f'Drive geçici HTTP {error.code} hatası.') from error
        # Cevap gövdesi/URL bilinçli olarak loglanmaz; oturum yetkisi korunur.
        raise UploadError(f'Drive kalıcı HTTP {error.code} hatası: {len(body)} bayt yanıt.') from error


def _metadata(status: int, headers: Any, body: bytes) -> dict[str, Any] | None:
    if status not in (200, 201):
        return None
    if headers.get('X-Goog-Upload-Status', 'final') != 'final':
        raise UploadError('Drive tamamlanmamış bir yanıtı final olarak bildirdi.')
    try:
        value = json.loads(body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UploadError('Drive final dosya metadatası okunamadı.') from error
    if not isinstance(value, dict) or not value.get('id'):
        raise UploadError('Drive final yanıtında dosya ID’si yok.')
    return value


def _query(url: str) -> tuple[int, Any, bytes]:
    return _request(url, b'', {
        'Content-Length': '0',
        'X-Goog-Upload-Command': 'query',
    })


def _digest(path: Path, algorithm: str) -> bytes:
    digest = hashlib.new(algorithm, usedforsecurity=False)
    with path.open('rb') as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.digest()


def upload(path: Path, session_url: str, chunk_size: int = CHUNK_SIZE) -> dict[str, Any]:
    size = path.stat().st_size
    if size <= 0:
        raise UploadError(f'{path.name}: boş dosya yüklenemez.')
    if chunk_size <= 0 or chunk_size % (256 * 1024) != 0:
        raise UploadError('Drive parça boyutu 256 KiB’nin pozitif tam katı olmalı.')
    offset = 0
    final: dict[str, Any] | None = None
    with path.open('rb') as source:
        while final is None:
            if offset >= size:
                status, headers, body = _query(session_url)
            else:
                source.seek(offset)
                chunk = source.read(min(chunk_size, size - offset))
                last = offset + len(chunk) == size
                command = 'upload, finalize' if last else 'upload'
                status, headers, body = (0, None, b'')
                for attempt in range(1, MAX_ATTEMPTS + 1):
                    try:
                        status, headers, body = _request(session_url, chunk, {
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': str(len(chunk)),
                            'X-Goog-Upload-Command': command,
                            'X-Goog-Upload-Offset': str(offset),
                            'X-Goog-Upload-Total-Size': str(size),
                        })
                        break
                    except (ConnectionError, TimeoutError, socket.timeout, urllib.error.URLError, OSError) as error:
                        if isinstance(error, UploadError):
                            raise
                        if attempt == MAX_ATTEMPTS:
                            raise UploadError(f'{path.name}: Drive bağlantısı {MAX_ATTEMPTS} denemede tamamlanamadı.') from error
                        time.sleep(min(2 ** attempt, 20))
                        try:
                            status, headers, body = _query(session_url)
                            final = _metadata(status, headers, body)
                            if final is not None:
                                break
                            server_offset = _offset(headers)
                            if server_offset > offset + len(chunk):
                                raise UploadError('Drive istemcinin gönderdiğinden fazla bayt bildirdi.')
                            if server_offset >= offset:
                                # Kaybolan yanıt sonrası kabul edilen baytları tekrar gönderme.
                                offset = server_offset
                                source.seek(offset)
                                remaining = min(chunk_size, size - offset)
                                chunk = source.read(remaining) if remaining else b''
                                if not chunk:
                                    break
                                command = 'upload, finalize' if offset + len(chunk) == size else 'upload'
                        except (ConnectionError, TimeoutError, socket.timeout, urllib.error.URLError, OSError):
                            if attempt == MAX_ATTEMPTS:
                                raise
                if final is not None:
                    break
                if status == 0:
                    continue
            final = _metadata(status, headers, body)
            if final is None:
                if headers.get('X-Goog-Upload-Status', 'active') != 'active':
                    raise UploadError('Drive beklenmeyen resumable-upload durumu döndürdü.')
                server_offset = _offset(headers)
                if server_offset <= offset and status == 308:
                    # Boş Range yalnızca ilk sorgu/ilk parça için geçerlidir.
                    if server_offset != 0 or offset != 0:
                        raise UploadError('Drive yükleme offsetini ilerletmedi.')
                offset = server_offset
    if int(final.get('size', size)) != size:
        raise UploadError(f'{path.name}: Drive boyutu yerel boyutla eşleşmiyor.')
    local_md5 = _digest(path, 'md5')
    remote_md5 = final.get('md5Hash')
    if remote_md5 and base64.b64decode(remote_md5) != local_md5:
        raise UploadError(f'{path.name}: Drive MD5 değeri yerel dosyayla eşleşmiyor.')
    file_id = str(final['id'])
    return {
        'id': file_id,
        'name': str(final.get('name') or path.name),
        'bytes': size,
        'md5Verified': bool(remote_md5),
        'webViewLink': str(final.get('webViewLink') or f'https://drive.google.com/file/d/{file_id}/view'),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--source-run-id', required=True)
    parser.add_argument('--files', nargs='+', required=True)
    parser.add_argument('--chunk-size', type=int, default=CHUNK_SIZE)
    args = parser.parse_args()
    try:
        sessions = json.loads(os.environ.get('NEDENMIS_DRIVE_UPLOAD_SESSIONS', ''))
        if not isinstance(sessions, list):
            raise ValueError
        urls = {str(item['name']): str(item['url']) for item in sessions}
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise UploadError('Geçerli Drive yükleme oturumları sağlanmadı.') from error
    results = []
    for name in args.files:
        path = args.directory / name
        if not path.is_file():
            raise UploadError(f'Yüklenecek dosya yok: {name}')
        if name not in urls:
            raise UploadError(f'Drive oturumu eksik: {name}')
        result = upload(path, urls[name], args.chunk_size)
        result['sha256'] = _digest(path, 'sha256').hex()
        results.append(result)
        print(f"Drive yüklendi: {name} · {result['bytes']} bayt · MD5={result['md5Verified']}", flush=True)
    report = {'ok': True, 'sourceRunId': args.source_run_id, 'files': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['## Google Drive Windows teslim dosyaları', '', f"Doğrulanmış kaynak CI run: {args.source_run_id}", '']
    lines.extend(f"- [{item['name']}]({item['webViewLink']}) — {item['bytes']} bayt · SHA-256 `{item['sha256']}` · MD5 doğrulandı: {item['md5Verified']}" for item in results)
    args.output.with_suffix('.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
