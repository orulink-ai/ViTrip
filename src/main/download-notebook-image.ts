import { nativeImage, net } from 'electron';

/** Fetch only bounded HTTP image bodies in the main process; persist decoded PNG bytes. */
export async function downloadNotebookImage(source: string): Promise<Buffer> {
  const signal = AbortSignal.timeout(12_000);
  let url = new URL(source);
  for (let redirect = 0; redirect <= 5; redirect++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw Error('图片地址必须是 HTTP(S)');
    const response = await net.fetch(url.href, { signal, credentials: 'omit', redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('图片跳转地址缺失');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(`HTTP ${response.status}`);
    }
    if (
      !/^image\/(png|jpe?g|webp|gif|avif|bmp)(?:;|$)/i.test(
        response.headers.get('content-type') ?? '',
      )
    ) {
      await response.body?.cancel();
      throw Error('地址未返回可用图片');
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error('图片内容为空');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) throw Error('图片超过8MB限制');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const decoded = nativeImage.createFromBuffer(Buffer.concat(chunks));
    const dimensions = decoded.getSize();
    if (decoded.isEmpty() || dimensions.width * dimensions.height > 32_000_000)
      throw Error('图片无法解码或尺寸过大');
    const png = decoded.toPNG();
    if (png.length > 8 * 1024 * 1024) throw Error('解码后的图片超过8MB限制');
    return png;
  }
  throw Error('图片跳转次数过多');
}
