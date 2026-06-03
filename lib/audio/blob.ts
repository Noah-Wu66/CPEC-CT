import crypto from 'crypto';

const SIGNED_DOWNLOAD_ROUTE = '/api/audio/blob/download';

function getSigningSecret() {
  const secret = process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret) {
    throw new Error('缺少 BLOB_READ_WRITE_TOKEN 环境变量');
  }
  return secret;
}

export function buildSignedDownloadUrl(blobUrl: string, baseUrl: string, expiresInSeconds = 7200) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${blobUrl}:${exp}`;
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return `${baseUrl}${SIGNED_DOWNLOAD_ROUTE}?url=${encodeURIComponent(blobUrl)}&exp=${exp}&sig=${sig}`;
}

export function verifySignedDownloadUrl(blobUrl: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!expNum || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(sig)) {
    return false;
  }

  const payload = `${blobUrl}:${expNum}`;
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

export function fetchPrivateBlob(blobUrl: string) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('缺少 BLOB_READ_WRITE_TOKEN 环境变量');
  }

  return fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
